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
  verdict: document.getElementById("anVerdict"),
  kpis: document.getElementById("anKpis"),
  actions: document.getElementById("anActions"),
  djs: document.getElementById("anDjs"),
  rewards: document.getElementById("anRewards"),
  hours: document.getElementById("anHours"),
  timing: document.getElementById("anTiming"),
};

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

  function rendreVerdict(analysis, actions) {
    const note = Math.round(analysis.viralScore);
    const delta = Math.round(analysis.comparison.vsAverage.total_reach);

    const niveau = note >= 80 ? "Très bonne soirée" : note >= 55 ? "Soirée correcte" : "Soirée en dessous des habitudes";
    const tendance =
      delta >= 10 ? `, en hausse de ${delta}%` : delta <= -10 ? `, en baisse de ${Math.abs(delta)}%` : ", dans la moyenne";
    const levier = actions[0] ? ` Levier le plus rentable : ${actions[0].message}` : "";

    els.verdict.textContent = `${niveau}${tendance} sur les dernières soirées.${levier}`;
  }

  function rendreKpis(analysis) {
    const note = Math.round(analysis.viralScore);
    const delta = Math.round(analysis.comparison.vsAverage.total_reach);
    const publications =
      analysis.metrics.stories_count + analysis.metrics.reels_count + analysis.metrics.tiktoks_count;

    const tuiles = [
      { label: "Note de la soirée", valeur: `${note}/100`, sous: "calculée sur 5 critères" },
      { label: "Vues générées", valeur: num(analysis.metrics.total_reach), sous: `${num(publications)} publications` },
      {
        label: "vs soirées précédentes",
        valeur: `${delta > 0 ? "+" : ""}${delta}%`,
        sous: "moyenne récente",
        ton: delta >= 0 ? "up" : "down",
      },
      { label: "Scans QR", valeur: num(analysis.metrics.scans_count), sous: `${analysis.event.participants_count} participants` },
    ];

    els.kpis.innerHTML = tuiles
      .map(
        (t) => `
        <div class="an-kpi">
          <span class="an-kpi-value ${t.ton ? `is-${t.ton}` : ""}">${escapeHtml(t.valeur)}</span>
          <span class="an-kpi-label">${escapeHtml(t.label)}</span>
          <span class="an-kpi-sub">${escapeHtml(t.sous)}</span>
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
        (a) => `
        <li class="an-action is-${escapeHtml(a.priority)}">
          <span>${escapeHtml(a.message)}</span>
          <strong>+${Math.round(a.estimatedGain)}%</strong>
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
