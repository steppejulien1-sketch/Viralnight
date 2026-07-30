// Assistant conversationnel.
//
// Le navigateur ne parle jamais a OpenAI directement : il appelle /api/chat, qui verifie
// la session, charge l'analyse de la soiree et relaie la reponse du modele en streaming.
// La cle API reste donc cote serveur.

import { isSupabaseConfigured, supabase } from "./supabaseClient.js";
import { escapeHtml } from "./lib/html/escape.js";

const SUGGESTIONS = [
  "Résume-moi cette soirée",
  "Quel DJ marche le mieux et pourquoi ?",
  "Quelle récompense je devrais remplacer ?",
  "À quelle heure lancer le bonus ?",
  "Qu'est-ce qui explique la note ?",
];

const els = {
  eventSelect: document.getElementById("event-select"),
  reset: document.getElementById("reset"),
  banner: document.getElementById("banner"),
  thread: document.getElementById("thread"),
  chips: document.getElementById("chips"),
  form: document.getElementById("form"),
  input: document.getElementById("input"),
  send: document.getElementById("send"),
};

/** Historique de la conversation, envoye a chaque tour pour donner du contexte au modele. */
let history = [];
let establishmentId = null;
let streaming = false;

function setBanner(message, tone = "info") {
  if (!message) {
    els.banner.hidden = true;
    return;
  }
  els.banner.textContent = message;
  els.banner.className = `ch-banner is-${tone}`;
  els.banner.hidden = false;
}

function setBusy(isBusy) {
  streaming = isBusy;
  els.send.disabled = isBusy;
  els.input.disabled = isBusy;
  els.eventSelect.disabled = isBusy;
}

function scrollToEnd() {
  els.thread.scrollTop = els.thread.scrollHeight;
}

function addMessage(role, text = "") {
  const node = document.createElement("div");
  node.className = `ch-msg is-${role}`;

  const bubble = document.createElement("div");
  bubble.className = "ch-bubble";
  bubble.textContent = text;

  node.append(bubble);
  els.thread.append(node);
  scrollToEnd();

  return bubble;
}

function addTyping() {
  const node = document.createElement("div");
  node.className = "ch-msg is-assistant";
  node.innerHTML = '<div class="ch-bubble ch-typing"><span></span><span></span><span></span></div>';
  els.thread.append(node);
  scrollToEnd();
  return node;
}

function renderSuggestions() {
  els.chips.innerHTML = SUGGESTIONS.map(
    (question) => `<button type="button" class="ch-chip">${escapeHtml(question)}</button>`,
  ).join("");

  for (const chip of els.chips.querySelectorAll(".ch-chip")) {
    chip.addEventListener("click", () => {
      if (streaming) return;
      send(chip.textContent);
    });
  }
}

/** Les suggestions n'ont de sens qu'au demarrage : une fois lance, elles encombrent. */
function hideSuggestions() {
  els.chips.hidden = true;
}

async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error("Session expirée, reconnectez-vous.");
  return token;
}

/**
 * Lit le flux SSE renvoye par /api/chat et remplit la bulle au fur et a mesure.
 * @returns {Promise<string>} la reponse complete
 */
async function streamAnswer(response, bubble) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  let failure = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Les evenements SSE sont separes par une ligne vide ; le dernier morceau peut
    // etre incomplet, on le conserve pour le tour suivant.
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const raw of events) {
      const nameLine = raw.split("\n").find((line) => line.startsWith("event:"));
      const dataLine = raw.split("\n").find((line) => line.startsWith("data:"));
      if (!dataLine) continue;

      let payload;
      try {
        payload = JSON.parse(dataLine.slice(5).trim());
      } catch {
        continue;
      }

      const name = nameLine ? nameLine.slice(6).trim() : "delta";

      if (name === "delta" && payload.text) {
        full += payload.text;
        bubble.textContent = full;
        scrollToEnd();
      } else if (name === "error") {
        failure = payload.error;
      }
    }
  }

  if (failure && !full) throw new Error(failure);
  if (failure) setBanner(failure, "error");

  return full;
}

async function send(rawMessage) {
  const message = rawMessage.trim();
  if (!message || streaming) return;

  hideSuggestions();
  setBanner(null);
  addMessage("user", message);
  els.input.value = "";
  els.input.style.height = "auto";

  history.push({ role: "user", content: message });
  setBusy(true);

  const typing = addTyping();

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${await getAccessToken()}`,
      },
      body: JSON.stringify({ eventId: els.eventSelect.value, messages: history }),
    });

    // Une erreur avant le flux revient en JSON classique.
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `Erreur ${response.status}.`);
    }

    typing.remove();
    const bubble = addMessage("assistant");
    const answer = await streamAnswer(response, bubble);

    if (answer) {
      history.push({ role: "assistant", content: answer });
    } else {
      bubble.textContent = "Aucune réponse reçue. Réessayez.";
    }
  } catch (error) {
    typing.remove();
    setBanner(error.message, "error");
    // Le tour a echoue : on retire la question de l'historique pour ne pas
    // renvoyer un contexte incoherent au prochain essai.
    history.pop();
  } finally {
    setBusy(false);
    els.input.focus();
  }
}

async function loadEvents() {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData?.session) throw new Error("Connectez-vous pour discuter de vos soirées.");

  const { data: owner, error: ownerError } = await supabase
    .from("establishment_owners")
    .select("establishment_id")
    .eq("id", sessionData.session.user.id)
    .maybeSingle();

  if (ownerError || !owner?.establishment_id) throw new Error("Aucun établissement lié à ce compte.");
  establishmentId = owner.establishment_id;

  const { data: events, error } = await supabase
    .from("events")
    .select("id, name, event_date, dj_name")
    .eq("establishment_id", establishmentId)
    .order("event_date", { ascending: false })
    .limit(30);

  if (error) throw new Error(`Chargement des soirées impossible : ${error.message}`);
  return events || [];
}

function resetConversation() {
  history = [];
  els.thread.innerHTML = "";
  els.chips.hidden = false;
  setBanner(null);

  const label = els.eventSelect.selectedOptions[0]?.textContent || "cette soirée";
  addMessage(
    "assistant",
    `Bonjour. Je peux analyser ${label} : les DJs, les récompenses, les heures de publication, ce qu'il faut améliorer. Que voulez-vous savoir ?`,
  );
}

async function init() {
  renderSuggestions();

  if (!isSupabaseConfigured) {
    setBanner("Supabase n'est pas configuré : l'assistant ne peut pas charger vos soirées.", "error");
    return;
  }

  try {
    const events = await loadEvents();

    if (!events.length) {
      setBanner("Aucune soirée enregistrée : créez-en une depuis Viral Intelligence.", "info");
      return;
    }

    els.eventSelect.innerHTML = events
      .map(
        (event) =>
          `<option value="${escapeHtml(event.id)}">${escapeHtml(event.name)}${
            event.dj_name ? ` — ${escapeHtml(event.dj_name)}` : ""
          }</option>`,
      )
      .join("");
    els.eventSelect.disabled = false;

    resetConversation();
  } catch (error) {
    setBanner(error.message, "error");
  }
}

els.form.addEventListener("submit", (event) => {
  event.preventDefault();
  send(els.input.value);
});

// Entree envoie, Maj+Entree passe a la ligne : la convention attendue dans un chat.
els.input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    send(els.input.value);
  }
});

// Le champ grandit avec le texte, jusqu'a une limite.
els.input.addEventListener("input", () => {
  els.input.style.height = "auto";
  els.input.style.height = `${Math.min(els.input.scrollHeight, 160)}px`;
});

// Changer de soiree change le sujet : on repart d'une conversation vierge pour que
// le modele ne commente pas les chiffres d'une autre soiree.
els.eventSelect.addEventListener("change", resetConversation);
els.reset.addEventListener("click", resetConversation);

init();
