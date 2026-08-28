// LE CIRCUIT COMPLET, DE BOUT EN BOUT, EN PRODUCTION.
//
//   un clubbeur depose (PWA)
//     -> le pont aller le fait remonter (push-submission -> track-post)
//        AVEC l'identifiant de sa story
//     -> Noctify valide depuis le back-office B2B (/api/credit-clubbeur)
//     -> le pont retour credite le clubbeur (credit-story)
//     -> ses points existent dans la base de la PWA
//
// C'est la chaine mise en place le 2026-08-15. Aucun autre chemin ne
// paie un clubbeur : si elle casse, personne n'est credite et rien ne
// le signale cote PWA.
//
// ⚠️ Le rattachement a une soiree depend des HORAIRES du club : hors
// plage, le B2B repond 409 « aucune soiree en cours ». Le test elargit
// donc temporairement l'horaire du jour, puis le REMET, meme en cas
// d'echec (bloc finally).
//
// Tout est nettoye : compte jetable, story, soumission, grants.

const fs = require("fs");
const B = require("./lib_b2b.cjs");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
// Lit une reponse sans casser si Vercel renvoie du HTML au lieu de JSON.
// ⚠️ Vercel oppose son controle anti-robot au `fetch` de Node — meme
// avec un User-Agent de navigateur, il fingerprint plus bas. Il repond
// alors une page HTML en 403. `curl`, lui, passe. Ce n'est PAS un defaut
// du produit : depuis un vrai navigateur (admin.js) la route repond
// normalement. On appelle donc les routes B2B par curl.
const { execFileSync } = require("child_process");
function postB2B(chemin, corps, jeton) {
  const f = `${__dirname}/_e2e_${Date.now()}.json`;
  fs.writeFileSync(f, JSON.stringify(corps));
  const args = ["-s", "-w", "\n%{http_code}", "-X", "POST", `${B.PROD}${chemin}`,
    "-H", "Content-Type: application/json", "--data-binary", "@" + f];
  if (jeton) args.push("-H", `Authorization: Bearer ${jeton}`);
  const brut = execFileSync("curl", args, { encoding: "utf8" });
  fs.unlinkSync(f);
  const i = brut.lastIndexOf("\n");
  const statut = Number(brut.slice(i + 1).trim());
  let corpsRep = {};
  try { corpsRep = JSON.parse(brut.slice(0, i)); } catch { corpsRep = { _brut: brut.slice(0, 100) }; }
  return { statut, corps: corpsRep };
}

async function lire(r) {
  const t = await r.text();
  try { return JSON.parse(t); } catch { return { _html: t.slice(0, 120) }; }
}
const V = require("../../06-pwa-clubbeurs/outils/lib_vn.cjs");

const MIRAGE_B2B = "128cfa6d-b8aa-4ff8-8598-79cb401c321e";
const ADMIN = "viralnight001@gmail.com";

const trace = [];
const dire = (ok, t) => { trace.push([ok, t]); console.log((ok ? "  OK  | " : " FAIL | ") + t); };

function anonPwa() {
  const p = "C:/Users/stepp/Downloads/Noctify-ClaudeCode-FULL/06-pwa-clubbeurs/.env.local";
  for (const l of fs.readFileSync(p, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/)) {
    if (l.trim().startsWith("VITE_SUPABASE_ANON_KEY=")) return l.split("=").slice(1).join("=").trim();
  }
  return null;
}

async function jetonAdminB2B() {
  const [, lien] = await B.admin("/auth/v1/admin/generate_link", "POST", {
    type: "magiclink", email: ADMIN, options: { redirectTo: B.PROD + "/admin.html" },
  });
  const r = await fetch(lien.action_link, { redirect: "manual" });
  const p = new URLSearchParams((r.headers.get("location") || "").split("#")[1] || "");
  return p.get("access_token");
}

(async () => {
  const jour = new Date().getUTCDay();
  const avant = B.sql(`select is_open, opens_at, closes_at from establishment_opening_hours
                        where establishment_id='${MIRAGE_B2B}' and weekday=${jour}`)[0];
  const etaitOuvert = avant && (avant.is_open === true || avant.is_open === "true");
  const decrire = (h) => (h && (h.is_open === true || h.is_open === "true")
    ? `${h.opens_at} - ${h.closes_at}` : "ferme");
  const club = V.sql("select id from public.clubs where slug='mirage-brussels'")[0];

  let c = null;
  let soumission = null;

  try {
    // ⚠️ Elargir l'OUVERTURE ne suffit pas : la fenetre est
    // [opens_at, closes_at] et fermait a 06h — 22h restait dehors, et
    // le B2B repondait « aucune soiree en cours ». On ouvre la
    // journee entiere, et on force is_open : un jour marque ferme ne
    // porte aucune soiree, quels que soient ses horaires.
    if (avant) {
      B.sql(`update establishment_opening_hours
                set is_open=true, opens_at='00:00:00', closes_at='23:59:00'
              where establishment_id='${MIRAGE_B2B}' and weekday=${jour}`);
      console.log(`horaire du jour ouvert en grand (etait ${decrire(avant)})\n`);
    } else {
      // ⚠️ Le club n'a pas une ligne par jour : Le Mirage n'ouvre que le
      // vendredi et le samedi. Un dimanche il n'y a rien a elargir, et
      // la version precedente de ce test ne faisait alors RIEN — puis
      // echouait sur « aucune soiree en cours » sans dire pourquoi.
      B.sql(`insert into establishment_opening_hours
                (establishment_id, weekday, is_open, opens_at, closes_at)
             values ('${MIRAGE_B2B}', ${jour}, true, '00:00:00', '23:59:00')`);
      console.log(`aucun horaire ce jour-la (${jour}) : ligne posee pour le test\n`);
    }

    // --- 1. Un clubbeur depose ---------------------------------------
    const email = `e2e-chaine-${Date.now()}@viralnight.test`;
    const mdp = "E2e-" + Math.random().toString(36).slice(2) + "A1!";
    const [st, u] = await V.admin("/auth/v1/admin/users", "POST", { email, password: mdp, email_confirm: true });
    if (st >= 400) throw new Error("compte : " + JSON.stringify(u));
    c = { uid: u.id, email };
    V.sql(`insert into public.users (id, email, handle) values ('${u.id}', '${email}', 'chaine_test')`);

    const rj = await fetch(`${V.BASE}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: anonPwa(), "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: mdp }),
    });
    const sess = await rj.json();
    if (!sess.access_token) throw new Error("session clubbeur : " + JSON.stringify(sess));

    const url = `https://www.instagram.com/reel/Chaine${Date.now().toString(36)}/`;
    const rpc = await fetch(`${V.BASE}/rest/v1/rpc/submit_story`, {
      method: "POST",
      headers: { apikey: anonPwa(), Authorization: `Bearer ${sess.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_club: club.id, p_kind: "reel", p_views: 0, p_proof: null, p_url: url }),
    });
    const storyId = await rpc.json();
    dire(rpc.ok && typeof storyId === "string", `le clubbeur depose son contenu (${rpc.status})`);
    if (!rpc.ok) throw new Error("submit_story : " + JSON.stringify(storyId));

    // --- 2. Le pont aller ---------------------------------------------
    const push = await fetch(`${V.BASE}/functions/v1/push-submission`, {
      method: "POST",
      headers: { apikey: anonPwa(), Authorization: `Bearer ${sess.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ story_id: storyId }),
    });
    const outPush = await push.json();
    dire(push.ok && outPush.ok, `le contenu remonte vers le B2B (${push.status} ${JSON.stringify(outPush).slice(0, 60)})`);

    soumission = B.sql(`select id, external_story_id, status from submissions
                         where external_story_id = '${storyId}'`)[0];
    dire(!!soumission, "la soumission existe cote B2B");
    dire(soumission?.external_story_id === storyId,
      "⚠️ elle porte l'identifiant de la story — sans lui, personne a crediter");

    // --- 3. Noctify valide depuis le back-office --------------------
    const jeton = await jetonAdminB2B();
    const rep = postB2B("/api/credit-clubbeur",
      { submissionId: soumission.id, approve: true, points: 180, views: 5200 }, jeton);
    const out = rep.corps;
    dire(rep.statut === 200 && out.ok, `la validation appelle le pont retour (${rep.statut} ${JSON.stringify(out).slice(0, 80)})`);
    dire(out.awarded === 180, `180 pts annonces par le pont (recu : ${out.awarded})`);

    // --- 4. Les points existent-ils vraiment ? -------------------------
    const s = V.sql(`select s.verified, s.awarded_points, s.views, g.amount,
                            round(extract(epoch from (g.unlocks_at - now()))/3600.0,1)::text as heures
                       from public.story_events s
                       left join public.point_grants g on g.story_id = s.id
                      where s.id = '${storyId}'`)[0];
    dire(s?.verified === true, "le contenu est valide dans la base de la PWA");
    dire(s?.awarded_points === 180, `180 pts inscrits (${s?.awarded_points})`);
    dire(s?.views === 5200, `les vues saisies au back-office sont conservees (${s?.views})`);
    dire(Number(s?.amount) === 180, `un grant de ${s?.amount} pts, debloquable dans ${s?.heures} h`);

    const usr = V.sql(`select points_balance, lifetime_points from public.users where id='${c.uid}'`)[0];
    dire(usr?.lifetime_points === 180, `cumul a vie du clubbeur : ${usr?.lifetime_points}`);
    dire(usr?.points_balance === 0, `solde depensable a 0, le blocage tient (${usr?.points_balance})`);

    // --- 5. Une seconde validation ne doit rien redonner ---------------
    const rep2 = postB2B("/api/credit-clubbeur",
      { submissionId: soumission.id, approve: true, points: 180 }, jeton);
    const out2 = rep2.corps;
    const usr2 = V.sql(`select lifetime_points from public.users where id='${c.uid}'`)[0];
    dire(out2.skipped === "deja_credite" && usr2.lifetime_points === 180,
      `un second appel ne recredite pas (${JSON.stringify(out2).slice(0, 50)}, cumul ${usr2.lifetime_points})`);

    // --- 6. Sans session admin, la route refuse ------------------------
    const sansJeton = postB2B("/api/credit-clubbeur", { submissionId: soumission.id, approve: true });
    dire(sansJeton.statut === 401, `sans session admin : refuse (${sansJeton.statut})`);
  } finally {
    if (soumission) B.sql(`delete from submissions where id='${soumission.id}'`);
    if (c) {
      V.sql(`delete from public.leaderboard_entries where user_id='${c.uid}';
             delete from public.point_grants where user_id='${c.uid}';
             delete from public.view_claims where user_id='${c.uid}';
             delete from public.story_events where user_id='${c.uid}';
             delete from public.users where id='${c.uid}';`);
      await V.admin(`/auth/v1/admin/users/${c.uid}`, "DELETE");
    }
    if (avant) {
      const t = (v) => (v ? `'${v}'` : "null");
      B.sql(`update establishment_opening_hours
                set is_open=${etaitOuvert}, opens_at=${t(avant.opens_at)}, closes_at=${t(avant.closes_at)}
              where establishment_id='${MIRAGE_B2B}' and weekday=${jour}`);
      console.log(`\nhoraire du jour remis a ${decrire(avant)}`);
    } else {
      B.sql(`delete from establishment_opening_hours
              where establishment_id='${MIRAGE_B2B}' and weekday=${jour}`);
      console.log(`\nligne d'horaire posee par le test : retiree`);
    }
    console.log("donnees de test supprimees");
  }

  const ko = trace.filter(([ok]) => !ok);
  console.log(`\n=== ${trace.length - ko.length}/${trace.length} verifications au vert ===`);
  ko.forEach(([, t]) => console.log("  ECHEC :", t));
  process.exit(ko.length ? 1 : 0);
})().catch((e) => { console.error("\nECHEC:", e.message); process.exit(1); });
