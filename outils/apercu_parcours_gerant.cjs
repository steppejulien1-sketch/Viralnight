// L'APERCU EN DIRECT DU PARCOURS GERANT, EN CAPTURES (club-app.html).
//
//   VN_CAPTURES=dossier node outils/apercu_parcours_gerant.cjs
//   VN_URL=http://127.0.0.1:5173 ...   (local ; la creation du club passe par la prod)
//
// Un gerant jetable cree son club ; on avance dans le parcours en touchant
// chaque champ, et on photographie le telephone de l'apercu a chaque geste.
// La fiche Google est simulee (la cle Places manque encore sur Vercel).
// Nettoyage complet a la fin : club clubbeur, etablissement, photos, compte.

const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer-core");
const B = require("./lib_b2b.cjs");
const V = require("../../06-pwa-clubbeurs/outils/lib_vn.cjs");

const SITE = process.env.VN_URL || "https://viralnight-koif.vercel.app";
const PROD = "https://viralnight-koif.vercel.app";
const DOSSIER = process.env.VN_CAPTURES || "outils/pages-apercu-parcours";
fs.mkdirSync(DOSSIER, { recursive: true });
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function session(email) {
  const [st, l] = await B.admin("/auth/v1/admin/generate_link", "POST", { type: "magiclink", email });
  if (st >= 400) throw new Error("lien " + JSON.stringify(l));
  const anon = B.mgmt(`/projects/${B.REF}/api-keys`).find((k) => k.name === "anon").api_key;
  const r = await fetch(`${B.BASE}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "email", email, token: l.email_otp || l.properties?.email_otp }) });
  const j = await r.json();
  if (!j.access_token) throw new Error("verify " + JSON.stringify(j));
  return j;
}

(async () => {
  const bilan = { captures: [], erreursJs: [], console: [] };
  let uid = null, etabId = null, navigateur = null;
  const email = `e2e-apercu-${Date.now()}@viralnight.test`;
  try {
    const [st, u] = await B.admin("/auth/v1/admin/users", "POST", { email, password: "E2e-" + Math.random().toString(36).slice(2), email_confirm: true });
    if (st >= 400) throw new Error("user " + JSON.stringify(u));
    uid = u.id;
    const s = await session(email);
    const c = await fetch(`${PROD}/api/create-client`, { method: "POST", headers: { Authorization: "Bearer " + s.access_token, "Content-Type": "application/json" }, body: JSON.stringify({ establishment_name: "Apercu " + Date.now().toString().slice(-5), city: "Bruxelles" }) });
    const cr = await c.json();
    etabId = cr.establishment_id;
    if (!etabId) throw new Error("creation " + JSON.stringify(cr));

    navigateur = await puppeteer.launch({ executablePath: B.CHROME, headless: "new", args: ["--hide-scrollbars"] });
    const page = await navigateur.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    page.on("pageerror", (e) => bilan.erreursJs.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") bilan.console.push(m.text().slice(0, 200)); });
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (req.method() === "POST" && req.url().includes("/api/import-opening-hours") && /"action":"fiche"/.test(req.postData() || "")) {
        const h = (w, o, c) => ({ weekday: w, isOpen: o, opensAt: o ? c[0] : null, closesAt: o ? c[1] : null });
        return req.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, fiche: {
          placeId: "x", nom: "Le Velvet", adresse: "Rue du Marché au Charbon 12, 1000 Bruxelles", ville: "Bruxelles",
          lat: 50.846, lng: 4.349, type: "club", telephone: "0470 12 34 56", nbPhotos: 4,
          horaires: [h(0, false), h(1, false), h(2, false), h(3, false), h(4, true, ["23:00", "05:00"]), h(5, true, ["23:00", "06:00"]), h(6, true, ["23:00", "06:00"])],
        } }) });
      }
      req.continue();
    });

    await page.goto(`${SITE}/club-app.html`, { waitUntil: "domcontentloaded" });
    await page.evaluate((cle, val) => localStorage.setItem(cle, val), `sb-${B.REF}-auth-token`, JSON.stringify(s));
    await page.goto(`${SITE}/club-app.html?app=1&cb=${Date.now()}`, { waitUntil: "networkidle2" });
    await pause(6000);

    let n = 0;
    const capture = async (nom, attente = 1100) => {
      await pause(attente);
      const f = `${DOSSIER}/${String(++n).padStart(2, "0")}-${nom}.png`;
      await page.screenshot({ path: f });
      bilan.captures.push(f);
    };
    const toucher = (sel) => page.evaluate((x) => { const e = document.querySelector(x); if (e) { e.focus(); e.click(); } return !!e; }, sel);
    const taper = async (sel, texte) => {
      await page.evaluate((x) => { const e = document.querySelector(x); e.value = ""; e.focus(); }, sel);
      await page.type(sel, texte, { delay: 25 });
    };
    const suivant = async () => { await page.evaluate(() => document.getElementById("pa-suivant").click()); await pause(2600); };

    // 2 · la fiche, ecrite sur la page
    await capture("2-page-vide", 900);
    // Le bouton « Suivant » de la barre du haut : un ecran de plus, sans rien enregistrer.
    for (const k of [3, 4, 5, 6]) {
      await page.evaluate(() => document.getElementById("pa-avancer").click());
      await capture("saut-vers-" + k, 900);
    }
    for (let k = 0; k < 4; k++) { await page.evaluate(() => document.getElementById("pa-retour").click()); await pause(500); }

    await taper("#pa-nom", "Mirage Club Bruxelles");
    await capture("2-nom", 500);
    await taper("#pa-ville", "Bruxelles");
    await taper("#pa-adresse", "Avenue Louise 120");
    await taper("#pa-tel", "0470 12 34 56");
    await capture("2-tout-rempli", 600);
    await page.evaluate(() => document.activeElement.blur());
    await suivant();

    // 3 · la facade, puis les photos qui defilent
    await capture("3-facade-arrivee", 900);
    const PHOTO = path.resolve(__dirname, "../public/clubs/demo-velours.webp");
    const [choix] = await Promise.all([page.waitForFileChooser({ timeout: 5000 }), page.evaluate(() => document.getElementById("pa-photo-btn").click())]);
    await choix.accept([PHOTO]);
    await capture("3-facade-posee", 5000);
    for (const f of ["mirano-2.webp", "mirano-3.webp"]) {
      const [ch] = await Promise.all([page.waitForFileChooser({ timeout: 5000 }), page.evaluate(() => document.querySelector("#pa-galerie [data-galerie-ajouter]:not([disabled])").click())]);
      await ch.accept([path.resolve(__dirname, "../public/clubs/" + f)]);
      await pause(4000);
    }
    await page.evaluate(() => document.querySelector('.pa-etape[data-pas="3"] [data-pv-carte]').click());
    await capture("3-photo-suivante", 900);
    await suivant();

    // 4 · la boutique
    await capture("4-boutique-arrivee", 900);
    await page.evaluate(() => document.querySelector("#pa-grille .pa-tuile.prise")?.click());
    await capture("4-une-eteinte", 700);
    await page.evaluate(() => document.querySelector('#pa-grille [data-pas-prix="10"]').click());
    await page.evaluate(() => document.querySelector('#pa-grille [data-pas-prix="10"]').click());
    await capture("4-prix-monte", 700);
    await page.evaluate(() => document.getElementById("pa-corps").scrollTop = 400);
    await capture("4-bas", 500);
    await suivant();

    // 5 · les points, annonces
    await capture("5-points", 1400);
    await suivant();

    // 6 · Instagram
    await capture("6-instagram-arrivee", 900);
    await taper("#pa-handle", "@mirage.club");
    await capture("6-instagram-tape");
    await page.evaluate(() => document.activeElement.blur());
    await suivant();

    // 7 · la fin
    await capture("7-fin", 1500);
  } catch (e) {
    bilan.plantage = e.message;
  } finally {
    if (navigateur) await navigateur.close();
    if (etabId) {
      try { V.sql(`delete from public.rewards where club_id in (select id from public.clubs where establishment_id='${etabId}'); delete from public.clubs where establishment_id='${etabId}';`); } catch (e) { bilan.menageClubbeur = e.message; }
      try {
        const [, liste] = await B.admin("/storage/v1/object/list/reward-photos", "POST", { prefix: etabId, limit: 100 });
        const chemins = (liste || []).map((o) => `${etabId}/${o.name}`);
        if (chemins.length) await B.admin("/storage/v1/object/reward-photos", "DELETE", { prefixes: chemins });
      } catch (e) { bilan.menagePhotos = e.message; }
      try { B.sql(`delete from public.establishments where id='${etabId}'`); } catch (e) { bilan.menageEtab = e.message; }
    }
    if (uid) await B.admin(`/auth/v1/admin/users/${uid}`, "DELETE");
    console.log(JSON.stringify(bilan, null, 1));
  }
})();
