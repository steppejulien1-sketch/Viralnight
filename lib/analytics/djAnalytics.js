// Comparaison des DJs sur l'historique des soirees d'un establishment.
// Prend les soirees + leurs metriques deja calculees (event_metrics), regroupe par dj_name.

/**
 * @param {object} params
 * @param {Array<object>} params.events - events de l'establishment avec dj_name
 * @param {Map<string, object>} params.metricsByEventId - event_metrics indexees par event_id
 * @returns {{ perDj: Array<object>, best: object|null, worst: object|null }}
 */
export function analyzeDjs({ events, metricsByEventId }) {
  const byDj = new Map();

  for (const event of events) {
    const djName = event.dj_name?.trim();
    if (!djName) continue;

    const metrics = metricsByEventId.get(event.id);
    if (!metrics) continue;

    if (!byDj.has(djName)) byDj.set(djName, []);
    byDj.get(djName).push(metrics);
  }

  const perDj = [...byDj.entries()].map(([djName, metricsList]) => {
    const reaches = metricsList.map((m) => m.total_reach);
    const avgReach = average(reaches);

    return {
      djName,
      eventsCount: metricsList.length,
      avgReach,
      avgParticipation: average(metricsList.map((m) => m.scans_count)),
      avgEngagement: average(metricsList.map((m) => m.stories_count + m.reels_count + m.tiktoks_count)),
      bestReach: Math.max(...reaches),
      worstReach: Math.min(...reaches),
      // Coefficient de variation : mesure la regularite. Un DJ a forte moyenne mais
      // tres irregulier n'est pas un choix fiable, et une moyenne seule le masque.
      reachVariability: avgReach > 0 ? standardDeviation(reaches) / avgReach : 0,
    };
  });

  const ranked = [...perDj].sort((a, b) => b.avgReach - a.avgReach);

  return {
    perDj: ranked,
    best: ranked[0] || null,
    worst: ranked.length > 1 ? ranked[ranked.length - 1] : null,
  };
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function standardDeviation(values) {
  if (values.length < 2) return 0;
  const mean = average(values);
  return Math.sqrt(average(values.map((value) => (value - mean) ** 2)));
}
