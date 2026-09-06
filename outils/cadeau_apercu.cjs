// LE CADEAU DU JOUR ET LE BONUS DE BIENVENUE, EN IMAGES.
//
//   node outils/cadeau_apercu.cjs
//   VN_URL=http://127.0.0.1:5173 node outils/cadeau_apercu.cjs
//
// Sortie : outils/pages-cadeau/*.png (retine) + *.jpg (1x, pour envoyer)
//
// ⚠️ POURQUOI UN OUTIL A PART, ET CE QU'IL SIMULE.
// Les migrations 0040 et 0041 vivent dans le depot 06-pwa-clubbeurs et
// ne sont PAS appliquees : daily_gift_status() et welcome_bonus_status()
// n'existent pas encore en base, donc la carte ne s'affiche jamais toute
// seule -- verifierCadeau() se tait, c'est voulu.
//
// Ce script POSE DONC A LA MAIN ce que le serveur repondrait, puis
// photographie. Le dessin, les tailles, les couleurs et la place de la
// carte dans l'ecran sont ceux du vrai code ; seules les VALEURS sont
// simulees. Le jour ou les migrations passent, ces captures deviennent
// inutiles : l'appli les produira d'elle-meme.
//
// Il ne cree aucun compte et n'ecrit dans aucune base.

const fs = require("fs");
const puppeteer = require("puppeteer-core");

const PROD = "https://viralnight-koif.vercel.app";
const SITE = process.env.VN_URL || PROD;
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const DOSSIER = `${__dirname}/pages-cadeau`;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// iPhone 14 : la taille pour laquelle --u a ete calibre.
const LARGEUR = 390;
const HAUTEUR = 844;

// L'escalier de la migration 0040. Recopie ici parce que la base ne
// repond pas encore -- a resynchroniser si daily_gift_ladder change.
const ECHELLE = [2, 3, 4, 5, 6, 8, 20];

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

  async function prendre(nom, titre) {
    await page.screenshot({ path: `${DOSSIER}/${nom}.png` });
    await cadrer(1);
    await page.screenshot({ path: `${DOSSIER}/${nom}.jpg`, type: "jpeg", quality: 80 });
    await cadrer(2);
    console.log(`  ${nom}  ${titre}`);
  }

  // Pose l'etat d'une carte. `classes` reprend exactement celles que
  // pose le vrai code (bienvenue / ouvert / jackpot / message), et
  // `pris` remplit la marche du jour au lieu de la surligner -- ce que
  // fait le vrai code une fois le cadeau recupere.
  //
  // `salve` rejoue la volee de confettis et LA FIGE : elle dure moins
  // d'une seconde, une capture prise apres coup ne montrerait rien. Le
  // dessin, les couleurs et les distances sont ceux de confettis() dans
  // l'appli ; seul le temps est arrete.
  async function poser({ solde, titre, montant, sous, jour, classes, pris, salve }) {
    await page.evaluate((e) => {
      const num = document.querySelector("#solde-num");
      if (num) num.textContent = String(e.solde);

      const carte = document.querySelector("#cadeau");
      carte.className = "cadeau" + (e.classes ? " " + e.classes : "");
      document.querySelector("#cadeau-titre").textContent = e.titre;
      document.querySelector("#cadeau-montant").textContent = e.montant;

      const sous = document.querySelector("#cadeau-sous");
      sous.textContent = e.sous || "";
      sous.hidden = !e.sous;

      const jours = document.querySelector("#cadeau-jours");
      jours.innerHTML = e.echelle.map((points, i) => {
        const j = i + 1;
        const c = e.pris
          ? (j <= e.jour ? " fait" : "")
          : (j < e.jour ? " fait" : (j === e.jour ? " aujourdhui" : ""));
        return `<li class="cadeau-jour${c}">${points}</li>`;
      }).join("");

      const boite = document.querySelector("#cadeau-boite");
      boite.querySelector(".confettis")?.remove();
      if (e.salve) {
        const couleurs = ["#ff6b5b", "#e2b23f", "#818cf8", "#57d98a", "#ff6b5b", "#818cf8"];
        let html = "";
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          html += `<i style="--x:${Math.round(Math.cos(a) * 34)}px;--y:${Math.round(Math.sin(a) * 34)}px;` +
                  `--r:${Math.round(Math.random() * 240 - 120)}deg;--c:${couleurs[i]}"></i>`;
        }
        boite.insertAdjacentHTML("beforeend", `<span class="confettis">${html}</span>`);
        boite.querySelectorAll(".confettis i").forEach((el) =>
          el.getAnimations().forEach((an) => { an.pause(); an.currentTime = 200; }));
      }

      // Le montant grossit en arrivant : fige a la fin, sinon la capture
      // l'attrape a mi-course et il parait simplement trop petit.
      document.querySelectorAll("#cadeau .cadeau-montant").forEach((el) =>
        el.getAnimations().forEach((an) => { an.pause(); an.currentTime = 420; }));

      carte.hidden = false;
      window.scrollTo(0, 0);
    }, {
      solde, titre, montant, sous: sous || "", jour: jour || 0,
      classes: classes || "", pris: !!pris, salve: !!salve, echelle: ECHELLE,
    });
    await pause(500);
  }

  console.log(`\nCadeau du jour — ${SITE}\n`);

  await page.goto(`${SITE}/app-preview.html?app=1&cb=${Date.now()}`, { waitUntil: "networkidle2" });
  await pause(3500);

  // Comme une session : c'est la classe que pose l'appli une fois
  // connectee. On arrive sur Recompenses, l'onglet par defaut.
  await page.evaluate(() => document.querySelector("#vue-accueil").classList.add("masque"));
  await pause(1200);
  await page.evaluate(() => document.querySelector("#tab-boutique").click());
  await pause(2000);

  // ---- 1. On vient de scanner un club et de creer son compte ----
  // Solde a zero : le scan lui-meme rapporte 15 points (qrCheckin), mais
  // on montre ici le pire cas, celui ou la carte est seule a l'ecran.
  await poser({
    solde: 0, titre: "Bienvenue", montant: "50 points", classes: "bienvenue",
  });
  await prendre("01-bienvenue", "Le bonus, juste sous le solde");

  // ---- 2. Recupere ----
  await poser({
    solde: 50, titre: "Récupéré", montant: "+50 pts", sous: "Dans ta boutique Le Mirage",
    classes: "bienvenue ouvert", salve: true,
  });
  await prendre("02-bienvenue-recupere", "Recupere — la carte s'en va juste apres");

  // ---- 3. Le cadeau du jour, quatrieme marche ----
  await poser({
    solde: 65, titre: "Cadeau du jour", montant: "5 points", jour: 4,
  });
  await prendre("03-escalier-jour4", "Jour 4 — le montant est annonce");

  // ---- 4. Recupere : la marche rejoint les pleines ----
  await poser({
    solde: 70, titre: "Récupéré", montant: "+5 pts", sous: "Dans ta boutique Le Mirage",
    jour: 4, classes: "ouvert", pris: true, salve: true,
  });
  await prendre("04-escalier-recupere", "Recupere — la marche se remplit");

  // ---- 5. Le jackpot, 1 fois sur 100 ----
  await poser({
    solde: 105, titre: "Jackpot", montant: "+40 pts", sous: "Dans ta boutique Le Mirage",
    jour: 4, classes: "ouvert jackpot", pris: true, salve: true,
  });
  await prendre("05-jackpot", "Le jackpot — un mot change, pas la carte");

  // ---- 6. Le septieme jour, celui qui fait revenir ----
  await poser({
    solde: 96, titre: "Cadeau du jour", montant: "20 points", jour: 7,
  });
  await prendre("06-escalier-jour7", "Jour 7 — la grosse marche");

  // ---- 7. Le cas sans club ----
  await poser({
    solde: 0, titre: "", montant: "Scanne un club d'abord",
    sous: "Les points vont dans la boutique de ton dernier club.",
    classes: "ouvert message",
  });
  await prendre("07-aucun-club", "Sans club scanne — rien a payer, on le dit");

  await navigateur.close();
  console.log(`\n-> ${DOSSIER}\n`);
})();
