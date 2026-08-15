// Regles de tendance. Consomment uniquement ctx.comparison, ctx.metrics, ctx.viralScore.

import { estimateGain } from "./engine.js";

export const trendRules = [
  {
    id: "trend-reach-growth",
    evaluate(ctx) {
      const delta = ctx.comparison.vsAverage.total_reach;
      if (delta < 15) return null;
      return {
        id: this.id,
        category: "trend",
        message: `Le reach de cette soirée dépasse la moyenne des dernières soirées de ${Math.round(delta)}%.`,
        estimatedGain: estimateGain(delta),
        priority: "high",
      };
    },
  },
  {
    id: "trend-reach-decline",
    evaluate(ctx) {
      const delta = ctx.comparison.vsAverage.total_reach;
      if (delta > -15) return null;
      return {
        id: this.id,
        category: "trend",
        message: `Le reach de cette soirée est en baisse de ${Math.round(Math.abs(delta))}% par rapport à la moyenne récente.`,
        estimatedGain: 0,
        priority: "high",
      };
    },
  },
  {
    id: "trend-engagement-decline",
    evaluate(ctx) {
      const submissionsDelta =
        ctx.comparison.vsAverage.stories_count + ctx.comparison.vsAverage.reels_count + ctx.comparison.vsAverage.tiktoks_count;
      if (submissionsDelta > -30) return null;
      return {
        id: this.id,
        category: "trend",
        message: "Le volume de publications baisse significativement par rapport aux soirées précédentes.",
        estimatedGain: 0,
        priority: "high",
      };
    },
  },
  {
    id: "trend-scans-growth",
    evaluate(ctx) {
      const delta = ctx.comparison.vsAverage.scans_count;
      if (delta < 20) return null;
      return {
        id: this.id,
        category: "trend",
        message: `Le nombre de scans QR augmente de ${Math.round(delta)}% par rapport à la moyenne récente.`,
        estimatedGain: estimateGain(delta, 0.5),
        priority: "medium",
      };
    },
  },
  {
    id: "trend-points-distributed-growth",
    evaluate(ctx) {
      const delta = ctx.comparison.vsAverage.points_distributed;
      if (delta < 20) return null;
      return {
        id: this.id,
        category: "trend",
        message: `Les points distribués augmentent de ${Math.round(delta)}% : le programme de fidélité gagne en traction.`,
        estimatedGain: estimateGain(delta, 0.3),
        priority: "low",
      };
    },
  },
  {
    id: "trend-claims-growth",
    evaluate(ctx) {
      const delta = ctx.comparison.vsAverage.rewards_claimed_count;
      if (delta < 20) return null;
      return {
        id: this.id,
        category: "trend",
        message: `Les réclamations de récompenses progressent de ${Math.round(delta)}% par rapport à la moyenne récente.`,
        estimatedGain: estimateGain(delta, 0.3),
        priority: "low",
      };
    },
  },
  {
    id: "trend-viral-score-excellent",
    evaluate(ctx) {
      if (ctx.viralScore < 85) return null;
      return {
        id: this.id,
        category: "trend",
        message: `Note exceptionnelle (${Math.round(ctx.viralScore)}/100) : cette soirée peut servir de référence pour les prochaines.`,
        estimatedGain: 0,
        priority: "medium",
      };
    },
  },
  {
    id: "trend-viral-score-weak",
    evaluate(ctx) {
      if (ctx.viralScore > 40) return null;
      return {
        id: this.id,
        category: "trend",
        message: `Note faible (${Math.round(ctx.viralScore)}/100) : plusieurs leviers (récompenses, timing, DJ) sont à revoir ensemble.`,
        estimatedGain: 0,
        priority: "high",
      };
    },
  },
  {
    id: "trend-diversity-low",
    evaluate(ctx) {
      if (ctx.scoreBreakdown.contentDiversity > 5) return null;
      return {
        id: this.id,
        category: "trend",
        message: "Le contenu publié est concentré sur un seul type de format : diversifier stories/reels/TikTok améliorerait la portée.",
        estimatedGain: 8,
        priority: "medium",
      };
    },
  },
  {
    id: "trend-participation-low",
    evaluate(ctx) {
      if (ctx.scoreBreakdown.participation > 8) return null;
      return {
        id: this.id,
        category: "trend",
        message: "Le taux de publication rapporté au nombre de participants est en dessous du meilleur niveau historique.",
        estimatedGain: 10,
        priority: "medium",
      };
    },
  },
];
