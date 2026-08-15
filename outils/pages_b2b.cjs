// LES PAGES PUBLIQUES DU SITE B2B, PHOTOGRAPHIEES.
//
// Pendant de `parcours_clubbeur.cjs` / `parcours_gerant.cjs` du depot
// PWA. But : regarder ce que voit un gerant de boite qui decouvre le
// produit, et mesurer ce qu'une capture ne montre pas.
//
// ⚠️ LES SECTIONS SOUS LA LIGNE DE FLOTTAISON SONT INVISIBLES EN
// STATIQUE. `.hero { min-height: 100svh }` occupe tout le premier
// ecran, et les blocs `[data-reveal]` restent a `opacity: 0` tant
// qu'on n'a pas fait defiler. Une capture pleine page sans neutraliser
// les deux ne montre qu'un hero et du vide — piege deja paye deux fois.
//
// VN_URL=http://127.0.0.1:5173 pour viser un build local.

const fs = require("fs");
const puppeteer = require("puppeteer-core");

const PROD = "https://viralnight-koif.vercel.app";
const SITE = process.env.VN_URL || PROD;
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const DOSSIER = `${__dirname}/pages${process.env.VN_W && process.env.VN_W !== "1400" ? "-" + process.env.VN_W : ""}`;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const notes = [];

// VN_PAGES=simulateur.html pour ne viser qu'une page.
const TOUTES = [
  ["", "1-accueil", "Accueil (ce que voit un prospect)"],
  ["connexion.html", "2-connexion", "Connexion"],
  ["inscription.html", "3-inscription", "Inscription"],
  ["demo.html", "4-demo", "Demander une démo"],
  ["simulateur.html", "5-simulateur", "Démo commerciale (ce qu'on montre pour vendre)"],
];
const PAGES = process.env.VN_PAGES
  ? TOUTES.filter(([chemin]) => process.env.VN_PAGES.split(",").includes(chemin))
  : TOUTES;

// Neutralise ce qui rend une page longue incapturable, sans toucher au
// depot : injecte au moment de la visite seulement.
const DEGEL = `
  .hero { min-height: auto !important; height: auto !important; }
  .hero-video, .hero-video-overlay { display: none !important; }
  [data-reveal], [data-reveal-group] > * {
    opacity: 1 !important; transform: none !important;
  }
  * { animation-play-state: paused !important; }
`;

const mesures = (p) => p.evaluate(() => {
  const d = document.documentElement;
  const dedans = (e) => e.offsetParent !== null || getComputedStyle(e).position === "fixed";
  const tous = [...document.querySelectorAll("*")].slice(0, 6000);
  return {
    largeur: { scroll: d.scrollWidth, client: d.clientWidth },
    hors: [...new Set(tous.filter((e) => e.getBoundingClientRect().right > d.clientWidth + 1)
      .map((e) => `${e.tagName}.${(e.className || "").toString().split(" ")[0]}`))].slice(0, 6),
    petits: tous.filter((e) => e.children.length === 0 && (e.textContent || "").trim().length > 2 && dedans(e))
      .map((e) => ({ px: parseFloat(getComputedStyle(e).fontSize), t: e.textContent.trim().slice(0, 30) }))
      .filter((x) => x.px < 12).slice(0, 8),
    // Les motifs qu'on traque : etiquettes en capitales et titres cries.
    capitales: tous.filter((e) => e.children.length === 0 && (e.textContent || "").trim().length > 2
        && dedans(e) && getComputedStyle(e).textTransform === "uppercase")
      .map((e) => `${(e.className || "").toString().split(" ")[0] || e.tagName} « ${e.textContent.trim().slice(0, 26)} »`)
      .slice(0, 20),
  };
});

(async () => {
  fs.rmSync(DOSSIER, { recursive: true, force: true });
  fs.mkdirSync(DOSSIER, { recursive: true });

  const nav = await puppeteer.launch({
    executablePath: CHROME, headless: "new", protocolTimeout: 180000,
    defaultViewport: { width: 1400, height: 950, deviceScaleFactor: 1 },
  });

  // ⚠️ 375px EST UNE EXIGENCE DU PROJET (CLAUDE.md) : « toujours
  // verifier mobile autant que desktop, zero debordement horizontal ».
  // Un site vitrine de boite de nuit se consulte au telephone.
  const LARGEUR = Number(process.env.VN_W || 1400);

  try {
    for (const [chemin, nom, titre] of PAGES) {
      const page = await nav.newPage();
      if (LARGEUR !== 1400) {
        await page.setViewport({ width: LARGEUR, height: 900, isMobile: LARGEUR < 600, hasTouch: LARGEUR < 600 });
      }
      await page.goto(`${SITE}/${chemin}`, { waitUntil: "networkidle2", timeout: 60000 });
      await page.addStyleTag({ content: DEGEL });
      await pause(2200);
      await page.screenshot({ path: `${DOSSIER}/${nom}.png`, fullPage: true });
      const m = await mesures(page);
      notes.push({ nom, titre, ...m });
      console.log(`\n### ${titre}  ->  ${nom}.png`);
      console.log("  hauteur:", (await page.evaluate(() => document.documentElement.scrollHeight)) + "px");
      if (m.largeur.scroll > m.largeur.client + 1) console.log(`  ⚠ DEBORDEMENT ${m.largeur.scroll} > ${m.largeur.client} :`, m.hors.join(" "));
      if (m.petits.length) console.log("  ⚠ TEXTE < 12px :", m.petits.map((x) => `${x.px}px « ${x.t} »`).join(" · "));
      console.log(`  CAPITALES (${m.capitales.length}) :`, m.capitales.join(" · ") || "aucune");
      await page.close();
    }
  } finally {
    await nav.close();
  }

  fs.writeFileSync(`${DOSSIER}/notes.json`, JSON.stringify(notes, null, 1));
  console.log(`\n=== ${notes.length} pages capturees dans outils/pages/ ===`);
})().catch((e) => { console.error("\nECHEC:", e.message); process.exit(1); });
