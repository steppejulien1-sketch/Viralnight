// CHASSE AUX BUGS SUR TOUTES LES PAGES DU SITE (prod par defaut).
//
//   node outils/chasse_bugs_site.cjs
//   VN_CAPTURES=dossier node outils/chasse_bugs_site.cjs
//
// Chaque page de vite.config.js, au telephone (390) et au PC (1400), avec
// la session qui lui correspond : aucune (pages publiques), un gerant
// jetable qui a SON club (tableau de bord et pages du club), l'admin
// (pilotage, admin). Releve : erreurs JavaScript, requetes en echec,
// debordement horizontal, images cassees, texte d'erreur visible.
// On ne clique sur rien : lecture seule. Le gerant jetable et son club
// sont supprimes a la fin.

const fs = require("fs");
const puppeteer = require("puppeteer-core");
const B = require("./lib_b2b.cjs");
const V = require("../../06-pwa-clubbeurs/outils/lib_vn.cjs");

const SITE = process.env.VN_URL || "https://viralnight-koif.vercel.app";
const CAPTURES = process.env.VN_CAPTURES || "";
if (CAPTURES) fs.mkdirSync(CAPTURES, { recursive: true });
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const CLE = `sb-${B.REF}-auth-token`;

const PUBLIQUES = ["index.html", "connexion.html", "inscription.html", "simulateur.html", "demo.html", "scan.html", "mentions-legales.html", "confidentialite.html", "cgu.html", "cookies.html", "suppression-compte.html", "carte-preview.html", "apercu.html"];
const GERANT = ["app.html", "bienvenue.html", "live.html", "qr.html", "setup.html", "viral-intelligence.html", "chat.html"];
const ADMIN = ["pilotage.html", "admin.html", "admin-prospection.html"];

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
  const bilan = {};
  let uid = null, etabId = null, navigateur = null;
  try {
    // Gerant jetable avec son club
    const email = `e2e-site-${Date.now()}@viralnight.test`;
    const [st, u] = await B.admin("/auth/v1/admin/users", "POST", { email, password: "E2e-" + Math.random().toString(36).slice(2), email_confirm: true });
    if (st >= 400) throw new Error("user " + JSON.stringify(u));
    uid = u.id;
    const sGerant = await session(email);
    const c = await fetch(`${SITE}/api/create-client`, { method: "POST", headers: { Authorization: "Bearer " + sGerant.access_token, "Content-Type": "application/json" }, body: JSON.stringify({ establishment_name: "Site Test " + Date.now().toString().slice(-5), city: "Bruxelles" }) });
    etabId = (await c.json()).establishment_id;
    const sAdmin = await session("steppejulien1@gmail.com");

    navigateur = await puppeteer.launch({ executablePath: B.CHROME, headless: "new", args: ["--hide-scrollbars"] });
    const lots = [[PUBLIQUES, null], [GERANT, sGerant], [ADMIN, sAdmin]];
    for (const [pages, sess] of lots) {
      for (const nom of pages) {
        for (const [w, h] of [[390, 844], [1400, 900]]) {
          const cle = `${nom} @${w}`;
          const r = { js: [], req: [] };
          const contexte = await navigateur.createBrowserContext();
          const page = await contexte.newPage();
          await page.setViewport({ width: w, height: h, isMobile: w < 500, hasTouch: w < 500 });
          page.on("pageerror", (e) => r.js.push(e.message.slice(0, 160)));
          page.on("response", (x) => { if (x.status() >= 400 && !/favicon|google-analytics|maptiler/.test(x.url())) r.req.push(x.status() + " " + x.url().replace(SITE, "").slice(0, 120)); });
          try {
            if (sess) {
              await page.goto(`${SITE}/cookies.html`, { waitUntil: "domcontentloaded" });
              await page.evaluate((k, v) => localStorage.setItem(k, v), CLE, JSON.stringify(sess));
            }
            await page.goto(`${SITE}/${nom}?cb=${Date.now()}`, { waitUntil: "networkidle2", timeout: 45000 });
            await pause(4000);
            Object.assign(r, await page.evaluate(() => {
              const W = document.documentElement.clientWidth;
              const hors = [...document.querySelectorAll("body *")].filter((e) => {
                if (!e.getClientRects().length || e.closest("svg")) return false;
                const b = e.getBoundingClientRect();
                return b.width > 0 && b.right > W + 2 && getComputedStyle(e).position !== "fixed";
              });
              const texte = document.body.innerText || "";
              return {
                url: location.pathname,
                scroll: document.documentElement.scrollWidth > W + 1 ? document.documentElement.scrollWidth : 0,
                hors: [...new Set(hors.map((e) => e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + "." + String(e.className || "").split(" ")[0]))].slice(0, 4),
                images: [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.src && i.getClientRects().length).map((i) => i.src.slice(-50)),
                erreursVisibles: (texte.match(/[^\n]*(erreur|error|impossible|undefined|NaN|null|introuvable|n'a pas pu|échoué)[^\n]*/gi) || []).slice(0, 4).map((t) => t.slice(0, 120)),
              };
            }));
            if (CAPTURES) await page.screenshot({ path: `${CAPTURES}/${nom.replace(".html", "")}-${w}.png` });
          } catch (e) {
            r.plantage = e.message.slice(0, 160);
          }
          // On ne garde que ce qui signale quelque chose.
          const utile = Object.fromEntries(Object.entries(r).filter(([k, v]) => (Array.isArray(v) ? v.length : v) && k !== "url" || (k === "url" && v !== "/" + nom)));
          if (Object.keys(utile).length) bilan[cle] = utile;
          await contexte.close();
        }
      }
    }
  } catch (e) {
    bilan.plantage = e.message;
  } finally {
    if (navigateur) await navigateur.close();
    if (etabId) {
      try { V.sql(`delete from public.rewards where club_id in (select id from public.clubs where establishment_id='${etabId}'); delete from public.clubs where establishment_id='${etabId}';`); } catch (e) {}
      try { B.sql(`delete from public.establishments where id='${etabId}'`); } catch (e) { bilan.menageEtab = e.message; }
    }
    if (uid) await B.admin(`/auth/v1/admin/users/${uid}`, "DELETE");
    console.log(JSON.stringify(bilan, null, 1));
  }
})();
