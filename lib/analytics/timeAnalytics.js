// Heatmap horaire : repartition des publications et des scans par heure de la soiree.
// Detecte le meilleur moment pour lancer un bonus / distribuer des recompenses.

const HOURS_WINDOW = [22, 23, 0, 1, 2, 3]; // creneau soiree typique, traverse minuit

function emptyHourBuckets() {
  const buckets = new Map();
  for (const hour of HOURS_WINDOW) buckets.set(hour, 0);
  return buckets;
}

function bucketByHour(timestamps) {
  const buckets = emptyHourBuckets();
  for (const ts of timestamps) {
    const hour = new Date(ts).getHours();
    if (buckets.has(hour)) buckets.set(hour, buckets.get(hour) + 1);
  }
  return buckets;
}

function peakOf(buckets) {
  let peakHour = null;
  let peakValue = -1;
  for (const [hour, value] of buckets) {
    if (value > peakValue) {
      peakValue = value;
      peakHour = hour;
    }
  }
  return { hour: peakHour, count: peakValue };
}

/**
 * @param {object} params
 * @param {Array<string>} params.submissionTimestamps - submitted_at des submissions de l'event
 * @param {Array<string>} params.scanTimestamps - scanned_at des qr_scans de l'event
 * @param {Array<string>} params.redemptionTimestamps - redeemed_at des reward_redemptions de l'event
 */
export function analyzeTiming({ submissionTimestamps, scanTimestamps, redemptionTimestamps }) {
  const publicationBuckets = bucketByHour(submissionTimestamps);
  const scanBuckets = bucketByHour(scanTimestamps);
  const redemptionBuckets = bucketByHour(redemptionTimestamps);

  const publicationPeak = peakOf(publicationBuckets);
  const scanPeak = peakOf(scanBuckets);

  // Meilleur moment pour lancer un bonus = juste avant le pic de scans observe historiquement.
  const bonusHour = scanPeak.hour !== null ? mod24(scanPeak.hour - 1) : null;

  return {
    heatmap: HOURS_WINDOW.map((hour) => ({
      hour,
      publications: publicationBuckets.get(hour),
      scans: scanBuckets.get(hour),
      redemptions: redemptionBuckets.get(hour),
    })),
    publicationPeakHour: publicationPeak.hour,
    scanPeakHour: scanPeak.hour,
    recommendedBonusHour: bonusHour,
  };
}

function mod24(hour) {
  return ((hour % 24) + 24) % 24;
}
