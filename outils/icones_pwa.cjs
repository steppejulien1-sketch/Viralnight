/* Genere les icones de l'appli clubbeur a partir de l'etoile de marque
   (assets/favicon-vn.svg). On rasterise avec le Chrome local plutot que
   d'ajouter sharp : puppeteer-core est deja une dependance du projet et
   les autres outils/ s'en servent avec le meme chemin de binaire.

   Deux compositions, parce que les plateformes ne masquent pas pareil :
   - "pleine"  : carre plein, sans coins arrondis. iOS et Android
                 appliquent EUX-MEMES leur masque ; arrondir a la source
                 donnerait un double arrondi avec un liseré noir visible.
   - "arrondie": coins deja arrondis, pour les contextes qui affichent
                 l'icone telle quelle (onglet, raccourci bureau).

   L'etoile occupe 62 % du carre : la zone sure d'une icone "maskable"
   Android est le cercle central de 80 % du cote, et les coins d'iOS
   rognent autant. A 62 % l'etoile ne touche jamais la coupe.

   Usage : node outils/icones_pwa.cjs
*/
const fs = require("node:fs");
const path = require("node:path");
const puppeteer = require("puppeteer-core");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const RACINE = path.join(__dirname, "..");
const SORTIE = path.join(RACINE, "public", "icones");

const FOND = "#040506";
const ETOILE = "#ff6363";

// Le path vient tel quel de assets/favicon-vn.svg : une seule source de
// verite pour la marque, on ne le recopie pas a la main.
const SVG_MARQUE = path.join(RACINE, "assets", "favicon-vn.svg");
const PATH_ETOILE = (function lireEtoile() {
  const svg = fs.readFileSync(SVG_MARQUE, "utf8");
  const m = svg.match(/<path\s+d="([^"]+)"/);
  if (!m) throw new Error("Etoile introuvable dans " + SVG_MARQUE);
  return m[1];
})();

// L'etoile s'inscrit dans 2.4 -> 21.6 du viewBox 24, soit 80 % de large.
// Pour qu'elle occupe PART du carre final, on met le svg a PART / 0.8.
function page(cote, part, rayonPourcent) {
  const svgCote = (part / 0.8) * 100;
  return `<!doctype html><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:transparent}
    .i{width:${cote}px;height:${cote}px;background:${FOND};
       border-radius:${rayonPourcent}%;display:flex;
       align-items:center;justify-content:center;overflow:hidden}
    svg{width:${svgCote}%;height:${svgCote}%;display:block}
  </style><div class="i"><svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="${PATH_ETOILE}" fill="${ETOILE}"/></svg></div>`;
}

const CIBLES = [
  // Android / navigateur : affichees telles quelles, donc deja arrondies.
  { fichier: "icone-192.png", cote: 192, part: 0.62, rayon: 22 },
  { fichier: "icone-512.png", cote: 512, part: 0.62, rayon: 22 },
  // Android "maskable" : carre plein, Android decoupe la forme qu'il veut.
  { fichier: "icone-192-maskable.png", cote: 192, part: 0.62, rayon: 0 },
  { fichier: "icone-512-maskable.png", cote: 512, part: 0.62, rayon: 0 },
  // iOS "Ajouter a l'ecran d'accueil" : iOS arrondit lui-meme.
  { fichier: "apple-touch-icon.png", cote: 180, part: 0.62, rayon: 0 },
  // Icone source de l'app iOS (App Store en exige une de 1024, sans alpha).
  { fichier: "icone-1024.png", cote: 1024, part: 0.62, rayon: 0 },
];

(async function main() {
  if (!fs.existsSync(CHROME)) {
    console.error("Chrome introuvable : " + CHROME);
    process.exit(1);
  }
  fs.mkdirSync(SORTIE, { recursive: true });
  const nav = await puppeteer.launch({ executablePath: CHROME, headless: "new" });
  try {
    for (const c of CIBLES) {
      const onglet = await nav.newPage();
      await onglet.setViewport({ width: c.cote, height: c.cote, deviceScaleFactor: 1 });
      await onglet.setContent(page(c.cote, c.part, c.rayon), { waitUntil: "load" });
      const cible = await onglet.$(".i");
      // omitBackground seulement pour les versions arrondies : les coins
      // doivent etre transparents. Les carres pleins gardent un fond opaque,
      // l'App Store refuse une icone avec couche alpha.
      await cible.screenshot({ path: path.join(SORTIE, c.fichier), omitBackground: c.rayon > 0 });
      await onglet.close();
      const ko = Math.max(1, Math.round(fs.statSync(path.join(SORTIE, c.fichier)).size / 1024));
      console.log("  " + c.fichier + "  " + c.cote + "x" + c.cote + "  " + ko + " Ko");
    }
  } finally {
    await nav.close();
  }
  console.log("Icones ecrites dans public/icones/");
})();
