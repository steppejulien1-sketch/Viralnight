import { isSupabaseConfigured, supabase } from "./supabaseClient.js";
import {
  DEFAULT_EVENT_NAME_TEMPLATE,
  WEEKDAY_DISPLAY_ORDER,
  defaultOpeningHours,
  listUpcomingNights,
  buildEventName,
  weekdayLabel,
} from "./lib/scheduling/nightDate.js";
import { escapeHtml } from "./lib/html/escape.js";

const els = {
  eventSelect: document.getElementById("event-select"),
  googleForm: document.getElementById("vi-google-form"),
  googleUrl: document.getElementById("google-url"),
  googleButton: document.getElementById("google-import-button"),
  googleStatus: document.getElementById("vi-google-status"),
  scheduleForm: document.getElementById("vi-schedule-form"),
  hoursGrid: document.getElementById("vi-hours-grid"),
  scheduleNameTemplate: document.getElementById("schedule-name-template"),
  scheduleDefaultDj: document.getElementById("schedule-default-dj"),
  scheduleAutoCreate: document.getElementById("schedule-auto-create"),
  scheduleStatus: document.getElementById("vi-schedule-status"),
  newEventForm: document.getElementById("vi-new-event-form"),
  newEventName: document.getElementById("new-event-name"),
  newEventDate: document.getElementById("new-event-date"),
  newEventDj: document.getElementById("new-event-dj"),
  newEventParticipants: document.getElementById("new-event-participants"),
  newEventError: document.getElementById("vi-new-event-error"),
  headline: document.getElementById("vi-headline"),
  summary: document.getElementById("vi-summary"),
  error: document.getElementById("vi-error"),
  loading: document.getElementById("vi-loading"),
  content: document.getElementById("vi-content"),
  scoreValue: document.getElementById("vi-score-value"),
  scoreRing: document.getElementById("vi-score-ring"),
  scoreBreakdown: document.getElementById("vi-score-breakdown"),
  comparison: document.getElementById("vi-comparison"),
  heatmap: document.getElementById("vi-heatmap"),
  timingHint: document.getElementById("vi-timing-hint"),
  djTableBody: document.querySelector("#vi-dj-table tbody"),
  rewards: document.getElementById("vi-rewards"),
  recommendations: document.getElementById("vi-recommendations"),
};

const BREAKDOWN_LABELS = {
  reach: "Reach",
  participation: "Participation",
  claimRate: "Taux de réclamation",
  contentDiversity: "Diversité de contenu",
  growth: "Croissance",
};

function showError(message) {
  els.error.textContent = message;
  els.error.hidden = false;
  els.content.hidden = true;
}

function formatHour(hour) {
  return hour === null || hour === undefined ? "--" : `${String(hour).padStart(2, "0")}h`;
}

function formatPercent(value) {
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

async function resolveEstablishmentId() {
  if (!isSupabaseConfigured) throw new Error("Supabase non configuré.");

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData?.session) throw new Error("Connexion requise pour accéder à Viral Intelligence.");

  // ⚠️ `maybeSingle` et pas `single` : avec `single`, PostgREST repond
  // 406 des qu'il y a zero ligne — ce qui est le cas NORMAL d'un compte
  // pas encore rattache a un club. La page restait alors bloquee sur
  // « Chargement… » indefiniment, la ou live.html et qr.html disent
  // simplement « Aucun etablissement lie a ce compte ».
  // Une absence attendue n'est pas une erreur de transport.
  const { data, error } = await supabase
    .from("establishment_owners")
    .select("establishment_id")
    .eq("id", sessionData.session.user.id)
    .maybeSingle();

  if (error || !data?.establishment_id) {
    throw new Error("Aucun établissement lié à ce compte.");
  }
  return data.establishment_id;
}

async function loadEvents(establishmentId) {
  const { data, error } = await supabase
    .from("events")
    .select("id, name, event_date")
    .eq("establishment_id", establishmentId)
    .order("event_date", { ascending: false })
    .limit(30);

  if (error) throw error;
  return data || [];
}

function populateEventSelect(events) {
  els.eventSelect.innerHTML = "";

  if (!events.length) {
    els.eventSelect.innerHTML = '<option value="">Aucune soirée enregistrée</option>';
    els.eventSelect.disabled = true;
    return;
  }

  for (const event of events) {
    const option = document.createElement("option");
    option.value = event.id;
    option.textContent = `${event.name} — ${event.event_date}`;
    els.eventSelect.append(option);
  }

  els.eventSelect.disabled = false;
}

/** Jeton de session courant, requis par les routes API qui utilisent le service_role. */
async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error("Session expirée, reconnectez-vous.");
  return token;
}

async function fetchAnalysis(eventId) {
  const params = new URLSearchParams({ eventId });
  const response = await fetch(`/api/viral-intelligence?${params.toString()}`, {
    headers: { Authorization: `Bearer ${await getAccessToken()}` },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Erreur inconnue.");
  return body;
}

function renderScore(data) {
  els.scoreValue.textContent = Math.round(data.viralScore);
  els.scoreRing.style.setProperty("--vi-score-percent", `${Math.round(data.viralScore)}`);

  els.scoreBreakdown.innerHTML = "";
  for (const [key, value] of Object.entries(data.scoreBreakdown)) {
    const li = document.createElement("li");
    li.innerHTML = `<span>${BREAKDOWN_LABELS[key] || key}</span><strong>${value}</strong>`;
    els.scoreBreakdown.append(li);
  }
}

function renderComparison(data) {
  els.comparison.innerHTML = "";
  const labels = {
    total_reach: "Reach",
    stories_count: "Stories",
    reels_count: "Reels",
    tiktoks_count: "TikTok",
    points_distributed: "Points distribués",
    rewards_claimed_count: "Récompenses réclamées",
    scans_count: "Scans QR",
  };

  for (const [key, label] of Object.entries(labels)) {
    const delta = data.comparison.vsAverage[key];
    const li = document.createElement("li");
    li.innerHTML = `<span>${label}</span><strong class="${delta >= 0 ? "is-up" : "is-down"}">${formatPercent(delta)}</strong>`;
    els.comparison.append(li);
  }
}

function renderHeatmap(data) {
  els.heatmap.innerHTML = "";
  const maxValue = Math.max(1, ...data.timing.heatmap.map((h) => h.publications));

  for (const bucket of data.timing.heatmap) {
    const row = document.createElement("div");
    row.className = "vi-heatmap-row";
    const barWidth = Math.round((bucket.publications / maxValue) * 100);
    row.innerHTML = `
      <span class="vi-heatmap-hour">${formatHour(bucket.hour)}</span>
      <div class="vi-heatmap-bar-track"><div class="vi-heatmap-bar" style="width:${barWidth}%"></div></div>
      <span class="vi-heatmap-count">${bucket.publications}</span>
    `;
    els.heatmap.append(row);
  }

  els.timingHint.textContent = `Pic de publications ${formatHour(data.timing.publicationPeakHour)} · Pic de scans ${formatHour(data.timing.scanPeakHour)} · Bonus recommandé ${formatHour(data.timing.recommendedBonusHour)}`;
}

function renderDjs(data) {
  els.djTableBody.innerHTML = "";
  for (const dj of data.djAnalytics.perDj) {
    const row = document.createElement("tr");
    row.innerHTML = `<td>${escapeHtml(dj.djName)}</td><td>${Math.round(dj.avgReach)}</td><td>${dj.eventsCount}</td>`;
    els.djTableBody.append(row);
  }
}

function renderRewards(data) {
  els.rewards.innerHTML = "";
  for (const reward of data.rewardAnalytics.perReward) {
    const card = document.createElement("div");
    card.className = "vi-reward-card";
    card.innerHTML = `
      <h3>${escapeHtml(reward.title)}</h3>
      <p>Reach moyen : <strong>${Math.round(reward.avgReach)}</strong></p>
      <p>Reclamations : <strong>${reward.claimsCount}</strong></p>
      <p>Publications liees : <strong>${reward.publicationsCount}</strong></p>
    `;
    els.rewards.append(card);
  }
}

function renderRecommendations(data) {
  els.recommendations.innerHTML = "";
  const items = data.narrative.recommendations || [];

  if (!items.length) {
    els.recommendations.innerHTML = "<li>Aucune recommandation déclenchée pour cette soirée.</li>";
    return;
  }

  for (const rec of items) {
    const li = document.createElement("li");
    // La priorite pilote une classe CSS : on la restreint aux valeurs connues.
    const priority = ["high", "medium", "low"].includes(rec.priority) ? rec.priority : "low";
    const gain = Number(rec.estimatedGain);

    li.className = `vi-recommendation is-${priority}`;
    li.innerHTML = `
      <span class="vi-recommendation-check">✔</span>
      <span class="vi-recommendation-text">${escapeHtml(rec.message)}</span>
      ${Number.isFinite(gain) && gain > 0 ? `<span class="vi-recommendation-gain">+${Math.round(gain)}%</span>` : ""}
    `;
    els.recommendations.append(li);
  }
}

function render(data) {
  els.headline.textContent = data.narrative.headline;
  els.summary.textContent = data.narrative.summary;

  renderScore(data);
  renderComparison(data);
  renderHeatmap(data);
  renderDjs(data);
  renderRewards(data);
  renderRecommendations(data);

  els.content.hidden = false;
}

async function runAnalysisFor(eventId) {
  els.loading.hidden = false;
  els.error.hidden = true;
  els.content.hidden = true;

  try {
    const data = await fetchAnalysis(eventId);
    render(data);
  } catch (error) {
    showError(error.message || "Impossible de charger l'analyse.");
  } finally {
    els.loading.hidden = true;
  }
}

/**
 * Construit la grille d'horaires : une ligne par jour, avec ouverture/fermeture propres.
 * Les champs horaires sont desactives quand le jour est ferme, pour que l'etat visuel
 * corresponde toujours a ce qui sera enregistre.
 */
function renderHoursGrid(openingHours) {
  els.hoursGrid.innerHTML = "";
  const byWeekday = new Map(openingHours.map((h) => [Number(h.weekday), h]));

  for (const weekday of WEEKDAY_DISPLAY_ORDER) {
    const hours = byWeekday.get(weekday) || { weekday, isOpen: false, opensAt: "22:00", closesAt: "06:00" };

    const row = document.createElement("div");
    row.className = "vi-hours-row";
    row.dataset.weekday = String(weekday);
    row.innerHTML = `
      <label class="vi-hours-day">
        <input type="checkbox" class="vi-hours-open" ${hours.isOpen ? "checked" : ""} />
        <span>${weekdayLabel(weekday).slice(0, 3)}</span>
      </label>
      <input type="time" class="vi-hours-opens" value="${(hours.opensAt || "22:00").slice(0, 5)}" ${hours.isOpen ? "" : "disabled"} />
      <span class="vi-hours-arrow">→</span>
      <input type="time" class="vi-hours-closes" value="${(hours.closesAt || "06:00").slice(0, 5)}" ${hours.isOpen ? "" : "disabled"} />
    `;

    const toggle = row.querySelector(".vi-hours-open");
    toggle.addEventListener("change", () => {
      row.querySelectorAll("input[type=time]").forEach((input) => {
        input.disabled = !toggle.checked;
      });
      row.classList.toggle("is-closed", !toggle.checked);
    });

    row.classList.toggle("is-closed", !hours.isOpen);
    els.hoursGrid.append(row);
  }
}

function readOpeningHoursFromForm() {
  return [...els.hoursGrid.querySelectorAll(".vi-hours-row")].map((row) => {
    const isOpen = row.querySelector(".vi-hours-open").checked;
    return {
      weekday: Number(row.dataset.weekday),
      isOpen,
      opensAt: isOpen ? row.querySelector(".vi-hours-opens").value : null,
      closesAt: isOpen ? row.querySelector(".vi-hours-closes").value : null,
    };
  });
}

function readScheduleFromForm() {
  return {
    openingHours: readOpeningHoursFromForm(),
    eventNameTemplate: els.scheduleNameTemplate.value.trim() || DEFAULT_EVENT_NAME_TEMPLATE,
    defaultDjName: els.scheduleDefaultDj.value.trim() || null,
    autoCreateEvents: els.scheduleAutoCreate.checked,
  };
}

function applyScheduleToForm(schedule) {
  renderHoursGrid(schedule.openingHours);
  els.scheduleNameTemplate.value = schedule.eventNameTemplate;
  els.scheduleDefaultDj.value = schedule.defaultDjName || "";
  els.scheduleAutoCreate.checked = schedule.autoCreateEvents;
}

async function loadSchedule(establishmentId) {
  const [scheduleResult, hoursResult] = await Promise.all([
    supabase.from("establishment_schedule").select("*").eq("establishment_id", establishmentId).maybeSingle(),
    supabase.from("establishment_opening_hours").select("*").eq("establishment_id", establishmentId),
  ]);

  const scheduleRow = scheduleResult.data;
  const hourRows = hoursResult.data || [];

  return {
    // Aucun horaire enregistre : on propose les valeurs par defaut plutot qu'une grille vide.
    openingHours: hourRows.length
      ? hourRows.map((row) => ({
          weekday: row.weekday,
          isOpen: row.is_open,
          opensAt: row.opens_at,
          closesAt: row.closes_at,
        }))
      : defaultOpeningHours(),
    eventNameTemplate: scheduleRow?.event_name_template || DEFAULT_EVENT_NAME_TEMPLATE,
    defaultDjName: scheduleRow?.default_dj_name || null,
    autoCreateEvents: scheduleRow?.auto_create_events ?? true,
    googlePlaceName: scheduleRow?.google_place_name || null,
  };
}

function setStatus(element, message, isError = false) {
  element.textContent = message;
  element.hidden = false;
  element.classList.toggle("is-error", isError);
}

async function saveSchedule(establishmentId) {
  const schedule = readScheduleFromForm();
  const openDays = schedule.openingHours.filter((h) => h.isOpen);

  if (!openDays.length) {
    setStatus(els.scheduleStatus, "Ouvrez au moins un jour.", true);
    return null;
  }

  const incomplete = openDays.find((h) => !h.opensAt || !h.closesAt);
  if (incomplete) {
    setStatus(els.scheduleStatus, `Horaires incomplets pour ${weekdayLabel(incomplete.weekday)}.`, true);
    return null;
  }

  const [hoursResult, scheduleResult] = await Promise.all([
    supabase.from("establishment_opening_hours").upsert(
      schedule.openingHours.map((h) => ({
        establishment_id: establishmentId,
        weekday: h.weekday,
        is_open: h.isOpen,
        opens_at: h.opensAt,
        closes_at: h.closesAt,
      })),
      { onConflict: "establishment_id,weekday" },
    ),
    supabase.from("establishment_schedule").upsert(
      {
        establishment_id: establishmentId,
        auto_create_events: schedule.autoCreateEvents,
        event_name_template: schedule.eventNameTemplate,
        default_dj_name: schedule.defaultDjName,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "establishment_id" },
    ),
  ]);

  const error = hoursResult.error || scheduleResult.error;
  if (error) {
    setStatus(els.scheduleStatus, `Erreur de sauvegarde : ${error.message}`, true);
    return null;
  }

  setStatus(els.scheduleStatus, "Horaires enregistrés.");
  return schedule;
}

/**
 * Importe les horaires depuis une fiche Google. L'API resout l'etablissement a partir
 * de la session : aucun identifiant d'etablissement ne transite depuis le client.
 */
async function importFromGoogle() {
  const googleUrl = els.googleUrl.value.trim();
  if (!googleUrl) {
    setStatus(els.googleStatus, "Collez d'abord le lien de votre fiche Google.", true);
    return null;
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) {
    setStatus(els.googleStatus, "Session expirée, reconnectez-vous.", true);
    return null;
  }

  els.googleButton.disabled = true;
  setStatus(els.googleStatus, "Import en cours...");

  try {
    const response = await fetch("/api/import-opening-hours", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ googleUrl }),
    });

    const body = await response.json();

    if (!response.ok) {
      setStatus(els.googleStatus, body.error || "Import impossible.", true);
      return null;
    }

    const place = body.placeName ? ` (${body.placeName})` : "";
    // La lecture de secours est moins fiable que l'API officielle : on le dit clairement.
    const warning = body.source === "maps-scrape" ? " Verifiez les horaires importes." : "";
    setStatus(els.googleStatus, `Horaires importes${place}.${warning}`);

    return body.openingHours;
  } catch (error) {
    setStatus(els.googleStatus, `Import impossible : ${error.message}`, true);
    return null;
  } finally {
    els.googleButton.disabled = false;
  }
}

/**
 * Cree cote client les soirees des prochaines nuits d'ouverture, pour que le gerant
 * les voie immediatement sans attendre le cron serveur ni le premier scan de la soiree.
 * Les doublons sont ignores : une soiree deja creee garde son DJ et ses reglages.
 */
async function ensureUpcomingEvents(establishmentId, schedule) {
  if (!schedule.autoCreateEvents) return;

  const nights = listUpcomingNights(schedule.openingHours, 14);
  if (!nights.length) return;

  const rows = nights.map((eventDate) => ({
    establishment_id: establishmentId,
    name: buildEventName(schedule.eventNameTemplate, eventDate),
    event_date: eventDate,
    dj_name: schedule.defaultDjName,
  }));

  const { error } = await supabase
    .from("events")
    .upsert(rows, { onConflict: "establishment_id,event_date", ignoreDuplicates: true });

  // Echec non bloquant : le trigger SQL creera de toute facon la soiree au premier scan.
  if (error) console.warn("[schedule] pre-creation des soirées impossible", error.message);
}

async function createEvent(establishmentId) {
  els.newEventError.hidden = true;

  const name = els.newEventName.value.trim();
  const eventDate = els.newEventDate.value;
  if (!name || !eventDate) {
    els.newEventError.textContent = "Nom et date sont requis.";
    els.newEventError.hidden = false;
    return null;
  }

  const { data, error } = await supabase
    .from("events")
    .insert({
      establishment_id: establishmentId,
      name,
      event_date: eventDate,
      dj_name: els.newEventDj.value.trim() || null,
      participants_count: Number(els.newEventParticipants.value) || 0,
    })
    .select("id, name, event_date")
    .single();

  if (error) {
    els.newEventError.textContent = "Erreur lors de la création de la soirée.";
    els.newEventError.hidden = false;
    return null;
  }

  els.newEventForm.reset();
  return data;
}

async function init() {
  // Le panneau de reglages est rendu avec ses valeurs par defaut avant toute requete :
  // il reste lisible meme si la session est absente ou si Supabase est injoignable.
  applyScheduleToForm({
    openingHours: defaultOpeningHours(),
    eventNameTemplate: DEFAULT_EVENT_NAME_TEMPLATE,
    defaultDjName: null,
    autoCreateEvents: true,
  });

  try {
    const establishmentId = await resolveEstablishmentId();

    // Les soirees a venir sont materialisees avant le premier chargement de la liste,
    // pour que le gerant n'ait jamais a creer une soiree a la main.
    const schedule = await loadSchedule(establishmentId);
    applyScheduleToForm(schedule);
    await ensureUpcomingEvents(establishmentId, schedule);

    let events = await loadEvents(establishmentId);
    populateEventSelect(events);

    if (events[0]) {
      els.eventSelect.value = events[0].id;
      await runAnalysisFor(events[0].id);
    }

    els.eventSelect.addEventListener("change", () => {
      if (els.eventSelect.value) runAnalysisFor(els.eventSelect.value);
    });

    els.googleForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const importedHours = await importFromGoogle();
      if (!importedHours) return;

      // L'API a deja enregistre les horaires : on recharge pour afficher ce qui est
      // reellement en base, plutot que de faire confiance a la reponse.
      const refreshed = await loadSchedule(establishmentId);
      applyScheduleToForm(refreshed);
      await ensureUpcomingEvents(establishmentId, refreshed);

      events = await loadEvents(establishmentId);
      populateEventSelect(events);
      if (events[0]) {
        els.eventSelect.value = events[0].id;
        await runAnalysisFor(events[0].id);
      }
    });

    els.scheduleForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const savedSchedule = await saveSchedule(establishmentId);
      if (!savedSchedule) return;

      await ensureUpcomingEvents(establishmentId, savedSchedule);
      events = await loadEvents(establishmentId);
      const previousSelection = els.eventSelect.value;
      populateEventSelect(events);
      if (events.some((e) => e.id === previousSelection)) els.eventSelect.value = previousSelection;
    });

    els.newEventForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const created = await createEvent(establishmentId);
      if (!created) return;

      events = await loadEvents(establishmentId);
      populateEventSelect(events);
      els.eventSelect.value = created.id;
      await runAnalysisFor(created.id);
    });
  } catch (error) {
    showError(error.message || "Impossible d'initialiser Viral Intelligence.");
  }
}

init();
