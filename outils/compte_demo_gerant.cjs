// UN COMPTE GERANT DE DEMONSTRATION, AVEC DE VRAIES COURBES.
//
//   node outils/compte_demo_gerant.cjs                 (cree/remplit le club de demo)
//   VN_EMAIL=… VN_NOM=… node outils/compte_demo_gerant.cjs
//
// Julien, 18/09/2026 : « cree-moi un compte que je puisse voir ce que ca donne
// avec les graphiques ». Le tableau de bord lit submissions, qr_scans et
// reward_redemptions : on y pose 30 jours d'activite plausible (plus de monde le
// vendredi et le samedi), rien d'autre. Les donnees portent le nom du club de
// demo : aucune confusion possible avec un vrai club.

const B = require("./lib_b2b.cjs");

const EMAIL = process.env.VN_EMAIL || "julien.steppe123@gmail.com";
const NOM = process.env.VN_NOM || "Mirage Démo";
const JOURS = Number(process.env.VN_JOURS || 30);

function hasard(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

(async () => {
  // 1. Le club : celui de l'email, ou un nouveau.
  let [etab] = B.sql(`select e.id from establishments e join establishment_owners o on o.establishment_id = e.id where o.email = '${EMAIL}'`);
  if (!etab) {
    const [, l] = await B.admin("/auth/v1/admin/generate_link", "POST", { type: "magiclink", email: EMAIL });
    const anon = B.mgmt(`/projects/${B.REF}/api-keys`).find((k) => k.name === "anon").api_key;
    const s = await (await fetch(`${B.BASE}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "email", email: EMAIL, token: l.email_otp || l.properties?.email_otp }) })).json();
    const r = await fetch("https://viralnight-koif.vercel.app/api/create-client", {
      method: "POST",
      headers: { Authorization: "Bearer " + s.access_token, "Content-Type": "application/json" },
      body: JSON.stringify({ establishment_name: NOM, city: "Bruxelles" }),
    });
    const corps = await r.json();
    if (!corps.establishment_id) throw new Error("creation " + JSON.stringify(corps));
    etab = { id: corps.establishment_id };
    console.log("club cree", corps.establishment_id);
  }

  // VN_VIDER=1 : on efface les donnees de demonstration et on s'arrete.
  // Le club, lui, reste : c'est celui du gerant.
  if (process.env.VN_VIDER) {
    B.sql(`delete from submissions where establishment_id = '${etab.id}' and customer_id::text like 'de300000-%';
           delete from qr_scans where establishment_id = '${etab.id}' and customer_id::text like 'de300000-%';
           delete from reward_redemptions where customer_id::text like 'de300000-%' and reward_id in (select id from rewards where establishment_id = '${etab.id}');`);
    console.log("donnees de demonstration effacees");
    return;
  }

  // 2. On repart d'une ardoise propre : deux passages ne doivent pas empiler.
  B.sql(`delete from submissions where establishment_id = '${etab.id}' and customer_id::text like 'de300000-%';
         delete from qr_scans where establishment_id = '${etab.id}' and customer_id::text like 'de300000-%';
         delete from reward_redemptions where customer_id::text like 'de300000-%' and reward_id in (select id from rewards where establishment_id = '${etab.id}');`);

  const recompenses = B.sql(`select id, points_required from rewards where establishment_id = '${etab.id}'`);
  // customer_id est un uuid en base : les clients de demonstration en portent un
  // vrai, tous prefixes de « demo » dans leurs 8 premiers caracteres pour qu'on
  // sache les retrouver et les effacer.
  const uuidDemo = () => "de300000-" + Math.random().toString(16).slice(2, 6) + "-4" + Math.random().toString(16).slice(2, 5) + "-8" + Math.random().toString(16).slice(2, 5) + "-" + Math.random().toString(16).slice(2, 14).padEnd(12, "0");
  const clients = Array.from({ length: 48 }, uuidDemo);
  const scans = [];
  const stories = [];
  const echanges = [];

  for (let j = JOURS - 1; j >= 0; j--) {
    const date = new Date(Date.now() - j * 86400000);
    const jour = date.getDay();
    const soiree = jour === 5 || jour === 6 ? 1 : jour === 4 ? 0.55 : 0.18;
    const nbScans = Math.round(hasard(6, 22) * soiree);
    for (let k = 0; k < nbScans; k++) {
      const t = new Date(date);
      t.setHours(hasard(22, 23), hasard(0, 59), 0, 0);
      const client = clients[hasard(0, clients.length - 1)];
      scans.push(`('${client}', '${t.toISOString()}', '${etab.id}')`);
      // Une partie des scans publie une story ; les vues suivent une loi large.
      if (Math.random() < 0.42) {
        const vues = hasard(300, 4200) + (Math.random() < 0.08 ? hasard(6000, 24000) : 0);
        const points = 100 + Math.round(vues / 1000) * 25;
        stories.push(`('${etab.id}', '${client}', 'instagram', 'story', 'https://instagram.com/stories/demo/${Math.random().toString(36).slice(2, 10)}', ${vues}, ${points}, 'validated', '${new Date(t.getTime() + 36e5).toISOString()}', 'customer_qr')`);
      }
      if (recompenses.length && Math.random() < 0.16) {
        const r = recompenses[hasard(0, recompenses.length - 1)];
        echanges.push(`('${r.id}', '${client}', '${new Date(t.getTime() + 54e5).toISOString()}', 'used')`);
      }
    }
  }

  /* ⚠️ L'API SQL DE SUPABASE RETOURNE L'ERREUR, ELLE NE LA LEVE PAS.
     Un premier essai a « pose » 200 scans sans qu'aucune ligne n'arrive : la
     requete etait trop longue et la reponse, un objet { message }, passait
     inapercue. On envoie donc par petits paquets et on VERIFIE chaque reponse. */
  function poser(sql) {
    const r = B.sql(sql);
    if (r && r.message) throw new Error(r.message.slice(0, 300));
  }
  const paquets = (liste, taille) => liste.reduce((acc, v, i) => (i % taille ? acc[acc.length - 1].push(v) : acc.push([v]), acc), []);
  paquets(scans, 40).forEach((p) => poser(`insert into qr_scans (customer_id, scanned_at, establishment_id) values ${p.join(",")}`));
  paquets(stories, 30).forEach((p) => poser(`insert into submissions (establishment_id, customer_id, platform, content_type, url, views_count, points_awarded, status, submitted_at, source) values ${p.join(",")}`));
  if (echanges.length) paquets(echanges, 30).forEach((p) => poser(`insert into reward_redemptions (reward_id, customer_id, redeemed_at, status) values ${p.join(",")}`));

  console.log(JSON.stringify({
    club: etab.id,
    email: EMAIL,
    scans: scans.length,
    stories: stories.length,
    echanges: echanges.length,
    vues: B.sql(`select coalesce(sum(views_count),0) as v from submissions where establishment_id='${etab.id}'`)[0].v,
  }, null, 1));
})();
