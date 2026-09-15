// LE PARCOURS D'INSCRIPTION DE L'APPLI CLUBBEUR, DE BOUT EN BOUT.
//
//   node outils/parcours_inscription.cjs
//   VN_URL=http://127.0.0.1:5173 node outils/parcours_inscription.cjs
//   VN_THEME=noir node outils/parcours_inscription.cjs      (ou blanc)
//
// Sortie : outils/pages-inscription[-noir|-blanc]/*.png (retine) + *.jpg (1x)
//
// Deux choses a la fois, parce qu'elles passent par les memes ecrans :
//   1. les captures de chaque ecran (l'accueil, puis les trois ecrans de la
//      feuille : code, nom, Instagram) ;
//   2. un vrai test : un code valide, puis le nom, la capture et le pseudo
//      ENREGISTRES, relus en base a la fin.
//
// ⚠️ AUCUN E-MAIL N'EST ENVOYE. Le code vient de l'API admin
// (generate_link rend `email_otp`, le meme code que l'e-mail porterait),
// et l'ecran « code » est ouvert par window.noctifyParcours. L'ecran
// « email » est photographie sans etre soumis : le soumettre ferait partir
// un vrai message vers une adresse jetable, qui reviendrait en erreur chez
// Brevo.
//
// ⚠️ IL CREE UN VRAI COMPTE DANS LA VRAIE BASE CLUBBEUR, ET LE SUPPRIME
// (capture televersee comprise), dans un `finally`. Adresse en
// `e2e-inscription-<horodatage>@viralnight.test`. Voir clubbeur_connecte.cjs
// pour les pieges des comptes jetables.

const fs = require("fs");
const puppeteer = require("puppeteer-core");
const V = require("../../06-pwa-clubbeurs/outils/lib_vn.cjs");

const PROD = "https://viralnight-koif.vercel.app";
const SITE = process.env.VN_URL || PROD;
const THEME = process.env.VN_THEME || "";
const DOSSIER = `${__dirname}/pages-inscription${THEME ? "-" + THEME : ""}`;
// Chemin resolu : avec un « .. » dedans, Chrome accepte le fichier (l'apercu
// s'affiche) mais ne sait plus le relire ensuite -- l'envoi echouait.
const CAPTURE = require("path").resolve(__dirname, "../public/story-exemples/exemple-profil-sombre.webp");
const PAS_UN_PROFIL = require("path").resolve(__dirname, "../public/ambiance/bienvenue.webp");
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const LARGEUR = 390;
const HAUTEUR = 844;

(async () => {
  let compte = null;
  let navigateur = null;
  let cheminCapture = null;
  const bilan = {};

  fs.rmSync(DOSSIER, { recursive: true, force: true });
  fs.mkdirSync(DOSSIER, { recursive: true });

  try {
    navigateur = await puppeteer.launch({
      executablePath: V.CHROME,
      headless: "new",
      args: ["--force-color-profile=srgb", "--hide-scrollbars"],
    });
    const page = await navigateur.newPage();
    const cadrer = (dsf) =>
      page.setViewport({ width: LARGEUR, height: HAUTEUR, deviceScaleFactor: dsf, isMobile: true, hasTouch: true });
    await cadrer(2);

    // Le tableau de bord de Julien compte les ouvertures d'appareils en
    // mode appli : ce navigateur de test n'en est pas un.
    await page.evaluateOnNewDocument(() => {
      try {
        localStorage.setItem("vn_stat_jour", new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" }));
        localStorage.setItem("vn_stat_installe", "1");
      } catch (e) {}
    });
    const erreurs = [];
    page.on("pageerror", (e) => erreurs.push(e.message));
    page.on("console", (m) => { if (/^\[inscription\]/.test(m.text())) erreurs.push(m.text()); });

    async function prendre(nom, titre) {
      await page.screenshot({ path: `${DOSSIER}/${nom}.png` });
      await cadrer(1);
      await page.screenshot({ path: `${DOSSIER}/${nom}.jpg`, type: "jpeg", quality: 80 });
      await cadrer(2);
      console.log(`  ${nom}  ${titre}`);
    }
    const ecranActif = () => page.evaluate(() => document.querySelector(".ob-etape.actif")?.dataset.etape || null);
    async function attendreEcran(nom, ms = 15000) {
      await page.waitForFunction((n) => document.querySelector(`.ob-etape.actif[data-etape="${n}"]`), { timeout: ms }, nom);
      await pause(700); // la glissade
    }

    console.log(`\nParcours d'inscription — ${SITE}\n`);
    await page.goto(`${SITE}/app-preview.html?app=1${THEME ? "&theme=" + THEME : ""}&cb=${Date.now()}`, { waitUntil: "networkidle2" });
    await pause(1500);
    // L'adresse est tapee mais pas envoyee : l'envoi ferait partir un vrai
    // e-mail vers une adresse jetable.
    await page.type("#ac-email", "ton.adresse@gmail.com");
    await prendre("01-accueil", "Accueil");

    console.log("\nCompte jetable…");
    compte = await V.compteJetable("inscription", `${SITE}/app-preview.html`);
    const [stLien, lien] = await V.admin("/auth/v1/admin/generate_link", "POST", { type: "magiclink", email: compte.email });
    const code = lien && (lien.email_otp || (lien.properties && lien.properties.email_otp));
    if (stLien >= 400 || !code) throw new Error("pas de code : " + JSON.stringify(lien).slice(0, 200));
    console.log(`  ${compte.email} — code de ${code.length} chiffres`);
    bilan.longueurCode = code.length;

    await page.evaluate((a) => window.noctifyParcours("code", a), compte.email);
    await attendreEcran("code");
    await page.type("#ob-code", code.slice(0, 4));
    await pause(400);
    await prendre("02-code", "Regarde tes mails — le code");
    await page.type("#ob-code", code.slice(4));

    console.log("\nLa feuille, apres la connexion (plus d'ecran prenom)");

    // Plus d'ecran pseudo (15/09/2026) : la capture, puis le pseudo LU dessus.
    await attendreEcran("capture");
    const pseudo = "e2e_" + compte.uid.slice(0, 8);
    await pause(1600); // le telephone arrive
    await prendre("04-capture", "Capture ton profil");
    bilan.lienProfil = await page.$eval("#ob-ouvrir-instagram", (a) => a.href);
    const champ = await page.$("#ob-capture");
    // Une photo qui n'est pas un profil Instagram : refusee.
    await champ.uploadFile(PAS_UN_PROFIL);
    await page.waitForFunction(() => document.querySelector("#ob-pseudo").dataset.lecture === "refusee", { timeout: 60000 }).catch(() => {});
    bilan.photoRefusee = await page.$eval("#ob-pseudo", (e) => e.dataset.lecture === "refusee");
    await prendre("04b-capture-refusee", "Pas un profil : refusee");
    await champ.uploadFile(CAPTURE);
    await page.waitForFunction(() => document.querySelector("#ob-pseudo").dataset.lecture === "fini", { timeout: 60000 });
    bilan.pseudoLu = await page.$eval("#ob-pseudo", (e) => e.dataset.lu);
    await prendre("05-capture-pseudo-lu", "Capture ajoutee, pseudo lu");
    // Le pseudo lu est celui de l'image d'exemple : on le remplace par un
    // pseudo unique au compte jetable.
    await page.$eval("#ob-pseudo", (e) => { e.value = ""; });
    await page.type("#ob-pseudo", pseudo);
    await page.click('.ob-etape.actif [type="submit"]');

    // L'ecran de bienvenue et son cadeau. Un compte jetable n'a scanne aucun
    // etablissement : les 50 points y sont annonces, pas verses.
    const fin = await page.waitForFunction(() => document.querySelector('.ob-etape.actif[data-etape="bienvenue"]') || document.querySelector("#ob-feuille").hidden, { timeout: 20000 }).then(() => ecranActif()).catch(() => null);
    bilan.pageBienvenue = fin === "bienvenue";
    if (fin === "bienvenue") {
      await pause(2600); // le paquet se pose, le chiffre compte
      await prendre("06-bienvenue", "Bienvenue — le cadeau");
      bilan.bienvenue = (await page.$eval("#ob-bv-btn", (b) => b.textContent)).trim();
      bilan.ligneBienvenue = await page.$eval(".ob-bv-points", (e) => (e.hidden ? "" : e.textContent.trim()));
      await page.click("#ob-bv-btn");
      // Depuis la migration clubbeur 0049, le cadeau se prend sans scan :
      // la page « Cadeau recupere » se pose, puis « Continuer ».
      bilan.pageCadeau = await page.waitForFunction(() => document.querySelector(".ob-etape-bienvenue.recupere"), { timeout: 20000 }).then(() => true).catch(() => false);
      if (bilan.pageCadeau) {
        await pause(1800);
        await prendre("07-cadeau-recupere", "Cadeau recupere");
        bilan.gain = await page.$eval("#ob-bv-gain", (e) => e.textContent);
        await page.click("#ob-bv-btn"); // devenu « Continuer »
      }
    }

    await page.waitForFunction(() => document.querySelector("#ob-feuille").hidden, { timeout: 20000 }).catch(async (e) => {
      // Ce que dit l'ecran quand ca coince : sans ca, un « timeout » ne
      // dit pas si c'est le pseudo, l'envoi ou l'enregistrement qui a echoue.
      await prendre("99-echec", "L'ecran au moment de l'echec");
      const msg = await page.evaluate(() => document.querySelector(".ob-etape.actif .ob-msg")?.textContent);
      throw new Error(`la feuille ne s'est pas fermee — ecran « ${await ecranActif()} », message « ${msg} », erreurs ${JSON.stringify(erreurs)}`);
    });
    await pause(800);
    await prendre("10-dans-l-appli", "Terminé : l'appli");
    bilan.ecranFinal = await ecranActif();
    bilan.accueilMasque = await page.evaluate(() => document.querySelector("#vue-accueil").classList.contains("masque"));

    // Ce qui est VRAIMENT en base.
    const lignes = V.sql(`select handle, profile_proof_path, points_balance from public.users where id='${compte.uid}'`);
    const ligne = Array.isArray(lignes) ? lignes[0] : null;
    cheminCapture = ligne && ligne.profile_proof_path;
    const [, utilisateur] = await V.admin(`/auth/v1/admin/users/${compte.uid}`, "GET");
    Object.assign(bilan, {
      handle: ligne && ligne.handle,
      handleAttendu: pseudo,
      solde: ligne && Number(ligne.points_balance),
      capture: cheminCapture,
      nom: utilisateur && utilisateur.user_metadata && utilisateur.user_metadata.full_name,
      erreursPage: erreurs,
    });
    bilan.reussi = bilan.handle === pseudo && Boolean(cheminCapture) && bilan.nom === pseudo && bilan.photoRefusee && bilan.pageBienvenue && bilan.pageCadeau && bilan.solde === 50 && bilan.accueilMasque;
    console.log("\n" + JSON.stringify(bilan, null, 1));
  } finally {
    if (navigateur) await navigateur.close();
    if (compte) {
      if (cheminCapture) {
        const r = await fetch(`${V.BASE}/storage/v1/object/story-proofs`, {
          method: "DELETE",
          headers: { apikey: V.service(), Authorization: `Bearer ${V.service()}`, "Content-Type": "application/json" },
          body: JSON.stringify({ prefixes: [cheminCapture] }),
        });
        console.log(`\ncapture supprimee (HTTP ${r.status})`);
      }
      await V.supprimerCompte(compte.uid);
      console.log(`compte jetable supprime (${compte.email})`);
    }
  }
  if (!bilan.reussi) process.exitCode = 1;
})().catch((e) => {
  console.error("\nECHEC:", e.message);
  process.exit(1);
});
