// L'ECRAN QUI DEBLOQUE LES POINTS : « Valider les contenus ».
//
// C'est lui qui se trouve entre les contenus deposes par les clubbeurs et
// les points reellement credites. Sept contenus y attendent aujourd'hui.
//
// ⚠️ Compte JETABLE **rattache temporairement** au Mirage, puis detache et
// supprime. On ne se connecte pas sur le compte de Julien, et on ne laisse
// pas un proprietaire fantome dans establishment_owners.
//
// Lancer d'abord : npm run build && npx vite preview --port 5173

const fs = require("fs");
const puppeteer = require("puppeteer-core");
const V = require("./lib_b2b.cjs");

const SITE = process.env.VN_URL || "http://127.0.0.1:5173";
const DOSSIER = `${__dirname}/pages-app`;
const MIRAGE = "128cfa6d-b8aa-4ff8-8598-79cb401c321e";
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

function anon() {
  for (const l of fs.readFileSync(`${__dirname}/../.env.local`, "utf8").split(/\r?\n/)) {
    if (l.trim().startsWith("VITE_SUPABASE_ANON_KEY=")) return l.split("=").slice(1).join("=").trim();
  }
  return null;
}

(async () => {
  fs.mkdirSync(DOSSIER, { recursive: true });

  const email = `e2e-valid-${Date.now()}@viralnight.test`;
  const motDePasse = "E2e-" + Math.random().toString(36).slice(2) + "A1!";
  const [st, u] = await V.admin("/auth/v1/admin/users", "POST", { email, password: motDePasse, email_confirm: true });
  if (st >= 400) throw new Error("creation compte : " + JSON.stringify(u));

  // Rattachement TEMPORAIRE au club, pour voir ce que voit un gerant reel.
  V.sql(`insert into public.establishment_owners (id, email, establishment_id, role)
         values ('${u.id}', '${email}', '${MIRAGE}', 'owner')`);
  console.log("compte jetable rattache au Mirage :", email);

  const r = await fetch(`${V.BASE}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anon(), "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: motDePasse }),
  });
  const session = await r.json();
  if (!session.access_token) throw new Error("connexion : " + JSON.stringify(session));

  const nav = await puppeteer.launch({
    executablePath: V.CHROME, headless: "new", protocolTimeout: 180000,
    defaultViewport: { width: 1400, height: 950 },
  });

  try {
    const page = await nav.newPage();
    const erreurs = [];
    page.on("console", (m) => { if (m.type() === "error") erreurs.push(m.text().slice(0, 160)); });

    await page.evaluateOnNewDocument((cle, valeur) => localStorage.setItem(cle, valeur),
      `sb-${V.REF}-auth-token`, JSON.stringify(session));

    await page.goto(`${SITE}/app.html`, { waitUntil: "networkidle2", timeout: 60000 });
    await pause(4500);
    await page.screenshot({ path: `${DOSSIER}/2-dashboard-reel.png`, fullPage: true });

    const vu = await page.evaluate(() => ({
      bandeau: document.querySelector("[data-data-status]")?.textContent?.trim() || null,
      club: document.querySelector("[data-establishment-name]")?.textContent?.trim() || null,
      promesse: document.querySelector("[data-promesse-chiffres]")?.textContent?.trim() || null,
      metriques: [...document.querySelectorAll("[data-metric]")].map((m) => [
        m.querySelector(".metric-label, h3, .metric-title")?.textContent?.trim() || m.dataset.metric,
        m.querySelector(".metric-value")?.textContent?.trim(),
        m.querySelector(".metric-caption")?.textContent?.trim(),
      ]),
    }));
    console.log("\nBandeau  :", vu.bandeau);
    console.log("Club     :", vu.club);
    console.log("Promesse :", vu.promesse);
    console.log("Mesures  :", JSON.stringify(vu.metriques));

    // L'ecran de validation, celui qui debloque les points.
    const lien = await page.evaluateHandle(() =>
      [...document.querySelectorAll("a,button,[data-view-link]")]
        .find((e) => /valider les contenus/i.test(e.textContent || "")) || null);
    if (lien.asElement()) {
      await lien.asElement().click();
      await pause(3000);
      await page.screenshot({ path: `${DOSSIER}/3-validation.png`, fullPage: true });
      const t = await page.evaluate(() => document.body.innerText.replace(/\n{2,}/g, "\n").split("\n").slice(0, 30));
      console.log("\nEcran de validation :", t.join(" | "));
    } else {
      console.log("\n⚠ « Valider les contenus » introuvable dans la page");
    }

    console.log(erreurs.length ? "\n⚠ ERREURS CONSOLE :\n  " + erreurs.join("\n  ") : "\naucune erreur console");
  } finally {
    await nav.close();
    V.sql(`delete from public.establishment_owners where id = '${u.id}'`);
    await V.admin(`/auth/v1/admin/users/${u.id}`, "DELETE");
    console.log("compte jetable detache et supprime");
  }
})().catch((e) => { console.error("\nECHEC:", e.message); process.exit(1); });
