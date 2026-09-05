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

/* DEUX FAMILLES, parce que les deux applis n'ont pas le meme metier.
   Julien, 05/09/2026 : "cherche-moi des applications specifiques [...]
   pour les gerants, plutot des applications qui traquent les donnees
   avec dashboard ; pour l'autre, des trucs faits pour les
   consommateurs, pour les rendre accros".

   `famille` sert au tri du dossier de sortie ET a la lecture : une
   capture de Stripe et une capture de Duolingo ne se jugent pas sur les
   memes criteres. */
const APPS = [
  // ---- GERANT : lire des chiffres, suivre une activite ----
  ["gerant", "stripe",     "com.stripe.android.dashboard",       "Le dashboard de reference : chiffres, courbes, periodes"],
  ["gerant", "shopify",    "com.shopify.mobile",                 "Ventes du jour, comparaison, listes de commandes"],
  ["gerant", "square",     "com.squareup",                       "Encaissement + rapports pour un commerce physique"],
  ["gerant", "sumup",      "com.sumup.merchant",                 "Meme metier que Square, marche francais"],
  ["gerant", "ga",         "com.google.android.apps.giant",      "Analytics pur : courbes, segments, comparaisons"],
  ["gerant", "meta-business","com.facebook.pages.app",           "Portee, abonnes, mentions -- le plus proche de Noctify"],
  ["gerant", "later",      "com.later.android",                  "Programmation et statistiques Instagram"],
  ["gerant", "revolut-biz","com.revolut.business",               "Solde, mouvements, graphes, pour un pro"],
  ["gerant", "qonto",      "com.qonto.app",                      "Banque pro francaise : lisibilite des chiffres"],
  ["gerant", "zettle",     "com.izettle.android",                "Caisse + rapports de vente"],

  /* Julien, 05/09/2026 : "cherche trente applications où il y a des
     dashboards, prends la data, copie leur style". Les plus utiles pour
     Noctify sont les analytiques de CREATEUR -- YouTube Studio, Spotify
     for Artists, TikTok Studio : elles affichent exactement notre
     matiere, des vues et une audience qui monte ou descend. */
  ["gerant", "yt-studio",  "com.google.android.apps.youtube.creator", "Vues, audience, retention -- notre matiere exacte"],
  ["gerant", "spotify-art","com.spotify.s4a",                    "Ecoutes, auditeurs, villes : un artiste lit sa portee"],
  ["gerant", "tiktok-studio","com.tiktok.mobile.studio",         "Analytique creation cote TikTok"],
  ["gerant", "twitch-dash","tv.twitch.android.app.creator",      "Tableau de bord de diffusion en direct"],
  ["gerant", "buffer",     "org.buffer.android",                 "Programmation + statistiques reseaux"],
  ["gerant", "hootsuite",  "com.hootsuite.droid.full",           "Idem, plus dense"],
  ["gerant", "semrush",    "com.semrush.app",                    "Analytique SEO : beaucoup de chiffres, peu de place"],
  ["gerant", "search-console","com.google.android.apps.searchconsole","Courbes, comparaisons de periodes"],
  ["gerant", "mixpanel",   "com.mixpanel.android.mpmetrics",     "Produit analytique pur"],
  ["gerant", "amplitude",  "com.amplitude.mobile",               "Idem"],
  ["gerant", "datadog",    "com.datadog.app",                    "Supervision : lecture d'un etat en un coup d'oeil"],
  ["gerant", "grafana",    "com.grafana.mobile",                 "Le vocabulaire graphique de reference"],
  ["gerant", "quickbooks", "com.intuit.quickbooks",              "Compta d'un petit commerce"],
  ["gerant", "xero",       "com.xero.touch",                     "Idem, tres lisible"],
  ["gerant", "pennylane",  "com.pennylane.app",                  "Compta francaise"],
  ["gerant", "whoop",      "com.whoop.android",                  "Donnees personnelles rendues desirables"],
  ["gerant", "oura",       "com.ouraring.oura",                  "Idem : un score, une courbe, une explication"],
  ["gerant", "fitbit",     "com.fitbit.FitbitMobile",            "Grand public, beaucoup de metriques"],
  ["gerant", "wise-biz",   "com.transferwise.android",           "Solde, mouvements, devises"],
  ["gerant", "n26",        "de.number26.android",                "Banque : lisibilite des montants"],

  // ---- CLUBBEUR : donner envie de revenir ----
  ["clubbeur", "duolingo", "com.duolingo",                       "Le maitre etalon de l'accroche : serie, sons, celebrations"],
  ["clubbeur", "starbucks","com.starbucks.mobilecard",           "Solde de points + menu de recompenses"],
  ["clubbeur", "dice",     "fm.dice",                            "Sorties et billets -- le monde de Julien"],
  ["clubbeur", "ra",       "com.residentadvisor.raGuide",        "Soirees electro, agenda, clubs"],
  ["clubbeur", "shazam",   "com.shazam.android",                 "Un seul geste, une animation qui le porte"],
  ["clubbeur", "strava",   "com.strava",                         "Badges, series, comparaison entre amis"],
  ["clubbeur", "toogoodtogo","com.app.tgtg",                     "Panier a recuperer, urgence, carte"],
  ["clubbeur", "mcdo",     "com.mcdonalds.mobileapp",            "Fidelite grand public, illustrations"],
  ["clubbeur", "sephora",  "com.sephora.digital",                "Programme a paliers, cartes produit"],
  ["clubbeur", "deliveroo","com.deliveroo.orderapp",             "Catalogue dense + fidelite"],
];

(async () => {
  fs.rmSync(DOSSIER, { recursive: true, force: true });
  fs.mkdirSync(`${DOSSIER}/gerant`, { recursive: true });
  fs.mkdirSync(`${DOSSIER}/clubbeur`, { recursive: true });

  const navigateur = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: ["--force-color-profile=srgb", "--hide-scrollbars", "--lang=fr-FR"],
  });
  const page = await navigateur.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  for (const [famille, nom, id, pourquoi] of APPS) {
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
            fs.writeFileSync(`${DOSSIER}/${famille}/${nom}-${gardees + 1}.jpg`, buf);
            gardees++;
          }
        } catch (e) { /* une image qui ne vient pas n'arrete pas le reste */ }
        await vue.close();
      }
      console.log(`  ${famille.padEnd(8)} ${nom.padEnd(13)} ${String(gardees).padStart(2)} captures  — ${pourquoi}`);
    } catch (e) {
      console.log(`  ${famille.padEnd(8)} ${nom.padEnd(13)}  0 captures  — ${e.message.slice(0, 50)}`);
    }
  }

  await navigateur.close();
  console.log(`\nDans outils/references/\n`);
})();
