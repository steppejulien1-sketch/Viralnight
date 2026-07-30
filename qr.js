// Page gerant : affiche le QR code a imprimer et afficher dans le club.

import { isSupabaseConfigured, supabase } from "./supabaseClient.js";
import { buildScanUrl, renderQrSvg, renderQrPngDataUrl } from "./lib/tracking/qrCode.js";

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
  // et ce qui se lit le plus surement dans une salle sombre.
  win.document.write(`<!doctype html>
<html lang="fr"><head><meta charset="UTF-8"><title>QR ViralNight</title>
<style>
  @page { margin: 14mm; }
  body { margin:0; font-family: system-ui, sans-serif; color:#000; text-align:center;
         display:flex; flex-direction:column; justify-content:center; min-height:100vh; }
  h1 { font-size:34px; margin:0 0 6px; letter-spacing:-0.02em; }
  p  { font-size:19px; margin:0 0 26px; color:#333; }
  img { width:78%; max-width:460px; margin:0 auto; }
  .code { margin-top:22px; font-size:15px; letter-spacing:0.22em; color:#555; }
</style></head>
<body>
  <h1>Gagne tes récompenses</h1>
  <p>Scanne, publie ta story, récupère tes points.</p>
  <img src="${dataUrl}" alt="QR code">
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
