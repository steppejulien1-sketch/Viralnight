// CHASSE AUX BUGS DE L'APPLI DES GERANTS (club-app.html), AVEC UN GERANT JETABLE.
//
//   node outils/chasse_bugs_gerant.cjs          (prod)
//
// 1. un compte gerant neuf cree SON club par /api/create-client (inscription
//    ouverte), comme le ferait un vrai gerant ;
// 2. club-app.html s'ouvre avec sa session : chaque onglet est ouvert, les
//    erreurs JS et requetes en echec sont relevees ;
// 3. l'affiche QR doit sortir tout de suite (le club est ouvert cote
//    clubbeurs au passage).
// Nettoyage complet a la fin : club clubbeur, etablissement, compte.

const fs = require("fs");
const puppeteer = require("puppeteer-core");
const B = require("./lib_b2b.cjs");
const V = require("../../06-pwa-clubbeurs/outils/lib_vn.cjs");

const SITE = process.env.VN_URL || "https://viralnight-koif.vercel.app";
const CAPTURES = process.env.VN_CAPTURES || "";
if (CAPTURES) fs.mkdirSync(CAPTURES, { recursive: true });
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
  const bilan = { etapes: [], erreursJs: [], console: [], requetes: [] };
  let uid = null, etabId = null, navigateur = null, etape = "creation";
  const email = `e2e-gerant-${Date.now()}@viralnight.test`;
  try {
    const [st, u] = await B.admin("/auth/v1/admin/users", "POST", { email, password: "E2e-" + Math.random().toString(36).slice(2), email_confirm: true });
    if (st >= 400) throw new Error("user " + JSON.stringify(u));
    uid = u.id;
    const s = await session(email);
    const c = await fetch(`${SITE}/api/create-client`, { method: "POST", headers: { Authorization: "Bearer " + s.access_token, "Content-Type": "application/json" }, body: JSON.stringify({ establishment_name: "Chasse Gerant " + Date.now().toString().slice(-5), city: "Bruxelles" }) });
    const cr = await c.json();
    bilan.creation = { status: c.status, ...cr };
    etabId = cr.establishment_id;

    navigateur = await puppeteer.launch({ executablePath: B.CHROME, headless: "new", args: ["--hide-scrollbars"] });
    const page = await navigateur.newPage();
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    page.on("pageerror", (e) => bilan.erreursJs.push(`[${etape}] ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error") bilan.console.push(`[${etape}] ${m.text().slice(0, 200)}`); });
    page.on("response", (r) => { if (r.status() >= 400 && /supabase|\/api\//.test(r.url())) bilan.requetes.push(`[${etape}] ${r.status()} ${r.request().method()} ${r.url().slice(0, 150)}`); });

    etape = "ouverture";
    await page.goto(`${SITE}/club-app.html`, { waitUntil: "domcontentloaded" });
    await page.evaluate((cle, val) => localStorage.setItem(cle, val), `sb-${B.REF}-auth-token`, JSON.stringify(s));
    await page.goto(`${SITE}/club-app.html?app=1&cb=${Date.now()}`, { waitUntil: "networkidle2" });
    await pause(6000);
    const capture = async (nom) => { if (CAPTURES) await page.screenshot({ path: `${CAPTURES}/g-${String(bilan.etapes.length).padStart(2, "0")}-${nom}.png` }); };
    bilan.etapes.push({ nom: "arrivee", parcours: await page.evaluate(() => { const p = document.getElementById("parcours"); return !!p && !p.hidden && p.getClientRects().length > 0; }) });
    await capture("arrivee");

    // Le parcours d'installation : on avance jusqu'au bout avec le bouton principal.
    etape = "parcours";
    const PHOTO = require("path").resolve(__dirname, "../public/ambiance/bienvenue.webp");
    for (let i = 0; i < 10; i++) {
      // L'etape « Ta fiche Google » (17/09/2026) : on colle le lien du Mirano et on recupere.
      const aColler = await page.evaluate(() => { const c = document.getElementById("pa-google"); return !!c && c.getClientRects().length > 0 && !c.value && !document.querySelector("#pa-fiche:not([hidden])"); });
      if (aColler) {
        await page.evaluate(() => { const c = document.getElementById("pa-google"); c.value = "https://www.google.com/maps/place/Mirano/@50.84937,4.37139,17z"; document.getElementById("pa-google-btn").click(); });
        await pause(7000);
        bilan.etapes.push({ nom: "fiche google", fiche: await page.evaluate(() => { const f = document.getElementById("pa-fiche"); return f && !f.hidden ? f.innerText.replace(/\s+/g, " ") : (document.getElementById("pa-msg") || {}).textContent; }) });
        await capture("fiche-google");
      }
      // La photo de couverture est obligatoire : on en depose une, comme un gerant.
      const aCouvrir = await page.evaluate(() => { const b = document.getElementById("pa-photo-btn"); return !!b && b.getClientRects().length > 0 && !document.querySelector(".pa-couv.remplie"); });
      if (aCouvrir) {
        const [choix] = await Promise.all([page.waitForFileChooser({ timeout: 5000 }), page.evaluate(() => document.getElementById("pa-photo-btn").click())]);
        await choix.accept([PHOTO]);
        await pause(5000);
        bilan.etapes.push({ nom: "photo couverture", posee: await page.evaluate(() => !!document.querySelector(".pa-couv.remplie")) });
      }
      const suivant = await page.evaluate(() => {
        const p = document.getElementById("parcours");
        if (!p || p.hidden || !p.getClientRects().length) return null;
        // Le telephone est obligatoire a l'etape « Ton club » : on le remplit.
        p.querySelectorAll('input[type="tel"]').forEach((i) => {
          if (i.getClientRects().length && !i.value) {
            i.value = "0470 12 34 56";
            i.dispatchEvent(new Event("input", { bubbles: true }));
            i.dispatchEvent(new Event("change", { bubbles: true }));
          }
        });
        p.querySelectorAll('input[placeholder="@leclub"]').forEach((i) => {
          if (i.getClientRects().length && !i.value) {
            i.value = "chasse_gerant_test";
            i.dispatchEvent(new Event("input", { bubbles: true }));
            i.dispatchEvent(new Event("change", { bubbles: true }));
          }
        });
        const b = [...p.querySelectorAll("button")].filter((x) => x.getClientRects().length && !x.disabled).pop();
        if (!b) return "aucun bouton";
        const t = b.textContent.trim();
        b.click();
        return t;
      });
      if (!suivant) break;
      bilan.etapes.push({ nom: "parcours " + (i + 1), bouton: suivant });
      await pause(2500);
      await capture("parcours-" + (i + 1));
    }

    for (const onglet of ["dashboard", "recompenses", "bareme", "reglages"]) {
      etape = onglet;
      const ok = await page.evaluate((t) => { const b = document.querySelector(`[data-tab="${t}"]`); if (!b) return false; b.click(); return true; }, onglet);
      await pause(3000);
      bilan.etapes.push({ nom: onglet, clic: ok });
      await capture(onglet);
    }

    etape = "affiche";
    bilan.clubClubbeur = etabId ? V.sql(`select slug from public.clubs where establishment_id='${etabId}'`) : null;
  } catch (e) {
    bilan.plantage = `[${etape}] ${e.message}`;
  } finally {
    if (navigateur) await navigateur.close();
    if (etabId) {
      try { V.sql(`delete from public.rewards where club_id in (select id from public.clubs where establishment_id='${etabId}'); delete from public.clubs where establishment_id='${etabId}';`); } catch (e) { bilan.menageClubbeur = e.message; }
      try { B.sql(`delete from public.establishments where id='${etabId}'`); } catch (e) { bilan.menageEtab = e.message; }
    }
    if (etabId) {
      try {
        const [, liste] = await B.admin("/storage/v1/object/list/reward-photos", "POST", { prefix: etabId, limit: 100 });
        const chemins = (liste || []).map((o) => `${etabId}/${o.name}`);
        if (chemins.length) await B.admin("/storage/v1/object/reward-photos", "DELETE", { prefixes: chemins });
        bilan.photosEffacees = chemins.length;
      } catch (e) { bilan.menagePhotos = e.message; }
    }
    if (uid) await B.admin(`/auth/v1/admin/users/${uid}`, "DELETE");
    console.log(JSON.stringify(bilan, null, 1));
  }
})();
