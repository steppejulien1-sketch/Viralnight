// TOUS LES ECRANS DE L'APPLI DES CLUBBEURS, PHOTOGRAPHIES.
//
// Pendant d'`appli_club.cjs` (l'appli des gerants). Ensemble, les deux
// donnent le produit entier en planche-contact.
//
//   node outils/appli_clubbeur.cjs
//   VN_URL=http://127.0.0.1:5173 node outils/appli_clubbeur.cjs
//
// Sortie : outils/pages-clubbeur/*.png (retine) + *.jpg (1x, planche)
//
// ⚠️ TROIS ONGLETS SUR CINQ EXIGENT UN COMPTE.
// Story, Amis et Profil repondent "Connecte-toi pour…" hors session --
// c'est un vrai ecran, capture comme tel, mais ce n'est pas le dessin
// de l'onglet. Recompenses et Carte, eux, se remplissent : la table
// `clubs` et les recompenses se lisent avec la cle anon.
//
// Aucun compte n'est cree ici. Le depot PWA a deja un outil qui
// traverse le parcours connecte en fabriquant un compte jetable
// (06-pwa-clubbeurs/outils/parcours_clubbeur.cjs) -- c'est lui qu'il
// faut lancer pour voir les trois onglets manquants.
//
// `?app=1` : le mode plein ecran (.mode-appli), celui d'un telephone qui
// a installe l'appli. Sans lui on capturerait l'habillage de
// demonstration, pas l'appli.

const fs = require("fs");
const puppeteer = require("puppeteer-core");

const PROD = "https://viralnight-koif.vercel.app";
const SITE = process.env.VN_URL || PROD;
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const DOSSIER = `${__dirname}/pages-clubbeur`;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// iPhone 14 : la taille pour laquelle --u a ete calibre (voir la regle
// des font-size en calc(x * var(--u)) dans CLAUDE.md).
const LARGEUR = 390;
const HAUTEUR = 844;

(async () => {
  fs.rmSync(DOSSIER, { recursive: true, force: true });
  fs.mkdirSync(DOSSIER, { recursive: true });

  const navigateur = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: ["--force-color-profile=srgb", "--hide-scrollbars"],
  });
  const page = await navigateur.newPage();
  const cadrer = (dsf) => page.setViewport({
    width: LARGEUR, height: HAUTEUR, deviceScaleFactor: dsf, isMobile: true, hasTouch: true,
  });
  await cadrer(2);

  const faites = [];
  async function prendre(nom, titre) {
    await page.screenshot({ path: `${DOSSIER}/${nom}.png` });
    await cadrer(1);
    await page.screenshot({ path: `${DOSSIER}/${nom}.jpg`, type: "jpeg", quality: 78 });
    await cadrer(2);
    faites.push({ nom, titre });
    console.log(`  ${nom}  ${titre}`);
  }

  console.log(`\nAppli clubbeur — ${SITE}\n`);

  await page.goto(`${SITE}/app-preview.html?app=1&cb=${Date.now()}`, { waitUntil: "networkidle2" });
  await pause(3500);
  await prendre("01-accueil", "L'accueil, sans compte");

  // On passe l'accueil comme le ferait une session : la classe `masque`
  // est exactement ce que pose l'appli une fois connectee. Les onglets
  // decident ensuite eux-memes de ce qu'ils savent afficher.
  await page.evaluate(() => document.querySelector("#vue-accueil").classList.add("masque"));
  await pause(1200);

  console.log("Les onglets");
  await page.evaluate(() => document.querySelector("#tab-boutique").click());
  await pause(2500);
  await prendre("02-recompenses", "Récompenses — le solde et la jauge");

  await page.evaluate(() => {
    const v = document.querySelector("#vue-boutique");
    (v.querySelector(".app") || v).scrollTop = 520;
    v.scrollTop = 520;
    window.scrollTo(0, 520);
  });
  await pause(700);
  await prendre("03-recompenses-cartes", "Récompenses — le catalogue du club");

  // La fiche d'une recompense : c'est la que le clubbeur decide.
  const ouverte = await page.evaluate(() => {
    const carte = document.querySelector("#vue-boutique .carte-reco, #vue-boutique [data-reward], #vue-boutique .reco");
    if (!carte) return false;
    carte.click();
    return true;
  });
  if (ouverte) {
    await pause(1600);
    await prendre("04-recompense-fiche", "Une récompense, ouverte");
    // La feuille reste posee par-dessus l'onglet suivant si on ne la
    // ferme pas : la capture de la carte montrait un cocktail.
    await page.evaluate(() => document.querySelector("#sh-close")?.click());
    await pause(900);
  } else {
    console.log("  (pas de fiche de recompense ouvrable hors session)");
  }

  for (const [tab, nom, titre] of [
    ["tab-carte", "05-carte", "La carte des clubs"],
    ["tab-story", "06-story", "Story — sans compte"],
    ["tab-amis", "07-amis", "Amis — sans compte"],
    ["tab-profil", "08-profil", "Profil — sans compte"],
  ]) {
    await page.evaluate((t) => document.getElementById(t).click(), tab);
    // La carte charge ses tuiles depuis le reseau : plus lente que le reste.
    await pause(tab === "tab-carte" ? 4500 : 1600);
    await prendre(nom, titre);
  }

  fs.writeFileSync(`${DOSSIER}/ecrans.json`, JSON.stringify(faites, null, 2));
  await navigateur.close();
  console.log(`\n${faites.length} écrans dans outils/pages-clubbeur/\n`);
})();
