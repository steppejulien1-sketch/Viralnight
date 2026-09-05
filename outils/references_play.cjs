// LES CAPTURES DU PLAY STORE, POUR REGARDER CE QUE FONT LES AUTRES.
//
// Julien, 05/09/2026 : "mon idee, c'est de regarder cinq, dix
// applications similaires [...] tu reprends tous les codes qui
// marchent". Deux tentatives a la main n'avaient rendu que des icones :
// la fiche du Play Store sert des vignettes de 240 px, et la grande
// image ne s'obtient qu'en reecrivant le suffixe de taille de l'URL.
//
//   node outils/references_play.cjs
//
// Sortie : outils/references/<appli>-<n>.jpg
//
// ⚠️ CE SONT DES CAPTURES PROMOTIONNELLES, pas l'appli. Elles montrent
// la mise en page, la hierarchie, les couleurs -- jamais le mouvement,
// et rarement un ecran vide ou une erreur. C'est utile pour la
// composition, inutile pour tout ce qui bouge.
//
// Rien de ce qui est telecharge n'entre dans le depot : le dossier est
// dans .gitignore. Ces images appartiennent a leurs editeurs, elles
// servent a REGARDER, jamais a etre recopiees.

const fs = require("fs");
const puppeteer = require("puppeteer-core");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const DOSSIER = `${__dirname}/references`;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// Choisies pour ce qu'elles ont en commun avec Noctify : un solde de
// points, un catalogue a echanger, ou une sortie a reserver.
const APPS = [
  ["starbucks", "com.starbucks.mobilecard", "Solde de points + menu de recompenses"],
  ["mcdo", "com.mcdonalds.mobileapp", "Fidelite, catalogue, commande"],
  ["sephora", "com.sephora.digital", "Programme a paliers, cartes produit"],
  ["fidme", "com.fidme", "Portefeuille de cartes de fidelite"],
  ["dice", "fm.dice", "Sorties, billets, decouverte de soirees"],
  ["revolut", "com.revolut.revolut", "Carte de solde, chiffres, graphes"],
  ["shopmium", "com.shopmium", "Cashback, offres a debloquer"],
  ["deliveroo", "com.deliveroo.orderapp", "Catalogue dense + fidelite"],
];

(async () => {
  fs.rmSync(DOSSIER, { recursive: true, force: true });
  fs.mkdirSync(DOSSIER, { recursive: true });

  const navigateur = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: ["--force-color-profile=srgb", "--hide-scrollbars", "--lang=fr-FR"],
  });
  const page = await navigateur.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  for (const [nom, id, pourquoi] of APPS) {
    try {
      await page.goto(`https://play.google.com/store/apps/details?id=${id}&hl=fr&gl=FR`,
        { waitUntil: "networkidle2", timeout: 45000 });
      await pause(2500);

      /* Les vignettes de la fiche font 240 px de large. Le suffixe de
         l'URL (=w240-h480-rw) est un parametre de redimensionnement du
         serveur d'images : on le reecrit pour demander la grande. */
      const urls = await page.evaluate(() => {
        return [...document.images]
          .map((i) => i.src)
          .filter((u) => /play-lh\.googleusercontent\.com/.test(u) && /=w\d+-h\d+/.test(u))
          .map((u) => u.replace(/=w\d+-h\d+.*$/, "=w1200-h2400-rw"));
      });

      // Les captures d'ecran sont plus HAUTES que larges ; l'icone de
      // l'appli et les bandeaux promotionnels ne le sont pas. C'est ce
      // qui les separe, et c'est ce qui manquait aux essais a la main.
      let gardees = 0;
      for (const u of [...new Set(urls)]) {
        if (gardees >= 4) break;
        const vue = await navigateur.newPage();
        try {
          const rep = await vue.goto(u, { timeout: 25000 });
          const buf = await rep.buffer();
          const dim = await vue.evaluate(() => ({
            l: document.images[0] ? document.images[0].naturalWidth : 0,
            h: document.images[0] ? document.images[0].naturalHeight : 0,
          }));
          if (dim.h > dim.l * 1.3 && dim.l >= 300) {
            fs.writeFileSync(`${DOSSIER}/${nom}-${gardees + 1}.jpg`, buf);
            gardees++;
          }
        } catch (e) { /* une image qui ne vient pas n'arrete pas le reste */ }
        await vue.close();
      }
      console.log(`  ${nom.padEnd(11)} ${String(gardees).padStart(2)} captures  — ${pourquoi}`);
    } catch (e) {
      console.log(`  ${nom.padEnd(11)}  0 captures  — ${e.message.slice(0, 60)}`);
    }
  }

  await navigateur.close();
  console.log(`\nDans outils/references/\n`);
})();
