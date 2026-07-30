// Regles horaires. Consomment uniquement ctx.timing.

function formatHour(hour) {
  return hour === null ? null : `${String(hour).padStart(2, "0")}h`;
}

export const timingRules = [
  {
    id: "timing-bonus-hour",
    evaluate(ctx) {
      const hour = ctx.timing.recommendedBonusHour;
      if (hour === null) return null;
      return {
        id: this.id,
        category: "timing",
        message: `Lancer le bonus x2 vers ${formatHour(hour)} maximiserait la reactivite avant le pic de scans.`,
        estimatedGain: 18,
        priority: "high",
      };
    },
  },
  {
    id: "timing-publication-peak",
    evaluate(ctx) {
      const hour = ctx.timing.publicationPeakHour;
      const bucket = ctx.timing.heatmap.find((h) => h.hour === hour);
      if (hour === null || !bucket || bucket.publications === 0) return null;
      return {
        id: this.id,
        category: "timing",
        message: `Le pic de publications se situe vers ${formatHour(hour)}.`,
        estimatedGain: 10,
        priority: "medium",
      };
    },
  },
  {
    id: "timing-scan-peak",
    evaluate(ctx) {
      const hour = ctx.timing.scanPeakHour;
      const bucket = ctx.timing.heatmap.find((h) => h.hour === hour);
      if (hour === null || !bucket || bucket.scans === 0) return null;
      return {
        id: this.id,
        category: "timing",
        message: `Le pic de scans QR se situe vers ${formatHour(hour)} : ideal pour distribuer les recompenses.`,
        estimatedGain: 12,
        priority: "medium",
      };
    },
  },
  {
    id: "timing-early-slump",
    evaluate(ctx) {
      const earlyHours = ctx.timing.heatmap.filter((h) => [22, 23].includes(h.hour));
      const total = earlyHours.reduce((s, h) => s + h.publications, 0);
      const grandTotal = ctx.timing.heatmap.reduce((s, h) => s + h.publications, 0);
      if (grandTotal === 0 || total / grandTotal > 0.1) return null;
      return {
        id: this.id,
        category: "timing",
        message: "Peu de publications en debut de soiree (22h-23h) : un bonus d'entree pourrait relancer l'activite tot.",
        estimatedGain: 9,
        priority: "medium",
      };
    },
  },
  {
    id: "timing-late-surge",
    evaluate(ctx) {
      const lateHours = ctx.timing.heatmap.filter((h) => [1, 2, 3].includes(h.hour));
      const total = lateHours.reduce((s, h) => s + h.publications, 0);
      const grandTotal = ctx.timing.heatmap.reduce((s, h) => s + h.publications, 0);
      if (grandTotal === 0 || total / grandTotal < 0.4) return null;
      return {
        id: this.id,
        category: "timing",
        message: "Une part importante des publications arrive en fin de soiree : envisager une seconde vague de recompenses apres 1h.",
        estimatedGain: 11,
        priority: "medium",
      };
    },
  },
  {
    id: "timing-scan-publication-mismatch",
    evaluate(ctx) {
      const { scanPeakHour, publicationPeakHour } = ctx.timing;
      if (scanPeakHour === null || publicationPeakHour === null) return null;
      const gap = Math.abs(scanPeakHour - publicationPeakHour);
      if (gap < 2) return null;
      return {
        id: this.id,
        category: "timing",
        message: `Les pics de scan (${formatHour(scanPeakHour)}) et de publication (${formatHour(publicationPeakHour)}) sont decales : synchroniser les incitations sur ces deux moments.`,
        estimatedGain: 7,
        priority: "low",
      };
    },
  },
  {
    id: "timing-no-scans-recorded",
    evaluate(ctx) {
      const total = ctx.timing.heatmap.reduce((s, h) => s + h.scans, 0);
      if (total > 0) return null;
      return {
        id: this.id,
        category: "timing",
        message: "Aucun scan QR enregistre sur cette soiree : verifier l'affichage et l'accessibilite du QR code.",
        estimatedGain: 0,
        priority: "high",
      };
    },
  },
  {
    id: "timing-redemption-peak",
    evaluate(ctx) {
      const top = ctx.timing.heatmap.reduce((best, h) => (h.redemptions > (best?.redemptions || 0) ? h : best), null);
      if (!top || top.redemptions === 0) return null;
      return {
        id: this.id,
        category: "timing",
        message: `Les reclamations de recompenses culminent vers ${formatHour(top.hour)}.`,
        estimatedGain: 5,
        priority: "low",
      };
    },
  },
  {
    id: "timing-flat-activity",
    evaluate(ctx) {
      const values = ctx.timing.heatmap.map((h) => h.publications);
      const max = Math.max(...values);
      const min = Math.min(...values);
      if (max === 0 || max - min > max * 0.3) return null;
      return {
        id: this.id,
        category: "timing",
        message: "L'activite de publication est repartie de maniere tres homogene sur la soiree, sans creneau dominant.",
        estimatedGain: 0,
        priority: "low",
      };
    },
  },
  {
    id: "timing-midnight-peak",
    evaluate(ctx) {
      const midnight = ctx.timing.heatmap.find((h) => h.hour === 0);
      const total = ctx.timing.heatmap.reduce((s, h) => s + h.publications, 0);
      if (!midnight || total === 0 || midnight.publications / total < 0.35) return null;
      return {
        id: this.id,
        category: "timing",
        message: "Minuit concentre la plus grande part des publications : c'est le creneau prioritaire pour toute activation.",
        estimatedGain: 14,
        priority: "high",
      };
    },
  },
];
