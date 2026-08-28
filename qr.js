// Page gerant : affiche le QR code a imprimer et afficher dans le club.

import { isSupabaseConfigured, supabase } from "./supabaseClient.js";
import { buildScanUrl, renderQrSvg, renderQrPngDataUrl } from "./lib/tracking/qrCode.js";
import { escapeHtml } from "./lib/html/escape.js";

const els = {
  banner: document.getElementById("banner"),
  card: document.getElementById("qr-card"),
  visual: document.getElementById("qr-visual"),
  club: document.getElementById("qr-club"),
  code: document.getElementById("qr-code"),
  url: document.getElementById("qr-url"),
  download: document.getElementById("download"),
  print: document.getElementById("print"),
  copy: document.getElementById("copy"),
};

let state = { establishmentName: "", publicCode: "", scanUrl: "" };

function setBanner(message, tone = "info") {
  if (!message) {
    els.banner.hidden = true;
    return;
  }
  els.banner.textContent = message;
  els.banner.className = `qr-banner is-${tone}`;
  els.banner.hidden = false;
}

async function loadEstablishment() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase n'est pas configuré sur cette page.");
  }

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData?.session) throw new Error("Connecte-toi pour afficher le QR code de ton club.");

  const { data: owner, error: ownerError } = await supabase
    .from("establishment_owners")
    .select("establishment_id")
    .eq("id", sessionData.session.user.id)
    .maybeSingle();

  if (ownerError || !owner?.establishment_id) throw new Error("Aucun établissement lié à ce compte.");

  const { data: establishment, error } = await supabase
    .from("establishments")
    .select("name, public_code")
    .eq("id", owner.establishment_id)
    .single();

  if (error) throw new Error(`Chargement impossible : ${error.message}`);

  if (!establishment.public_code) {
    throw new Error("Ton établissement n'a pas encore de code public. Applique la migration de collecte.");
  }

  return establishment;
}

/** Ouvre une fenetre d'impression contenant une affiche prete a coller. */
async function printPoster() {
  const dataUrl = await renderQrPngDataUrl(state.scanUrl, { width: 1200 });
  const win = window.open("", "_blank", "width=820,height=1080");

  if (!win) {
    setBanner("L'impression a été bloquée par le navigateur. Autorise les fenêtres pop-up.", "error");
    return;
  }

  // Affiche volontairement en noir sur blanc : c'est ce qui s'imprime le mieux
  // et ce qui se lit le plus surement dans une salle sombre. Le corail reste
  // la seule touche de couleur (regle du design system) — un simple filet
  // autour du QR, pas un aplat qui mange l'encre a l'impression.
  win.document.write(`<!doctype html>
<html lang="fr"><head><meta charset="UTF-8"><title>QR Noctify — ${escapeHtml(state.establishmentName)}</title>
<style>
  @page { margin: 12mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 40px 32px; min-height: 100vh;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    font-family: 'Segoe UI', system-ui, sans-serif; color: #0a0a0a; text-align: center;
    border: 2px solid #0a0a0a;
  }
  .brand { display: flex; align-items: center; gap: 8px; margin-bottom: 28px; }
  .brand svg { width: 20px; height: 20px; }
  .brand span { font-size: 15px; font-weight: 700; letter-spacing: 0.02em; }
  .club { font-size: 15px; font-weight: 500; color: #55565a; margin: 0 0 4px; text-transform: uppercase; letter-spacing: 0.08em; }
  h1 { font-size: 40px; font-weight: 800; letter-spacing: -0.02em; margin: 0 0 10px; line-height: 1.05; }
  p.lead { font-size: 18px; color: #333; margin: 0 0 32px; }
  .qr-frame { padding: 18px; border: 3px solid #ff6363; border-radius: 12px; }
  .qr-frame img { display: block; width: 340px; max-width: 62vw; }
  .steps { display: flex; gap: 28px; margin-top: 34px; }
  .steps div { max-width: 140px; }
  .steps b { display: block; font-size: 22px; font-weight: 800; color: #ff6363; margin-bottom: 4px; }
  .steps span { font-size: 13px; color: #333; line-height: 1.35; }
  .code { margin-top: 30px; font-size: 12px; letter-spacing: 0.22em; color: #888; text-transform: uppercase; }
</style></head>
<body>
  <div class="brand">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.4c.5 3.8 1.4 6.4 2.9 7.9 1.5 1.5 4.1 2.4 7.9 2.9-3.8.5-6.4 1.4-7.9 2.9-1.5 1.5-2.4 4.1-2.9 7.9-.5-3.8-1.4-6.4-2.9-7.9-1.5-1.5-4.1-2.4-7.9-2.9 3.8-.5 6.4-1.4 7.9-2.9 1.5-1.5 2.4-4.1 2.9-7.9Z" fill="#ff6363"/></svg>
    <span>Noctify</span>
  </div>
  <p class="club">${escapeHtml(state.establishmentName)}</p>
  <h1>Gagne tes récompenses</h1>
  <p class="lead">Scanne, publie ta story, récupère tes points.</p>
  <div class="qr-frame"><img src="${dataUrl}" alt="QR code"></div>
  <div class="steps">
    <div><b>1</b><span>Scanne le code avec ton téléphone</span></div>
    <div><b>2</b><span>Publie une story ou un Reel avec le tag du club</span></div>
    <div><b>3</b><span>Récupère tes points dès validation</span></div>
  </div>
  <p class="code">${state.publicCode}</p>
</body></html>`);

  win.document.close();
  win.focus();
  win.print();
}

async function downloadPng() {
  const dataUrl = await renderQrPngDataUrl(state.scanUrl, { width: 1200 });
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = `viralnight-qr-${state.publicCode}.png`;
  link.click();
  setBanner("QR code téléchargé.", "success");
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(state.scanUrl);
    setBanner("Lien copié.", "success");
  } catch {
    setBanner("Copie impossible. Sélectionne le lien manuellement.", "error");
  }
}

async function init() {
  try {
    const establishment = await loadEstablishment();

    state = {
      establishmentName: establishment.name,
      publicCode: establishment.public_code,
      scanUrl: buildScanUrl(window.location.origin, establishment.public_code),
    };

    els.club.textContent = establishment.name;
    els.code.textContent = state.publicCode;
    els.url.textContent = state.scanUrl;
    // Le SVG vient de la librairie qrcode, pas d'une saisie : injection sure.
    els.visual.innerHTML = await renderQrSvg(state.scanUrl);
    els.card.hidden = false;

    els.download.addEventListener("click", downloadPng);
    els.print.addEventListener("click", printPoster);
    els.copy.addEventListener("click", copyLink);
  } catch (error) {
    setBanner(error.message, "error");
  }
}

init();
