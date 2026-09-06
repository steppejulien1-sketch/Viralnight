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

// L'escalier de la migration 0040 : le montant du jour vient de la
// marche atteinte. La rangee des sept marches n'est plus dessinee dans
// la carte, mais l'escalier existe toujours en base -- ces valeurs
// servent a choisir un montant credible pour les captures.
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
  // pose le vrai code (bienvenue / ouvert / jackpot / message).
  //
  // `salve` rejoue la volee de confettis et LA FIGE : elle dure moins
  // d'une seconde, une capture prise apres coup ne montrerait rien. Le
  // dessin, les couleurs et les distances sont ceux de confettis() dans
  // l'appli ; seul le temps est arrete.
  async function poser({ solde, titre, montant, sous, classes, salve }) {
    await page.evaluate((e) => {
      const num = document.querySelector("#solde-num");
      if (num) num.textContent = String(e.solde);

      /* La barre suit le nombre pose ci-dessus. Sans ca elle reste vide
         sur toutes les captures -- majProgressionSolde() lit ETAT.solde,
         que ce script ne touche pas. Premier palier a 300 points. */
      const piste = document.querySelector("#solde-prog-piste");
      if (piste) {
        const part = Math.max(e.solde > 0 ? 4 : 0, Math.min(100, (e.solde / 300) * 100));
        piste.innerHTML = `<span class="solde-prog-barre" style="width:${part}%"></span>`;
      }

      const carte = document.querySelector("#cadeau");
      carte.className = "cadeau" + (e.classes ? " " + e.classes : "");
      document.querySelector("#cadeau-titre").textContent = e.titre;
      document.querySelector("#cadeau-montant").textContent = e.montant;

      const sous = document.querySelector("#cadeau-sous");
      sous.textContent = e.sous || "";
      sous.hidden = !e.sous;


      const boite = document.querySelector("#cadeau-scene");
      boite.querySelector(".confettis")?.remove();
      if (e.salve) {
        const couleurs = ["#ff6b5b", "#e2b23f", "#818cf8", "#57d98a", "#ff6b5b", "#818cf8"];
        let html = "";
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          html += `<i style="--x:${Math.round(Math.cos(a) * 44)}px;--y:${Math.round(Math.sin(a) * 44)}px;` +
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
    }, { solde, titre, montant, sous: sous || "", classes: classes || "", salve: !!salve });
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
  await prendre("01-bienvenue", "Le bonus de bienvenue");

  // ---- 2. Le cadeau du jour ----
  await poser({
    solde: 65, titre: "Cadeau du jour", montant: "5 points",
  });
  await prendre("02-cadeau", "Le cadeau — le montant est annonce avant le clic");

  // ---- 3. L'instant du clic ----
  // Le bouton s'en va, la salve part, le solde a deja monte. La carte
  // n'ecrit PLUS "Recupere, +5 pts, dans ta boutique X" -- Julien : "il
  // vaut mieux que ca disparaisse [...] sinon ca prend trop de place".
  await poser({
    solde: 70, titre: "Cadeau du jour", montant: "5 points",
    classes: "ouvert", salve: true,
  });
  await prendre("03-cadeau-salve", "Au clic — la salve, et le solde qui monte");

  // ---- 4. Une seconde plus tard : la carte n'est plus la ----
  await page.evaluate(() => {
    const carte = document.querySelector("#cadeau");
    carte.classList.add("part");
    carte.style.transition = "none";
  });
  await pause(400);
  await prendre("04-apres", "Apres — la boutique a repris la place");

  // ---- 5. Le septieme jour : la marche haute de l'escalier ----
  await page.evaluate(() => {
    const carte = document.querySelector("#cadeau");
    carte.style.transition = "";
  });
  await poser({
    solde: 96, titre: "Cadeau du jour", montant: "20 points",
  });
  await prendre("05-cadeau-jour7", "Septieme jour d'affilee — 20 points");

  // ---- 6. Le cas sans club ----
  await poser({
    solde: 0, titre: "", montant: "Scanne un club d'abord",
    sous: "Les points vont dans la boutique de ton dernier club.",
    classes: "ouvert message",
  });
  await prendre("06-aucun-club", "Sans club scanne — rien a payer, on le dit");

  // ---- 7. La boutique, pour verifier le cadrage des dessins ----
  // Les illustrations sont carrees dans un cadre 4/3 : avec `cover` elles
  // etaient rognees en haut et en bas. Cette capture est la pour que ca
  // se revoie d'un coup d'oeil.
  await page.evaluate(() => {
    document.querySelector("#cadeau").hidden = true;
    const v = document.querySelector("#vue-boutique");
    (v.querySelector(".app") || v).scrollTop = 380;
    v.scrollTop = 380;
    window.scrollTo(0, 380);
  });
  await pause(900);
  await prendre("07-boutique", "Les quatre recompenses — rien de coupe");

  // ---- 8. La fiche d'un club ----
  // Le lavis rouge du bloc de points, le libelle tronque, le "Ferme" en
  // rouge d'erreur, le lien en bleu Google et le coeur qui recouvrait la
  // croix : tout se voit sur une seule capture.
  await page.evaluate(() => document.querySelector("#tab-carte").click());
  await pause(2500);
  const ouverte = await page.evaluate(() => {
    const b = document.querySelector("#club-rail button");
    if (!b) return false;
    b.click();
    return true;
  });
  if (ouverte) {
    await pause(1800);
    await prendre("08-fiche-club", "La fiche d'un club");
  } else {
    console.log("  (pas de club dans le rail, fiche non capturee)");
  }

  await navigateur.close();
  console.log(`\n-> ${DOSSIER}\n`);
})();
