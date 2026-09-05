// TOUS LES ECRANS DE L'APPLI DES CLUBS, PHOTOGRAPHIES.
//
// Pendant de `pages_b2b.cjs` (les pages publiques) et de
// `dashboard_client.cjs`. But : voir l'appli du gerant EN ENTIER d'un
// coup -- les six ecrans d'installation puis les cinq de l'appli --
// sans avoir a la traverser au doigt. Julien, 05/09/2026 : "moi
// l'application totale en capture, ce serait bien".
//
//   node outils/appli_club.cjs
//   VN_URL=http://127.0.0.1:5173 node outils/appli_club.cjs   (build local)
//
// Sortie : outils/pages-club/*.png (retine, pour regarder de pres)
//          outils/pages-club/*.jpg (1x, pour la planche-contact)
//
// ⚠️ LE PARCOURS D'INSTALLATION N'EST PAS TRAVERSABLE SANS COMPTE.
// Ses six ecrans sont pourtant TOUS rendus dans le DOM des l'ouverture
// (ouvrirParcours() remplit la grille, le bareme et les profils avant
// d'afficher le premier). On ne rejoue donc pas le parcours : on
// bascule quelle etape est visible, exactement ce que fait allerAuPas()
// -- sans avoir a poser un crochet de mise au point dans le produit.
//
// Ce que ces captures NE montrent pas, et c'est normal :
//   - l'ecran 6 est vide (affiche A4 et bilan ont besoin d'une session) ;
//   - les chiffres viennent de fallbackDashboardData, pas d'un vrai club.

const fs = require("fs");
const puppeteer = require("puppeteer-core");

const PROD = "https://viralnight-koif.vercel.app";
const SITE = process.env.VN_URL || PROD;
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const DOSSIER = `${__dirname}/pages-club`;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/* Le mockup vit au milieu d'une page de presentation qui n'a rien a
   faire sur une capture d'appli : on la replie, on ne la modifie pas. */
const CADRER = `
  .wrap { padding: 10px 0 0 !important; }
  .stage { padding: 0 !important; }
  .kicker, .wrap > h1, .lede { display: none !important; }
`;

/* Bascule l'etape visible du parcours. Reproduit l'effet VISIBLE de
   allerAuPas() (section, compteur, jauge, mascotte, libelle du bouton)
   sans toucher a l'etat interne : la capture montre ce que le gerant
   verrait, pas un ecran a moitie monte. */
function etapeVisible(n) {
  const etape = document.querySelector('.pa-etape[data-pas="' + n + '"]');
  document.querySelectorAll(".pa-etape").forEach((s) => {
    s.hidden = Number(s.dataset.pas) !== n;
  });
  document.querySelector("#pa-compteur-n").textContent = String(n).padStart(2, "0");
  [...document.querySelectorAll("#pa-jauge span")].forEach((s, i) => {
    s.classList.toggle("faite", i < n);
  });
  // La pose vient de l'attribut data-mascotte de l'etape, la meme source
  // que rendreMascotte(). Cet outil en avait sa propre copie, et la
  // planche a continue d'afficher les anciennes poses une fois l'appli
  // corrigee.
  document.querySelector("#pa-mascotte").innerHTML =
    '<img src="' + etape.dataset.mascotte + '" alt="" />';
  document.querySelector("#pa-retour").hidden = n <= 1;
  document.querySelector("#pa-suivant").textContent = n === 6 ? "Terminer" : "Continuer";
  document.querySelector("#pa-corps").scrollTop = 0;
}

/* La galerie remplie. Les deux seules photos du depot servent de fond a
   la landing et a la page de connexion -- ce ne sont PAS les photos d'un
   club, et Julien l'a deja dit une fois. Elles ne sont ici que pour
   montrer la FORME de l'ecran une fois rempli, et la capture le dit dans
   son nom de fichier. */
function remplirGalerie() {
  const P = ["/ambiance/hero-nightclub.webp", "/ambiance/hero-auth.jpg"];
  const couv = document.querySelector("#pa-photo-vue");
  couv.innerHTML = '<img src="' + P[0] + '" alt="" />';
  document.querySelector("#pa-photo-btn").classList.add("remplie");
  document.querySelector("#pa-photo-titre").textContent = "Remplacer";

  const croix = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const plus = '<svg viewBox="0 0 24 24"><path d="M12 5.5v13M5.5 12h13"/></svg>';
  const cases = [];
  for (let i = 0; i < 4; i++) {
    if (i < 3) {
      cases.push(
        '<button type="button" class="pa-vign"><img src="' + P[i % 2] + '" alt="" />' +
        '<span class="pa-vign-x">' + croix + "</span></button>"
      );
    } else {
      cases.push('<button type="button" class="pa-vign vide">' + plus + "</button>");
    }
  }
  document.querySelector("#pa-galerie").innerHTML = cases.join("");
  document.querySelector("#pa-galerie-aide").textContent = "3 photos sur 4";
}

(async () => {
  fs.rmSync(DOSSIER, { recursive: true, force: true });
  fs.mkdirSync(DOSSIER, { recursive: true });

  const navigateur = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: ["--force-color-profile=srgb", "--hide-scrollbars"],
  });
  const page = await navigateur.newPage();
  await page.setViewport({ width: 520, height: 900, deviceScaleFactor: 2 });

  const faites = [];
  async function prendre(nom, titre) {
    const cadre = await page.$(".phone");
    await cadre.screenshot({ path: `${DOSSIER}/${nom}.png` });
    // Une deuxieme passe en 1x/JPEG : la planche-contact embarque les
    // images en base64, la version retine y peserait dix fois plus.
    await page.setViewport({ width: 520, height: 900, deviceScaleFactor: 1 });
    await (await page.$(".phone")).screenshot({ path: `${DOSSIER}/${nom}.jpg`, type: "jpeg", quality: 78 });
    await page.setViewport({ width: 520, height: 900, deviceScaleFactor: 2 });
    faites.push({ nom, titre });
    console.log(`  ${nom}  ${titre}`);
  }

  /* Un DETAIL : une bande de l'ecran, sans le cadre du telephone.
     Photographier deux fois l'ecran entier pour montrer un bloc qui
     change, ca donne deux telephones presque identiques cote a cote --
     et sur la planche, deux fois la meme mascotte en haut. Une bande
     dit "regarde ici", et ne rejoue pas ce qu'on vient de voir. */
  async function detail(nom, titre, selecteurs) {
    const boite = await page.evaluate((sel) => {
      // Le bloc vise deborde souvent sous le pli : on descend d'abord,
      // sinon la decoupe emporte le fond de la page a la place de sa fin.
      const corps = document.querySelector("#pa-corps");
      corps.scrollTop = corps.scrollHeight;

      const vus = sel.map((s) => document.querySelector(s)).filter(Boolean);
      if (!vus.length) return null;
      const r = vus.map((e) => e.getBoundingClientRect());
      const haut = Math.min(...r.map((b) => b.top));
      const bas = Math.max(...r.map((b) => b.bottom));

      // Bornee a l'ecran : sans ca la decoupe attrape les coins arrondis
      // du mockup et le noir qui les entoure.
      const ec = document.querySelector(".screen").getBoundingClientRect();
      const y = Math.max(ec.top + 6, haut - 12);
      const y2 = Math.min(ec.bottom - 6, bas + 12);
      return { x: ec.left + 8, y: y, width: ec.width - 16, height: y2 - y };
    }, selecteurs);
    if (!boite) return console.log(`  (detail ${nom} introuvable)`);

    await page.screenshot({ path: `${DOSSIER}/${nom}.png`, clip: boite });
    await page.setViewport({ width: 520, height: 900, deviceScaleFactor: 1 });
    await page.screenshot({ path: `${DOSSIER}/${nom}.jpg`, type: "jpeg", quality: 82, clip: boite });
    await page.setViewport({ width: 520, height: 900, deviceScaleFactor: 2 });
    faites.push({ nom, titre, detail: Math.round(boite.width) + "x" + Math.round(boite.height) });
    console.log(`  ${nom}  ${titre}  (detail)`);
  }

  console.log(`\nAppli club — ${SITE}\n`);

  await page.goto(`${SITE}/club-app.html?cb=${Date.now()}`, { waitUntil: "networkidle2" });
  await page.addStyleTag({ content: CADRER });
  // Le splash dure ~1,1 s, puis demarrer() lit la base ou retombe sur
  // les donnees de demonstration.
  await pause(3000);

  console.log("Parcours d'installation");
  const ETAPES = [
    [1, "Ton compte"],
    [2, "Ton club — nom, ville, photos"],
    [3, "Tes récompenses"],
    [4, "Ton barème"],
    [5, "Ton Instagram"],
    [6, "Tout est prêt"],
  ];
  for (const [n, titre] of ETAPES) {
    await page.evaluate(etapeVisible, n);
    await pause(700);
    await prendre(`0${n}-installation-${n}`, `Étape ${n}/6 — ${titre}`);
    if (n === 2) {
      await page.evaluate(remplirGalerie);
      await pause(900);
      await detail("02b-galerie-remplie", "Les photos, une fois posées",
        [".pa-legende", "#pa-photo-btn", "#pa-galerie", "#pa-galerie-aide"]);
      await page.evaluate(etapeVisible, 2);
    }
  }

  console.log("L'appli");
  await page.evaluate(() => document.querySelector("#pa-passer").click());
  await pause(1400);

  const ONGLETS = [
    ["dashboard", "07-tableau-de-bord", "Tableau de bord"],
    ["recompenses", "09-recompenses", "Boutique de récompenses"],
    ["reglages", "11-reglages", "Réglages"],
  ];
  for (const [onglet, nom, titre] of ONGLETS) {
    await page.evaluate((o) => document.querySelector(`.tab[data-tab="${o}"]`).click(), onglet);
    await pause(900);
    await prendre(nom, titre);

    if (onglet === "dashboard") {
      await page.evaluate(() => { document.querySelector("#vue-dashboard").scrollTop = 460; });
      await pause(500);
      await prendre("08-tableau-de-bord-activite", "Tableau de bord — activité récente");
      await page.evaluate(() => { document.querySelector("#vue-dashboard").scrollTop = 0; });
    }
    if (onglet === "recompenses") {
      await page.evaluate(() => { document.querySelector(".recompense-carte").open = true; });
      await pause(600);
      await prendre("10-recompense-ouverte", "Une récompense, dépliée");
      await page.evaluate(() => { document.querySelector(".recompense-carte").open = false; });
    }
  }

  console.log("Les écrans de réglage");
  const SOUS = [
    ["bareme", "12-bareme", "Barème de points"],
    ["qr", "13-qr", "Affiche et QR code"],
  ];
  for (const [va, nom, titre] of SOUS) {
    await page.evaluate((v) => document.querySelector(`[data-va="${v}"]`).click(), va);
    // Le QR et l'affiche sont dessines sur un canvas : plus lent que le
    // reste, et une capture prise trop tot montre un cadre vide.
    await pause(va === "qr" ? 3000 : 900);
    await prendre(nom, titre);
    await page.evaluate(() => document.querySelector('[data-va="reglages"]').click());
    await pause(500);
  }

  fs.writeFileSync(`${DOSSIER}/ecrans.json`, JSON.stringify(faites, null, 2));
  await navigateur.close();
  console.log(`\n${faites.length} écrans dans outils/pages-club/\n`);
})();
