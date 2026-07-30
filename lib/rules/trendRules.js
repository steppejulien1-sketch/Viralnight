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
        message: `Le reach de cette soiree depasse la moyenne des dernieres soirees de ${Math.round(delta)}%.`,
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
        message: `Le reach de cette soiree est en baisse de ${Math.round(Math.abs(delta))}% par rapport a la moyenne recente.`,
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
        message: "Le volume de publications baisse significativement par rapport aux soirees precedentes.",
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
        message: `Le nombre de scans QR augmente de ${Math.round(delta)}% par rapport a la moyenne recente.`,
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
        message: `Les points distribues augmentent de ${Math.round(delta)}% : le programme de fidelite gagne en traction.`,
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
        message: `Les reclamations de recompenses progressent de ${Math.round(delta)}% par rapport a la moyenne recente.`,
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
        message: `Note exceptionnelle (${Math.round(ctx.viralScore)}/100) : cette soiree peut servir de reference pour les prochaines.`,
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
        message: `Note faible (${Math.round(ctx.viralScore)}/100) : plusieurs leviers (recompenses, timing, DJ) sont a revoir ensemble.`,
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
        message: "Le contenu publie est concentre sur un seul type de format : diversifier stories/reels/TikTok ameliorerait la portee.",
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
        message: "Le taux de publication rapporte au nombre de participants est en dessous du meilleur niveau historique.",
        estimatedGain: 10,
        priority: "medium",
      };
    },
  },
];
