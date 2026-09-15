// CAPTURES DE TRAVAIL : accueil, capture ajoutee, suppression du compte, support.
//
//   VN_URL=http://127.0.0.1:4173 node outils/ecrans_divers.cjs
//
// Sortie : outils/pages-divers/*.png. Compte jetable connecte par le code,
// supprime a la fin.

const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer-core");
const V = require("../../06-pwa-clubbeurs/outils/lib_vn.cjs");

const SITE = process.env.VN_URL || "https://viralnight-koif.vercel.app";
const DOSSIER = `${__dirname}/pages-divers`;
const CAPTURE = process.env.VN_CAPTURE || path.resolve(__dirname, "../public/story-exemples/exemple-profil-sombre.webp");
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // Vider les images sans supprimer le dossier (il peut etre ouvert ailleurs).
  if (fs.existsSync(DOSSIER)) for (const f of fs.readdirSync(DOSSIER)) fs.rmSync(`${DOSSIER}/${f}`, { force: true });
  fs.mkdirSync(DOSSIER, { recursive: true });
  let compte = null;
  const navigateur = await puppeteer.launch({ executablePath: V.CHROME, headless: "new", args: ["--force-color-profile=srgb", "--hide-scrollbars"] });
  const erreurs = [];
  try {
    const page = await navigateur.newPage();
    await page.setViewport({ width: 390, height: Number(process.env.VN_HAUTEUR || 844), deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    page.on("pageerror", (e) => erreurs.push(e.message));
    // Un vrai iPhone : Safari iOS, pas Chrome de bureau.
    await page.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1");
    const prendre = (nom) => page.screenshot({ path: `${DOSSIER}/${nom}.png` });

    compte = await V.compteJetable("divers", `${SITE}/app-preview.html`);
    await page.evaluateOnNewDocument((id) => {
      try {
        localStorage.setItem("vn_stat_jour", new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" }));
        localStorage.setItem("vn_stat_installe", "1");
        localStorage.setItem("vn_parcours_fini", id);
      } catch (e) {}
    }, compte.uid);
    await page.goto(`${SITE}/app-preview.html?app=1&cb=${Date.now()}`, { waitUntil: "networkidle2" });
    await pause(1800);
    await prendre("01-accueil");

    const [, lien] = await V.admin("/auth/v1/admin/generate_link", "POST", { type: "magiclink", email: compte.email });
    const code = lien.email_otp || lien.properties.email_otp;
    await page.evaluate((a) => window.noctifyParcours("code", a), compte.email);
    await page.waitForSelector("#ob-code", { visible: true });
    await pause(900);
    await prendre("02-code");
    await page.type("#ob-code", code);

    await page.waitForFunction(() => document.querySelector('.ob-etape.actif[data-etape="capture"]'), { timeout: 20000 });
    await pause(1750); // l'ecran d'accueil du telephone dessine, avant l'ouverture d'Instagram
    await prendre("03a-accueil-iphone");
    await pause(5250);
    await prendre("03-capture-avant");
    const taille = () => page.evaluate(() => { const r = document.querySelector("#ob-cap-tel").getBoundingClientRect(); return Math.round(r.width) + "x" + Math.round(r.height); });
    const tailles = { avant: await taille() };
    const champ = await page.$("#ob-capture");
    await champ.uploadFile(CAPTURE);
    await page.waitForFunction(() => document.querySelector("#ob-pseudo").dataset.lecture === "fini", { timeout: 60000 }).catch(() => {});
    await pause(1500);
    await prendre("04-capture-apres");
    tailles.apres = await taille();
    // Safari replie ses barres : l'ecran « grandit » de 90 px.
    await page.setViewport({ width: 390, height: Number(process.env.VN_HAUTEUR || 844) + 90, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await pause(800);
    tailles.apresBarresRepliees = await taille();
    await page.setViewport({ width: 390, height: Number(process.env.VN_HAUTEUR || 844), deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await pause(500);
    console.log(JSON.stringify(tailles));
    await page.$eval("#ob-pseudo", (e) => { e.value = ""; });
    await page.type("#ob-pseudo", "e2e_" + compte.uid.slice(0, 8));
    await page.click('.ob-etape.actif [type="submit"]');
    await page.waitForFunction(() => document.querySelector("#ob-feuille").hidden, { timeout: 30000 }).catch(() => {});
    await pause(1500);

    // Support : une petite conversation deja commencee
    V.sql(`update public.users set points_balance = 150 where id = '${compte.uid}';
           insert into public.support_messages (user_id, auteur, message, created_at) values
           ('${compte.uid}', 'client', '[Points] Je n''ai pas reçu mes points pour ma story d''hier soir au Mirage.', now() - interval '26 hours'),
           ('${compte.uid}', 'admin', 'Salut ! Ta story est en cours de vérification, les points arrivent dans les 24 h. On regarde ça tout de suite.', now() - interval '25 hours'),
           ('${compte.uid}', 'client', 'Top, merci beaucoup !', now() - interval '5 minutes');`);
    await page.evaluate(() => document.querySelector("#pf-aide")?.click());
    await pause(2000);
    await prendre("06-support");
    await page.evaluate(() => document.querySelector("#ai-retour")?.click());
    await pause(800);
    await page.evaluate(() => { try { chargerSoldeReel && 0; } catch (e) {} });

    // Suppression du compte : la feuille (sans rien confirmer)
    await page.reload({ waitUntil: "networkidle2" });
    await pause(4000);
    await page.evaluate(() => document.querySelector("#rg-supprimer-compte").click());
    await pause(1200);
    await prendre("05-supprimer");
    await page.evaluate(() => { const c = document.querySelector(".sheet"); if (c) c.scrollTop = 9999; document.querySelectorAll(".sheet *").forEach((e) => { if (e.scrollHeight > e.clientHeight + 20) e.scrollTop = 9999; }); });
    await pause(500);
    await prendre("05b-supprimer-bas");
    console.log(JSON.stringify({ erreurs }));
  } finally {
    await navigateur.close();
    if (compte) await V.supprimerCompte(compte.uid).catch(() => {});
  }
})().catch((e) => { console.error("ECHEC:", e.message); process.exit(1); });
