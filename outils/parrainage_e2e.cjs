// LE PARRAINAGE, DE BOUT EN BOUT, AVEC DEUX COMPTES JETABLES (prod par defaut).
//
//   node outils/parrainage_e2e.cjs
//
// 1. A (le parrain) existe, avec son code de parrainage (migration 0051) ;
// 2. B ouvre ?parrain=<code>, se connecte par le code e-mail, envoie sa
//    capture Instagram : c'est la que le parrainage est reclame
//    (/api/credit-clubbeur?action=parrainage) ;
// 3. en base : ligne parrainages, +100 au solde de A, B.referred_by = A ;
// 4. A ouvre l'appli : la page « @B a rejoint Noctify grace a toi » monte,
//    et l'historique a sa ligne « Ami parraine » ;
// 5. un compte ANCIEN (cree il y a 10 jours) est refuse : compte_ancien.
// Les comptes sont supprimes a la fin, quoi qu'il arrive.

const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer-core");
const V = require("../../06-pwa-clubbeurs/outils/lib_vn.cjs");

const SITE = process.env.VN_URL || "https://viralnight-koif.vercel.app";
const DOSSIER = `${__dirname}/pages-parrainage`;
const CAPTURE = process.env.VN_CAPTURE || path.resolve(__dirname, "../public/story-exemples/exemple-profil-sombre.webp");
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";

async function nouvellePage(navigateur, uid, erreurs) {
  const contexte = await navigateur.createBrowserContext();
  const page = await contexte.newPage();
  await page.setUserAgent(IPHONE);
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.evaluateOnNewDocument((id) => {
    try {
      localStorage.setItem("vn_stat_jour", new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" }));
      localStorage.setItem("vn_stat_installe", "1");
      localStorage.setItem("vn_parcours_fini", id);
    } catch (e) {}
  }, uid);
  page.on("pageerror", (e) => erreurs.push(e.message));
  return page;
}

async function connecter(page, email) {
  const [, lien] = await V.admin("/auth/v1/admin/generate_link", "POST", { type: "magiclink", email });
  const code = lien.email_otp || lien.properties.email_otp;
  await page.evaluate((a) => window.noctifyParcours("code", a), email);
  await page.waitForSelector("#ob-code", { visible: true });
  await pause(700);
  await page.type("#ob-code", code);
}

(async () => {
  fs.rmSync(DOSSIER, { recursive: true, force: true });
  fs.mkdirSync(DOSSIER, { recursive: true });
  const bilan = {};
  const erreurs = [];
  const comptes = [];
  const navigateur = await puppeteer.launch({ executablePath: V.CHROME, headless: "new", args: ["--force-color-profile=srgb", "--hide-scrollbars"] });
  try {
    // ---- A, le parrain : profil complet
    const A = await V.compteJetable("parrain", `${SITE}/app-preview.html`);
    comptes.push(A);
    const pseudoA = "e2e_a_" + A.uid.slice(0, 6);
    V.sql(`insert into public.users (id, handle, profile_proof_path) values ('${A.uid}', '${pseudoA}', 'e2e/${A.uid}.png')
           on conflict (id) do update set handle = excluded.handle, profile_proof_path = excluded.profile_proof_path;`);
    const codeA = V.sql(`select referral_code from public.users where id = '${A.uid}'`)[0].referral_code;
    const soldeAvant = V.sql(`select points_balance from public.users where id = '${A.uid}'`)[0].points_balance;
    bilan.codeA = codeA;

    // ---- B arrive par le lien de A
    const B = await V.compteJetable("filleul", `${SITE}/app-preview.html`);
    comptes.push(B);
    const pageB = await nouvellePage(navigateur, B.uid, erreurs);
    let reponseApi = null;
    pageB.on("response", async (r) => {
      if (r.url().includes("action=parrainage")) { try { reponseApi = await r.json(); } catch (e) {} }
    });
    await pageB.goto(`${SITE}/app-preview.html?app=1&parrain=${codeA}&cb=${Date.now()}`, { waitUntil: "networkidle2" });
    await pause(1500);
    bilan.codeGardeSurLeTelephone = await pageB.evaluate(() => localStorage.getItem("vn.parrain"));
    await connecter(pageB, B.email);
    await pageB.waitForFunction(() => document.querySelector('.ob-etape.actif[data-etape="capture"]'), { timeout: 20000 });
    bilan.pasEncoreReclameAvantCapture = V.sql(`select count(*)::int n from public.parrainages where filleul_id = '${B.uid}'`)[0].n === 0;
    await pause(1500);
    const champ = await pageB.$("#ob-capture");
    await champ.uploadFile(CAPTURE);
    await pageB.waitForFunction(() => document.querySelector("#ob-pseudo").dataset.lecture === "fini", { timeout: 60000 }).catch(() => {});
    const pseudoB = "e2e_b_" + B.uid.slice(0, 6);
    await pageB.$eval("#ob-pseudo", (e) => { e.value = ""; });
    await pageB.type("#ob-pseudo", pseudoB);
    await pageB.click('.ob-etape.actif [type="submit"]');
    await pageB.waitForFunction(() => document.querySelector("#ob-feuille").hidden, { timeout: 30000 }).catch(() => {});
    for (let i = 0; i < 20 && !reponseApi; i++) await pause(500);
    bilan.reponseApi = reponseApi;
    await pageB.screenshot({ path: `${DOSSIER}/1-filleul-inscrit.png` });

    // ---- En base
    const ligne = V.sql(`select parrain_id, points from public.parrainages where filleul_id = '${B.uid}'`)[0];
    bilan.ligneParrainage = !!ligne && ligne.parrain_id === A.uid && ligne.points === 100;
    bilan.soldeA = { avant: soldeAvant, apres: V.sql(`select points_balance from public.users where id = '${A.uid}'`)[0].points_balance };
    bilan.referredBy = V.sql(`select referred_by from public.users where id = '${B.uid}'`)[0].referred_by === A.uid;
    bilan.codeEffaceApres = (await pageB.evaluate(() => localStorage.getItem("vn.parrain"))) === null;

    // ---- A ouvre l'appli
    const pageA = await nouvellePage(navigateur, A.uid, erreurs);
    await pageA.goto(`${SITE}/app-preview.html?app=1&cb=${Date.now()}`, { waitUntil: "networkidle2" });
    await pause(1200);
    await connecter(pageA, A.email);
    bilan.pageAmiMontee = await pageA.waitForFunction(() => !document.querySelector("#vue-validee").hidden, { timeout: 20000 }).then(() => true, () => false);
    await pause(2600);
    bilan.titreA = await pageA.$eval("#vv-titre", (e) => e.textContent);
    bilan.chiffreA = await pageA.$eval("#vv-gain", (e) => e.textContent);
    await pageA.screenshot({ path: `${DOSSIER}/2-parrain-page.png` });
    await pageA.click("#vv-btn");
    await pause(800);
    // L'historique des points
    await pageA.evaluate(() => document.querySelector("#pf-fidelite")?.click());
    await pause(3000);
    await pageA.screenshot({ path: `${DOSSIER}/3-parrain-historique.png` });
    const lignes = await pageA.evaluate(() => [...document.querySelectorAll("#hs-liste .hist-ligne")].map((l) => l.textContent.replace(/\s+/g, " ").trim()));
    bilan.historiqueA = lignes;

    // ---- Un compte ancien ne peut pas etre parraine
    const C = await V.compteJetable("ancien", `${SITE}/app-preview.html`);
    comptes.push(C);
    V.sql(`insert into public.users (id, handle) values ('${C.uid}', 'e2e_c_${C.uid.slice(0, 6)}') on conflict (id) do nothing;
           update auth.users set created_at = now() - interval '10 days' where id = '${C.uid}';`);
    // V.sql ne leve pas : une erreur SQL revient en { message }.
    const r = V.sql(`select * from public.claim_referral_pour('${C.uid}', '${codeA}')`);
    const texte = JSON.stringify(r);
    const credite = V.sql(`select count(*)::int n from public.parrainages where filleul_id = '${C.uid}'`)[0].n > 0;
    bilan.compteAncien = /compte_ancien/.test(texte) && !credite ? "refuse : compte_ancien" : "ANORMAL : " + texte.slice(0, 150);
    bilan.erreurs = erreurs;
    console.log(JSON.stringify(bilan, null, 2));
  } finally {
    await navigateur.close();
    for (const c of comptes) {
      try { V.sql(`delete from public.parrainages where parrain_id = '${c.uid}' or filleul_id = '${c.uid}'; delete from public.friendships where user_id = '${c.uid}' or friend_id = '${c.uid}'; update public.users set referred_by = null where referred_by = '${c.uid}';`); } catch (e) {}
      await V.supprimerCompte(c.uid).catch(() => {});
    }
  }
})().catch((e) => { console.error("ECHEC:", e.message); process.exit(1); });
