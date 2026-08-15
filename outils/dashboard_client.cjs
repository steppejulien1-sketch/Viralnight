// LE TABLEAU DE BORD CLIENT (app.html), VU PAR UN VRAI COMPTE.
//
// ⚠️ Compte JETABLE, cree puis supprime a la fin. On ne se connecte pas
// sur le compte personnel de Julien pour regarder une page.
//
// Ce que ca montre : l'etat qu'obtient un gerant qui vient de s'inscrire
// et qui n'est rattache a AUCUN etablissement — aujourd'hui la table
// establishment_owners est VIDE, donc c'est l'etat de tout le monde.
//
// ⚠️ POURQUOI ON VISE LE BUILD LOCAL ET PAS LA PROD.
// Arriver sur app.html par la redirection d'un lien magique declenche le
// « Point de controle de securite » de Vercel (code 21) : la page rendue
// est celle de Vercel, pas la notre. On ne cherche pas a contourner cette
// protection — on se place avant elle, sur le build local, et on installe
// la session a la main plutot que de passer par une redirection.
//
// Lancer d'abord : npm run build && npx vite preview --port 5173

const fs = require("fs");
const puppeteer = require("puppeteer-core");
const V = require("./lib_b2b.cjs");

const SITE = process.env.VN_URL || "http://127.0.0.1:5173";
const DOSSIER = `${__dirname}/pages-app`;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

function anon() {
  const fichier = `${__dirname}/../.env.local`;
  for (const l of fs.readFileSync(fichier, "utf8").replace(/^﻿/, "").split(/\r?\n/)) {
    if (l.trim().startsWith("VITE_SUPABASE_ANON_KEY=")) return l.split("=").slice(1).join("=").trim();
  }
  return null;
}

(async () => {
  fs.rmSync(DOSSIER, { recursive: true, force: true });
  fs.mkdirSync(DOSSIER, { recursive: true });

  const email = `e2e-app-${Date.now()}@viralnight.test`;
  const motDePasse = "E2e-" + Math.random().toString(36).slice(2) + "A1!";
  const [st, u] = await V.admin("/auth/v1/admin/users", "POST", {
    email, password: motDePasse, email_confirm: true,
  });
  if (st >= 400) throw new Error("creation compte : " + JSON.stringify(u));
  console.log("compte jetable :", email);

  // Session obtenue directement, sans redirection : c'est exactement le
  // jeton que supabase-js range dans localStorage apres une connexion.
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

    await page.evaluateOnNewDocument((cle, valeur) => {
      localStorage.setItem(cle, valeur);
    }, `sb-${V.REF}-auth-token`, JSON.stringify(session));

    await page.goto(`${SITE}/app.html`, { waitUntil: "networkidle2", timeout: 60000 });
    await pause(4500);
    await page.screenshot({ path: `${DOSSIER}/1-dashboard.png`, fullPage: true });

    const vu = await page.evaluate(() => ({
      url: location.pathname,
      statut: document.querySelector("[data-status], .data-status, #dataStatus, .status-chip")?.textContent?.trim() || null,
      club: document.querySelector("[data-establishment-name]")?.textContent?.trim() || null,
      connecte: !!Object.keys(localStorage).find((k) => k.includes("auth-token")),
      texte: document.body.innerText.replace(/\n{2,}/g, "\n").split("\n").slice(0, 26),
    }));
    console.log("\nURL       :", vu.url);
    console.log("Session   :", vu.connecte ? "presente" : "ABSENTE");
    console.log("Bandeau   :", vu.statut);
    console.log("Club affiche :", vu.club);
    console.log("Ecran     :", vu.texte.join(" | "));
    console.log(erreurs.length ? "\n⚠ ERREURS CONSOLE :\n  " + erreurs.join("\n  ") : "\naucune erreur console");
  } finally {
    await nav.close();
    await V.admin(`/auth/v1/admin/users/${u.id}`, "DELETE");
    console.log("compte jetable supprime");
  }
})().catch((e) => { console.error("\nECHEC:", e.message); process.exit(1); });
