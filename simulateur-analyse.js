// Section "Analyse des soirees" du simulateur commercial.
//
// Le reste du simulateur affiche des valeurs figees : ici les chiffres sont
// reellement calcules par le moteur de production (lib/analytics + lib/rules) sur des
// soirees generees. Un prospect qui change de soiree voit donc l'analyse se refaire,
// pas un texte pre-ecrit — c'est ce qui rend la demonstration credible.

import { buildDemoDataset, buildMetricsMap } from "./demo-data.js";
import { runFullAnalysis } from "./lib/analytics/index.js";
import { generateRecommendations } from "./lib/rules/index.js";
import { escapeHtml } from "./lib/html/escape.js";

const els = {
  select: document.getElementById("anEvent"),
  score: document.getElementById("anScore"),
  ring: document.getElementById("anRing"),
  verdictHead: document.getElementById("anVerdictHead"),
  verdict: document.getElementById("anVerdict"),
  kpis: document.getElementById("anKpis"),
  actions: document.getElementById("anActions"),
  djs: document.getElementById("anDjs"),
  rewards: document.getElementById("anRewards"),
  hours: document.getElementById("anHours"),
  hoursGrid: document.getElementById("anHoursGrid"),
  timing: document.getElementById("anTiming"),
};

/** Libelle lisible de la priorite : la couleur seule ne suffit pas. */
const PRIORITE = { high: "Prioritaire", medium: "À surveiller", low: "Secondaire" };

// Sans la section dans la page, on ne fait rien : le simulateur reste fonctionnel.
if (els.select) {
  const dataset = buildDemoDataset();
  const metricsByEventId = buildMetricsMap(dataset);

  const nf = new Intl.NumberFormat("fr-FR");
  const num = (v) => nf.format(Math.round(v));
  const heure = (h) => (h === null || h === undefined ? "--" : `${String(h).padStart(2, "0")}h`);

  const dateCourte = (iso) => {
    const [a, m, j] = iso.split("-");
    return new Date(Number(a), Number(m) - 1, Number(j)).toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  };

  const analyser = (eventId) =>
    runFullAnalysis({
      eventId,
      // Le moteur attend les soirees les plus recentes en premier.
      events: [...dataset.events].reverse(),
      rewards: dataset.rewards,
      redemptions: dataset.redemptions.filter((r) => r.event_id === eventId),
      submissions: dataset.submissions.filter((s) => s.event_id === eventId),
      qrScans: dataset.qrScans.filter((s) => s.event_id === eventId),
      metricsByEventId,
      recentSubmissions: dataset.submissions.filter((s) => s.event_id !== eventId),
    });

  /**
   * Verdict : la note remplit l'anneau, la phrase dit pourquoi.
   * L'anneau utilise pathLength=100 sur le cercle, donc la dasharray
   * s'ecrit directement en points sur 100 sans calculer de circonference.
   */
  function rendreVerdict(analysis, actions) {
    const note = Math.round(analysis.viralScore);
    const delta = Math.round(analysis.comparison.vsAverage.total_reach);

    els.score.textContent = note;
    els.ring.style.strokeDasharray = `${note} 100`;

    els.verdictHead.textContent =
      note >= 80 ? "Très bonne soirée" : note >= 55 ? "Soirée correcte" : "Soirée en dessous des habitudes";

    const tendance =
      delta >= 10
        ? `En hausse de <b>${delta}%</b> sur la moyenne des dernières soirées.`
        : delta <= -10
          ? `En baisse de <b>${Math.abs(delta)}%</b> sur la moyenne des dernières soirées.`
          : "Dans la moyenne des dernières soirées.";

    const levier = actions[0]
      ? ` Levier le plus rentable : ${escapeHtml(actions[0].message)}`
      : " Rien de préoccupant à corriger.";

    els.verdict.innerHTML = `${tendance}${levier}`;
  }

  /** Memes tuiles que la vue generale : c'est le composant .kpi du dashboard. */
  function rendreKpis(analysis) {
    const delta = Math.round(analysis.comparison.vsAverage.total_reach);
    const publications =
      analysis.metrics.stories_count + analysis.metrics.reels_count + analysis.metrics.tiktoks_count;
    const choisies = analysis.rewardAnalytics.rankedByPreference.filter((r) => r.claimsCount > 0);

    const tuiles = [
      {
        label: "Vues générées",
        valeur: num(analysis.metrics.total_reach),
        delta: `${delta > 0 ? "↑ +" : delta < 0 ? "↓ " : ""}${delta}%`,
        ton: delta >= 0 ? "up" : "down",
        sous: `${num(publications)} publications validées`,
      },
      {
        label: "Scans QR",
        valeur: num(analysis.metrics.scans_count),
        sous: `${num(analysis.event.participants_count)} participants`,
      },
      {
        label: "Récompenses utilisées",
        valeur: num(choisies.reduce((total, r) => total + r.claimsCount, 0)),
        sous: `${num(choisies.length)} récompense${choisies.length > 1 ? "s" : ""} différente${choisies.length > 1 ? "s" : ""}`,
      },
    ];

    els.kpis.innerHTML = tuiles
      .map(
        (t) => `
        <div class="kpi spot">
          <div class="kpi-top">
            <span class="kpi-label">${escapeHtml(t.label)}</span>
            ${t.delta ? `<span class="kpi-delta ${t.ton}">${escapeHtml(t.delta)}</span>` : ""}
          </div>
          <div class="kpi-value">${escapeHtml(t.valeur)}</div>
          <div class="kpi-sub">${escapeHtml(t.sous)}</div>
        </div>`,
      )
      .join("");
  }

  function rendreActions(actions) {
    if (!actions.length) {
      els.actions.innerHTML = '<li class="an-empty">Rien de préoccupant sur cette soirée.</li>';
      return;
    }

    els.actions.innerHTML = actions
      .map(
        (a, index) => `
        <li class="an-action is-${escapeHtml(a.priority)}">
          <span class="an-action-rank">${String(index + 1).padStart(2, "0")}</span>
          <span class="an-action-text">
            ${escapeHtml(a.message)}
            <span class="an-action-prio">${escapeHtml(PRIORITE[a.priority] || a.priority)}</span>
          </span>
          <span class="an-action-gain">+${Math.round(a.estimatedGain)}%</span>
        </li>`,
      )
      .join("");
  }

  /** Barres comparatives : la premiere est mise en avant. */
  function rendreBarres(cible, items) {
    if (!items.length) {
      cible.innerHTML = '<p class="an-empty">Aucune donnée sur cette soirée.</p>';
      return;
    }

    const max = Math.max(...items.map((i) => i.valeur), 1);

    cible.innerHTML = items
      .map(
        (item, index) => `
        <div class="an-bar ${index === 0 ? "is-top" : ""}">
          <span class="an-bar-rank">${String(index + 1).padStart(2, "0")}</span>
          <span class="an-bar-label">${escapeHtml(item.label)}</span>
          <span class="an-bar-value">${escapeHtml(item.affichage)}</span>
          <div class="an-bar-track"><div class="an-bar-fill" style="width:${Math.round((item.valeur / max) * 100)}%"></div></div>
        </div>`,
      )
      .join("");
  }

  function rendreHoraires(analysis) {
    const pic = analysis.timing.publicationPeakHour;
    const picScans = analysis.timing.scanPeakHour;
    const bonus = analysis.timing.recommendedBonusHour;

    // Echelle commune aux deux series, sinon les hauteurs ne sont pas comparables.
    const max = Math.max(...analysis.timing.heatmap.flatMap((h) => [h.publications, h.scans]), 1);

    // Reperes chiffres : sans eux les barres se comparent entre elles mais ne
    // disent aucune quantite. Trois lignes suffisent, davantage bruite le fond.
    els.hoursGrid.innerHTML = [1, 0.5, 0]
      .map(
        (part) => `
        <div class="an-gl" style="top:${Math.round((1 - part) * 100)}%">
          <span>${num(max * part)}</span>
        </div>`,
      )
      .join("");

    els.hours.innerHTML = analysis.timing.heatmap
      .map(
        (b) => `
        <div class="an-hour ${b.hour === pic ? "is-peak" : ""}">
          <div class="an-hour-pair">
            <div class="an-hour-bar is-scans" style="height:${Math.max(3, (b.scans / max) * 100)}%"
              title="${heure(b.hour)} — ${b.scans} scans"></div>
            <div class="an-hour-bar is-posts" style="height:${Math.max(3, (b.publications / max) * 100)}%"
              title="${heure(b.hour)} — ${b.publications} publications"></div>
          </div>
          <span class="an-hour-label">${heure(b.hour)}</span>
        </div>`,
      )
      .join("");

    els.timing.textContent =
      picScans !== null && pic !== null && picScans !== pic
        ? `Les clients scannent surtout à ${heure(picScans)} mais publient à ${heure(pic)} : le bonus doit partir vers ${heure(bonus)}.`
        : `Scans et publications au même moment : lancer le bonus vers ${heure(bonus)}.`;
  }

  function rendre(eventId) {
    const analysis = analyser(eventId);
    const recommandations = generateRecommendations(analysis);
    const actions = recommandations
      .filter((r) => r.estimatedGain > 0)
      .sort((a, b) => b.estimatedGain - a.estimatedGain)
      .slice(0, 4);

    rendreVerdict(analysis, actions);
    rendreKpis(analysis);
    rendreActions(actions);

    rendreBarres(
      els.djs,
      analysis.djAnalytics.perDj.map((dj) => ({
        label: dj.djName,
        valeur: dj.avgReach,
        affichage: `${num(dj.avgReach)} vues`,
      })),
    );

    // Classement par preference reelle : ce que les clients choisissent.
    rendreBarres(
      els.rewards,
      analysis.rewardAnalytics.rankedByPreference
        .filter((r) => r.claimsCount > 0)
        .map((r) => ({
          label: r.title,
          valeur: r.claimsCount,
          affichage: `${r.claimsCount} fois · ${Math.round(r.claimShare * 100)}%`,
        })),
    );

    rendreHoraires(analysis);
  }

  // Les plus recentes en haut : c'est la soiree qu'on veut montrer en premier.
  for (const event of [...dataset.events].reverse()) {
    const option = document.createElement("option");
    option.value = event.id;
    option.textContent = `${dateCourte(event.event_date)} — ${event.dj_name}`;
    els.select.append(option);
  }

  els.select.addEventListener("change", () => rendre(els.select.value));
  rendre(els.select.value);
}
