// Outil d'analyse de soiree — version autonome, sans Supabase ni OpenAI.
//
// La page importe le vrai moteur (lib/analytics + lib/rules) et l'execute sur des donnees
// de demonstration. Ce qui est affiche est donc le comportement reel du moteur.
//
// Volontairement centre sur quatre questions concretes :
//   1. Qu'est-ce qu'il faut ameliorer ?
//   2. Qu'est-ce qui a bien marche ?
//   3. Quel DJ fait venir du monde ?
//   4. Quelles recompenses les gens preferent, et quand postent-ils ?

import { resolveSource, loadEvents, loadAnalysis } from "./analysis-source.js";
import { escapeHtml } from "./lib/html/escape.js";

const els = {
  main: document.querySelector(".an-main"),
  banner: document.getElementById("banner"),
  eventSelect: document.getElementById("event-select"),
  heroDate: document.getElementById("hero-date"),
  heroTitle: document.getElementById("hero-title"),
  verdict: document.getElementById("verdict"),
  heroStats: document.getElementById("hero-stats"),
  trend: document.getElementById("trend"),
  timingInsight: document.getElementById("timing-insight"),
  actions: document.getElementById("actions"),
  wins: document.getElementById("wins"),
  djs: document.getElementById("djs"),
  rewards: document.getElementById("rewards"),
  timing: document.getElementById("timing"),
  timingSub: document.getElementById("timing-sub"),
};

let source = null;
let events = [];

function formatNumber(value) {
  return new Intl.NumberFormat("fr-FR").format(Math.round(value));
}

function formatHour(hour) {
  return hour === null || hour === undefined ? "--" : `${String(hour).padStart(2, "0")}h`;
}

function formatDate(isoDate) {
  const [year, month, day] = isoDate.split("-");
  return new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function renderVerdict(analysis, actions) {
  const score = Math.round(analysis.viralScore);
  const delta = Math.round(analysis.comparison.vsAverage.total_reach);
  const best = actions[0];

  let opening;
  if (score >= 80) opening = "Très bonne soirée";
  else if (score >= 55) opening = "Soirée correcte";
  else opening = "Soirée en dessous de vos habitudes";

  const trend =
    delta >= 10
      ? `, en hausse de ${delta}% sur vos dernières soirées`
      : delta <= -10
        ? `, en baisse de ${Math.abs(delta)}% sur vos dernières soirées`
        : ", dans la moyenne de vos dernières soirées";

  // Le message est repris tel quel : le mettre en minuscule casserait les noms propres
  // ("DJ Martin" devenait "dJ Martin").
  const lever = best
    ? ` Levier le plus rentable : ${best.message}`
    : " Aucun point d'amélioration majeur détecté.";

  els.verdict.textContent = `${opening}${trend}.${lever}`;
}

/**
 * Courbe des vues generees soiree apres soiree.
 * On construit le SVG a la main plutot que d'ajouter une librairie de graphiques :
 * une seule serie, pas de dependance, et le rendu suit les tokens du theme.
 */
function renderTrend(currentEventId) {
  const points = events.map((event) => ({
    eventId: event.id,
    date: event.eventDate,
    reach: event.reach,
  }));

  if (points.length < 2) {
    els.trend.innerHTML =
      '<p class="an-empty">Au moins deux soirées analysées sont nécessaires pour afficher une tendance.</p>';
    return;
  }

  const width = 100;
  const height = 34;
  const maxReach = Math.max(...points.map((p) => p.reach), 1);

  const coords = points.map((point, index) => ({
    ...point,
    x: points.length > 1 ? (index / (points.length - 1)) * width : width / 2,
    // L'axe SVG part du haut : on inverse, en gardant une marge basse pour les points.
    y: height - (point.reach / maxReach) * (height - 4) - 2,
  }));

  const line = coords.map((c) => `${c.x.toFixed(2)},${c.y.toFixed(2)}`).join(" ");
  const area = `0,${height} ${line} ${width},${height}`;

  els.trend.innerHTML = `
    <svg class="an-trend-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="an-trend-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--coral)" stop-opacity="0.28" />
          <stop offset="100%" stop-color="var(--coral)" stop-opacity="0" />
        </linearGradient>
      </defs>
      <polygon points="${area}" fill="url(#an-trend-fill)" />
      <polyline points="${line}" fill="none" stroke="var(--coral)" stroke-width="0.6"
        vector-effect="non-scaling-stroke" stroke-linejoin="round" />
    </svg>
    <div class="an-trend-points">
      ${coords
        .map(
          (c) => `
        <button type="button" class="an-trend-point ${c.eventId === currentEventId ? "is-active" : ""}"
          style="left:${c.x}%; bottom:${((height - c.y) / height) * 100}%"
          data-event-id="${escapeHtml(c.eventId)}"
          title="${escapeHtml(formatDate(c.date))} — ${formatNumber(c.reach)} vues"></button>`,
        )
        .join("")}
    </div>
    <div class="an-trend-axis">
      ${coords
        .map((c) => {
          const [, month, day] = c.date.split("-");
          return `<span style="left:${c.x}%">${day}/${month}</span>`;
        })
        .join("")}
    </div>
  `;

  for (const button of els.trend.querySelectorAll(".an-trend-point")) {
    button.addEventListener("click", () => {
      els.eventSelect.value = button.dataset.eventId;
      render(button.dataset.eventId);
    });
  }
}

function renderHero(analysis) {
  const score = Math.round(analysis.viralScore);
  const reachDelta = Math.round(analysis.comparison.vsAverage.total_reach);

  els.heroDate.textContent = formatDate(analysis.event.event_date);
  els.heroTitle.textContent = analysis.event.name;

  const stats = [
    { label: "Note de la soirée", value: `${score}/100`, tone: score >= 70 ? "good" : score >= 45 ? "warn" : "bad" },
    { label: "Vues générées", value: formatNumber(analysis.metrics.total_reach) },
    {
      label: "vs soirées précédentes",
      value: `${reachDelta > 0 ? "+" : ""}${reachDelta}%`,
      tone: reachDelta >= 0 ? "good" : "bad",
    },
    { label: "Publications", value: formatNumber(analysis.metrics.stories_count + analysis.metrics.reels_count + analysis.metrics.tiktoks_count) },
    { label: "Scans QR", value: formatNumber(analysis.metrics.scans_count) },
  ];

  els.heroStats.innerHTML = stats
    .map(
      (stat) => `
      <div class="an-stat">
        <span class="an-stat-value ${stat.tone ? `is-${stat.tone}` : ""}">${escapeHtml(stat.value)}</span>
        <span class="an-stat-label">${escapeHtml(stat.label)}</span>
      </div>`,
    )
    .join("");
}

/**
 * Separe les recommandations en "a ameliorer" et "a reproduire".
 * Un gain estime > 0 signale une action a mener ; un gain nul est un constat positif
 * ou informatif, qui a sa place dans les reussites.
 */
function splitRecommendations(recommendations) {
  // Le bloc annonce "les points les plus rentables" : on trie donc par gain estime,
  // et non par priorite interne, pour que la liste tienne sa promesse.
  const actions = recommendations
    .filter((r) => r.estimatedGain > 0)
    .sort((a, b) => b.estimatedGain - a.estimatedGain)
    .slice(0, 5);

  const wins = recommendations.filter((r) => r.estimatedGain === 0).slice(0, 4);
  return { actions, wins };
}

function renderActions(actions) {
  if (!actions.length) {
    els.actions.innerHTML = '<li class="an-empty">Rien de préoccupant sur cette soirée.</li>';
    return;
  }

  els.actions.innerHTML = actions
    .map(
      (rec) => `
      <li class="an-action is-${rec.priority}">
        <span class="an-action-text">${escapeHtml(rec.message)}</span>
        <span class="an-action-gain">+${Math.round(rec.estimatedGain)}%<em>gain estimé</em></span>
      </li>`,
    )
    .join("");
}

function renderWins(wins) {
  if (!wins.length) {
    els.wins.innerHTML = '<li class="an-empty">Pas de point fort marquant cette fois.</li>';
    return;
  }

  els.wins.innerHTML = wins
    .map((rec) => `<li class="an-win">${escapeHtml(rec.message)}</li>`)
    .join("");
}

/** Barres comparatives simples : libelle, barre proportionnelle, valeur. */
function renderBars(container, items, { emptyLabel }) {
  if (!items.length) {
    container.innerHTML = `<p class="an-empty">${escapeHtml(emptyLabel)}</p>`;
    return;
  }

  const max = Math.max(...items.map((item) => item.value), 1);

  container.innerHTML = items
    .map(
      (item, index) => `
      <div class="an-bar ${index === 0 ? "is-top" : ""}">
        <span class="an-bar-label">${escapeHtml(item.label)}</span>
        <div class="an-bar-track">
          <div class="an-bar-fill" style="width:${Math.round((item.value / max) * 100)}%"></div>
        </div>
        <span class="an-bar-value">${escapeHtml(item.display)}</span>
      </div>`,
    )
    .join("");
}

function renderDjs(analysis) {
  const items = analysis.djAnalytics.perDj.map((dj) => ({
    label: dj.djName,
    value: dj.avgReach,
    display: `${formatNumber(dj.avgReach)} vues`,
  }));

  renderBars(els.djs, items, { emptyLabel: "Aucun DJ renseigné sur les soirées analysées." });
}

function renderRewards(analysis) {
  // Classement par preference reelle : ce que les clients choisissent.
  const items = analysis.rewardAnalytics.rankedByPreference
    .filter((reward) => reward.claimsCount > 0)
    .map((reward) => ({
      label: reward.title,
      value: reward.claimsCount,
      display: `${reward.claimsCount} fois · ${Math.round(reward.claimShare * 100)}%`,
    }));

  renderBars(els.rewards, items, { emptyLabel: "Aucune récompense réclamée sur cette soirée." });
}

function renderTiming(analysis) {
  const peak = analysis.timing.publicationPeakHour;
  const scanPeak = analysis.timing.scanPeakHour;
  const bonus = analysis.timing.recommendedBonusHour;

  els.timingSub.textContent = `Pic de publications à ${formatHour(peak)} · pic de scans à ${formatHour(scanPeak)}.`;

  // Une echelle commune aux deux series : sinon les hauteurs ne seraient pas comparables
  // visuellement, ce qui est justement l'interet de superposer scans et publications.
  const max = Math.max(...analysis.timing.heatmap.flatMap((h) => [h.publications, h.scans]), 1);

  els.timing.innerHTML = analysis.timing.heatmap
    .map(
      (bucket) => `
      <div class="an-hour ${bucket.hour === peak ? "is-peak" : ""}">
        <div class="an-hour-pair">
          <div class="an-hour-bar is-posts" style="height:${Math.max(3, (bucket.publications / max) * 100)}%"
            title="${formatHour(bucket.hour)} — ${bucket.publications} publications"></div>
          <div class="an-hour-bar is-scans" style="height:${Math.max(3, (bucket.scans / max) * 100)}%"
            title="${formatHour(bucket.hour)} — ${bucket.scans} scans QR"></div>
        </div>
        <span class="an-hour-count">${bucket.publications}</span>
        <span class="an-hour-label">${formatHour(bucket.hour)}</span>
      </div>`,
    )
    .join("");

  // L'ecart entre le moment ou les gens scannent et celui ou ils publient est le
  // vrai levier actionnable : c'est la que se place un bonus.
  if (scanPeak !== null && peak !== null && scanPeak !== peak) {
    els.timingInsight.textContent = `Vos clients scannent surtout à ${formatHour(scanPeak)} mais publient à ${formatHour(peak)}. Lancez le bonus vers ${formatHour(bonus)} pour capter les deux moments.`;
  } else if (bonus !== null) {
    els.timingInsight.textContent = `Scans et publications sont concentrés au même moment : lancez le bonus vers ${formatHour(bonus)}.`;
  } else {
    els.timingInsight.textContent = "";
  }
}

function setBanner(message, tone) {
  if (!message) {
    els.banner.hidden = true;
    return;
  }
  els.banner.textContent = message;
  els.banner.className = `an-banner is-${tone}`;
  els.banner.hidden = false;
}

async function render(eventId) {
  els.main.setAttribute("aria-busy", "true");

  try {
    const { analysis, recommendations } = await loadAnalysis(source, eventId);
    const { actions, wins } = splitRecommendations(recommendations);

    renderHero(analysis);
    renderVerdict(analysis, actions);
    renderTrend(eventId);
    renderActions(actions);
    renderWins(wins);
    renderDjs(analysis);
    renderRewards(analysis);
    renderTiming(analysis);
  } catch (error) {
    setBanner(`Analyse impossible : ${error.message}`, "error");
  } finally {
    els.main.removeAttribute("aria-busy");
  }
}

function populateSelect() {
  els.eventSelect.innerHTML = "";

  // Les plus recentes en haut : c'est la soiree qu'un gerant veut voir en premier.
  for (const event of [...events].reverse()) {
    const option = document.createElement("option");
    option.value = event.id;
    option.textContent = event.djName
      ? `${formatDate(event.eventDate)} — ${event.djName}`
      : formatDate(event.eventDate);
    els.eventSelect.append(option);
  }
}

async function init() {
  source = await resolveSource();

  setBanner(
    source.mode === "demo"
      ? `Mode démonstration — ${source.reason} Les chiffres affichés sont générés.`
      : null,
    "info",
  );

  try {
    events = await loadEvents(source);
  } catch (error) {
    setBanner(`Chargement impossible : ${error.message}`, "error");
    return;
  }

  if (!events.length) {
    setBanner("Aucune soirée enregistrée pour cet établissement.", "info");
    els.eventSelect.disabled = true;
    return;
  }

  populateSelect();
  els.eventSelect.addEventListener("change", () => render(els.eventSelect.value));
  await render(els.eventSelect.value);
}

init();
