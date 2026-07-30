// Compare une soiree a une ou plusieurs soirees precedentes du meme establishment.

function percentDelta(current, previous) {
  if (!previous) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

/**
 * @param {object} params
 * @param {object} params.currentMetrics - event_metrics de la soiree courante
 * @param {object|null} params.previousMetrics - event_metrics de la soiree comparee (ex: semaine derniere)
 * @param {Array<object>} params.recentMetrics - event_metrics des N dernieres soirees (moyenne mobile)
 */
export function compareEvents({ currentMetrics, previousMetrics, recentMetrics }) {
  const fields = ["total_reach", "stories_count", "reels_count", "tiktoks_count", "points_distributed", "rewards_claimed_count", "scans_count"];

  const vsPrevious = Object.fromEntries(
    fields.map((field) => [field, percentDelta(currentMetrics[field], previousMetrics?.[field])]),
  );

  const averages = Object.fromEntries(
    fields.map((field) => [
      field,
      recentMetrics.length
        ? recentMetrics.reduce((sum, m) => sum + (m[field] || 0), 0) / recentMetrics.length
        : 0,
    ]),
  );

  const vsAverage = Object.fromEntries(
    fields.map((field) => [field, percentDelta(currentMetrics[field], averages[field])]),
  );

  return { vsPrevious, vsAverage, averages };
}
