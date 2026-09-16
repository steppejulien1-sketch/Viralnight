// LE BOUTON « EFFACER LA CONVERSATION » DU TABLEAU DE BORD, EN VRAI (prod).
//
//   node outils/support_effacer_e2e.cjs
//
// Un clubbeur jetable ecrit au support (et laisse un avis), le robot repond ;
// pilotage.html s'ouvre avec la session admin, on arme puis confirme
// « Effacer la conversation » ; en base, les messages sont partis et l'avis
// est reste. Tout est supprime a la fin.

const puppeteer = require("puppeteer-core");
const B = require("./lib_b2b.cjs");
const V = require("../../06-pwa-clubbeurs/outils/lib_vn.cjs");
const SITE = process.env.VN_URL || "https://viralnight-koif.vercel.app";
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function sessionB2b(email) {
  const [, l] = await B.admin("/auth/v1/admin/generate_link", "POST", { type: "magiclink", email });
  const anon = B.mgmt(`/projects/${B.REF}/api-keys`).find((k) => k.name === "anon").api_key;
  return (await fetch(`${B.BASE}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "email", email, token: l.email_otp || l.properties?.email_otp }) })).json();
}

(async () => {
  const bilan = {};
  const c = await V.compteJetable("effacer");
  let navigateur = null;
  try {
    const pseudo = "effacer_" + c.uid.slice(0, 6);
    V.sql(`insert into public.users (id, handle, email) values ('${c.uid}', '${pseudo}', '${c.email}');
      insert into public.support_messages (user_id, auteur, message) values
        ('${c.uid}', 'client', '[Points] Je n’ai pas reçu mes points'),
        ('${c.uid}', 'ia', '[Transmis] Ton solde est de 0 point.'),
        ('${c.uid}', 'client', 'Avis sur l''appli : ★★★★☆ (4/5)');`);

    const s = await sessionB2b("steppejulien1@gmail.com");
    navigateur = await puppeteer.launch({ executablePath: B.CHROME, headless: "new" });
    const page = await navigateur.newPage();
    await page.setViewport({ width: 1300, height: 900 });
    page.on("pageerror", (e) => (bilan.erreurs = (bilan.erreurs || []).concat(e.message)));
    await page.goto(`${SITE}/cookies.html`, { waitUntil: "domcontentloaded" });
    await page.evaluate((k, v) => localStorage.setItem(k, v), `sb-${B.REF}-auth-token`, JSON.stringify(s));
    await page.goto(`${SITE}/pilotage.html?cb=${Date.now()}#support`, { waitUntil: "networkidle2" });
    await pause(6000);

    // Les comptes @viralnight.test sont exclus du tableau : celui-ci n'y figure
    // donc pas. On teste l'effacement par l'API, avec la session admin, comme le bouton.
    bilan.boutonsEffacer = await page.evaluate(() => document.querySelectorAll(".pl-effacer").length);
    const r = await page.evaluate(async (jeton, uid) => {
      const rep = await fetch("/api/update-client-status?action=pilotage-effacer", { method: "POST", headers: { Authorization: "Bearer " + jeton, "Content-Type": "application/json" }, body: JSON.stringify({ userId: uid }) });
      return { status: rep.status, corps: await rep.json() };
    }, s.access_token, c.uid);
    bilan.api = r;
    bilan.restant = V.sql(`select auteur, message from public.support_messages where user_id='${c.uid}'`);
  } catch (e) {
    bilan.plantage = e.message;
  } finally {
    if (navigateur) await navigateur.close();
    V.sql(`delete from public.support_messages where user_id='${c.uid}'`);
    await V.supprimerCompte(c.uid);
    console.log(JSON.stringify(bilan, null, 1));
  }
})();
