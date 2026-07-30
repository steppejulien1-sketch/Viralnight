// Page vue par le client apres avoir scanne le QR code a l'entree du club.
//
// Elle enregistre son passage, puis lui permet d'envoyer le lien de sa publication.
// Aucune connexion n'est demandee : un identifiant anonyme est genere et conserve
// dans le navigateur, ce qui permet de reconnaitre un habitue sans jamais collecter
// son nom, son email ou son telephone.

const CUSTOMER_KEY = "viralnight.customerId";

const els = {
  clubName: document.getElementById("club-name"),
  stepCheckin: document.getElementById("step-checkin"),
  checkinStatus: document.getElementById("checkin-status"),
  stepPost: document.getElementById("step-post"),
  stepError: document.getElementById("step-error"),
  errorTitle: document.getElementById("error-title"),
  errorMessage: document.getElementById("error-message"),
  retry: document.getElementById("retry"),
  form: document.getElementById("post-form"),
  url: document.getElementById("post-url"),
  views: document.getElementById("post-views"),
  send: document.getElementById("post-send"),
  status: document.getElementById("post-status"),
  list: document.getElementById("post-list"),
};

/**
 * Identifiant anonyme stable, conserve dans le navigateur.
 * Il permet de compter les visiteurs uniques et de reconnaitre les habitues,
 * sans aucune donnee personnelle.
 */
function getCustomerId() {
  let id = null;
  try {
    id = localStorage.getItem(CUSTOMER_KEY);
  } catch {
    // Navigation privee ou stockage refuse : on repart d'un identifiant ephemere.
  }

  if (!id) {
    id = crypto.randomUUID();
    try {
      localStorage.setItem(CUSTOMER_KEY, id);
    } catch {
      // Sans persistance, le client comptera comme nouveau a chaque visite.
    }
  }

  return id;
}

/** Le code du club vient du QR : /scan.html?c=ABCD2345 */
function getPublicCode() {
  const fromQuery = new URLSearchParams(window.location.search).get("c");
  return String(fromQuery || "").trim().toUpperCase();
}

const customerId = getCustomerId();
const code = getPublicCode();

function showError(title, message) {
  els.errorTitle.textContent = title;
  els.errorMessage.textContent = message;
  els.stepCheckin.hidden = true;
  els.stepPost.hidden = true;
  els.stepError.hidden = false;
}

function setStatus(message, tone = "info") {
  els.status.textContent = message;
  els.status.className = `sc-note is-${tone}`;
  els.status.hidden = false;
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, body };
}

async function checkIn() {
  els.stepError.hidden = true;
  els.stepCheckin.hidden = false;

  const { ok, body } = await postJson("/api/track-scan", { code, customerId });

  if (!ok) {
    // Hors horaires : le club est ferme, ce n'est pas une panne.
    if (body.outsideOpeningHours) {
      showError(
        "Aucune soirée en cours",
        `${body.establishment || "Ce club"} n'est pas ouvert actuellement. Reviens pendant la soirée pour enregistrer ton passage.`,
      );
      return;
    }

    showError("Enregistrement impossible", body.error || "Réessaie dans un instant.");
    return;
  }

  els.clubName.textContent = body.establishment || "";
  els.stepCheckin.hidden = true;
  els.stepPost.hidden = false;

  if (body.alreadyScanned) {
    setStatus("Ton passage était déjà enregistré ce soir. Tu peux envoyer tes publications.", "info");
  }
}

function addSentPost(url, platform) {
  const item = document.createElement("li");
  item.className = "sc-sent-item";

  const label = document.createElement("span");
  label.className = "sc-sent-platform";
  label.textContent = platform;

  const link = document.createElement("span");
  link.className = "sc-sent-url";
  // textContent, jamais innerHTML : l'URL vient de la saisie du client.
  link.textContent = url;

  item.append(label, link);
  els.list.append(item);
}

async function submitPost(event) {
  event.preventDefault();

  const url = els.url.value.trim();
  if (!url) return;

  els.send.disabled = true;
  setStatus("Envoi en cours…", "info");

  const contentType = els.form.querySelector('input[name="contentType"]:checked')?.value || "post";
  const declaredViews = els.views.value ? Number(els.views.value) : null;

  try {
    const { ok, body } = await postJson("/api/track-post", {
      code,
      customerId,
      url,
      contentType,
      declaredViews,
    });

    if (!ok) {
      setStatus(body.error || "Envoi impossible. Vérifie ton lien.", "error");
      return;
    }

    if (body.alreadySubmitted) {
      setStatus("Ce lien a déjà été envoyé pour cette soirée.", "info");
    } else {
      setStatus(body.message || "Publication enregistrée.", "success");
      addSentPost(url, body.platform || "");
    }

    els.form.reset();
  } catch (error) {
    setStatus(`Envoi impossible : ${error.message}`, "error");
  } finally {
    els.send.disabled = false;
  }
}

function init() {
  if (!code) {
    showError(
      "QR code incomplet",
      "Ce lien ne contient pas de code établissement. Scanne à nouveau le QR code affiché à l'entrée.",
    );
    return;
  }

  els.form.addEventListener("submit", submitPost);
  els.retry.addEventListener("click", checkIn);

  checkIn().catch((error) => showError("Connexion impossible", error.message));
}

init();
