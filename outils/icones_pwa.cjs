/* Genere les icones de l'appli clubbeur : le mot Noctify, blanc sur noir,
   le point du i en rouge -- le logo depuis le 15/09/2026 (avant : l'etoile
   de assets/favicon-vn.svg, qui reste celle du site). On rasterise avec le
   Chrome local plutot que d'ajouter sharp : puppeteer-core est deja une
   dependance du projet.

   Le mot est ECRIT avec Archivo 800, la police des titres de l'appli,
   embarquee en base64 dans la page de rendu : setContent() n'a pas acces
   aux fichiers, et un repli en police systeme donnerait une autre marque
   sans prevenir. Memes reglages que .mot dans app-preview.html.

   Deux compositions, parce que les plateformes ne masquent pas pareil :
   - "pleine"  : carre plein, sans coins arrondis. iOS et Android
                 appliquent EUX-MEMES leur masque.
   - "arrondie": coins deja arrondis, pour les contextes qui affichent
                 l'icone telle quelle (onglet, raccourci bureau).

   Le mot occupe 66 % de la largeur : il tient dans le cercle central de
   80 % d'une icone "maskable" Android, puisqu'il est bien moins haut que
   large.

   Usage : node outils/icones_pwa.cjs
*/
const fs = require("node:fs");
const path = require("node:path");
const puppeteer = require("puppeteer-core");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const RACINE = path.join(__dirname, "..");
const SORTIE = path.join(RACINE, "public", "icones");

const FOND = "#000000";
const ROUGE = "#de3131"; // le rouge du logo, releve sur l'ancien logo au verre
const ARCHIVO = fs.readFileSync(path.join(RACINE, "assets", "fonts", "archivo-latin.woff2")).toString("base64");

// La marque courte du badge de notification : un N (meme trace que
// --badge-noctify dans app-preview.html). A 24 px, le mot entier serait
// une ligne grise.
const PATH_N = "M29 31h11l20 27V31h11v38H60L40 42v27H29z";

function page(cote, part, rayonPourcent, fond, marque) {
  const style = `<style>
    @font-face{font-family:Archivo;font-weight:600 800;src:url(data:font/woff2;base64,${ARCHIVO}) format("woff2")}
    html,body{margin:0;padding:0;background:transparent}
    .i{width:${cote}px;height:${cote}px;background:${fond || FOND};
       border-radius:${rayonPourcent}%;display:flex;
       align-items:center;justify-content:center;overflow:hidden}
    .mot{display:inline-flex;align-items:baseline;color:#fff;font-family:Archivo;font-weight:800;
         letter-spacing:-.045em;line-height:1;white-space:nowrap;font-synthesis:none}
    .mot>span{display:inline-block}
    .mot-i{position:relative}
    .mot-i i{position:absolute;left:calc(50% + .0225em);top:-.03em;width:.205em;height:.205em;
             margin-left:-.1025em;border-radius:50%;background:${ROUGE}}
    svg{width:${part * 100}%;height:${part * 100}%;display:block}
  </style>`;
  if (marque === "n") {
    return `<!doctype html><meta charset="utf-8">${style}<div class="i"><svg viewBox="20 20 60 60" xmlns="http://www.w3.org/2000/svg"><path d="${PATH_N}" fill="#fff"/></svg></div>`;
  }
  return `<!doctype html><meta charset="utf-8">${style}<div class="i"><span class="mot" data-part="${part}"><span>N</span><span>o</span><span>c</span><span>t</span><span class="mot-i">ı<i></i></span><span>f</span><span>y</span></span></div>`;
}

const CIBLES = [
  // Android / navigateur : affichees telles quelles, donc deja arrondies.
  { fichier: "icone-192.png", cote: 192, part: 0.66, rayon: 22 },
  { fichier: "icone-512.png", cote: 512, part: 0.66, rayon: 22 },
  // Android "maskable" : carre plein, Android decoupe la forme qu'il veut.
  { fichier: "icone-192-maskable.png", cote: 192, part: 0.66, rayon: 0 },
  { fichier: "icone-512-maskable.png", cote: 512, part: 0.66, rayon: 0 },
  // iOS "Ajouter a l'ecran d'accueil" : iOS arrondit lui-meme.
  { fichier: "apple-touch-icon.png", cote: 180, part: 0.66, rayon: 0 },
  // Icone source de l'app iOS (App Store en exige une de 1024, sans alpha).
  { fichier: "icone-1024.png", cote: 1024, part: 0.66, rayon: 0 },
  // Badge des notifications Android : affiche dans la barre d'etat, ou
  // le systeme ne garde que la FORME et jette la couleur. Il faut donc
  // une silhouette blanche sur fond transparent -- une icone en couleur
  // y devient une tache grise informe. Plus grande (0.86) que les
  // autres : reduite a ~24 px dans la barre, une etoile a 62 % devient
  // illisible. Le mot n'y tiendrait pas : la marque courte, le N.
  {
    fichier: "badge-96.png",
    cote: 96,
    part: 0.86,
    rayon: 0,
    fond: "transparent",
    marque: "n",
    transparent: true,
  },
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
      await onglet.setContent(page(c.cote, c.part, c.rayon, c.fond, c.marque), { waitUntil: "load" });
      await onglet.evaluate(() => document.fonts.ready);
      // Le mot est mis a la largeur voulue : une taille de police se regle,
      // pas une largeur -- on mesure, puis on corrige.
      await onglet.evaluate(() => {
        const mot = document.querySelector(".mot");
        if (!mot) return;
        const cote = document.querySelector(".i").clientWidth;
        mot.style.fontSize = "100px";
        const largeur = mot.getBoundingClientRect().width;
        mot.style.fontSize = (100 * (cote * Number(mot.dataset.part)) / largeur) + "px";
      });
      const cible = await onglet.$(".i");
      // Fond transparent pour les versions arrondies (les coins doivent
      // etre vides) et pour le badge (entierement transparent). Les
      // carres pleins gardent un fond opaque : l'App Store refuse une
      // icone avec couche alpha.
      await cible.screenshot({
        path: path.join(SORTIE, c.fichier),
        omitBackground: c.rayon > 0 || Boolean(c.transparent),
      });
      await onglet.close();
      const ko = Math.max(1, Math.round(fs.statSync(path.join(SORTIE, c.fichier)).size / 1024));
      console.log("  " + c.fichier + "  " + c.cote + "x" + c.cote + "  " + ko + " Ko");
    }
  } finally {
    await nav.close();
  }
  console.log("Icones ecrites dans public/icones/");
})();
