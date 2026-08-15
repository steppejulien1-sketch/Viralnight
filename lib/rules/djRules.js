// Regles sur les DJs. Consomment uniquement ctx.djAnalytics et ctx.event.

import { estimateGain } from "./engine.js";

export const djRules = [
  {
    id: "dj-best-reach",
    // Ces deux regles decrivent le meme ecart : inutile de l'annoncer deux fois.
    supersedes: ["dj-large-gap-warning", "dj-current-is-top-performer"],
    evaluate(ctx) {
      const { best, worst } = ctx.djAnalytics;
      if (!best || !worst || worst.avgReach <= 0) return null;
      const gain = ((best.avgReach - worst.avgReach) / worst.avgReach) * 100;
      if (gain < 20) return null;
      return {
        id: this.id,
        category: "dj",
        message: `${best.djName} génère ${Math.round(gain)}% de visibilité supplémentaire par rapport à ${worst.djName}.`,
        estimatedGain: estimateGain(gain),
        priority: "high",
      };
    },
  },
  {
    id: "dj-current-is-top-performer",
    evaluate(ctx) {
      const { best } = ctx.djAnalytics;
      if (!best || ctx.event.dj_name !== best.djName) return null;
      return {
        id: this.id,
        category: "dj",
        message: `${best.djName} est actuellement le DJ le plus performant en reach.`,
        estimatedGain: estimateGain((best.avgReach / (ctx.djAnalytics.worst?.avgReach || best.avgReach) - 1) * 100) || 10,
        priority: "medium",
      };
    },
  },
  {
    id: "dj-current-underperforms",
    // Constat propre a la soiree consultee : plus actionnable que la comparaison
    // generique entre le meilleur et le moins bon DJ, qu'il remplace donc.
    supersedes: ["dj-best-reach"],
    evaluate(ctx) {
      const current = ctx.djAnalytics.perDj.find((d) => d.djName === ctx.event.dj_name);
      const { best } = ctx.djAnalytics;
      if (!current || !best || current.djName === best.djName || best.avgReach <= 0) return null;
      const gap = ((best.avgReach - current.avgReach) / best.avgReach) * 100;
      if (gap < 25) return null;
      return {
        id: this.id,
        category: "dj",
        message: `${current.djName} génère ${Math.round(gap)}% de reach en moins que ${best.djName} en moyenne.`,
        estimatedGain: estimateGain(gap, 0.5),
        priority: "medium",
      };
    },
  },
  {
    id: "dj-insufficient-history",
    evaluate(ctx) {
      const current = ctx.djAnalytics.perDj.find((d) => d.djName === ctx.event.dj_name);
      if (!current || current.eventsCount >= 3) return null;
      return {
        id: this.id,
        category: "dj",
        message: `${current.djName} n'a pas encore assez de soirées pour une comparaison fiable (${current.eventsCount} soirée(s)).`,
        estimatedGain: 0,
        priority: "low",
      };
    },
  },
  {
    id: "dj-high-engagement",
    evaluate(ctx) {
      const top = ctx.djAnalytics.perDj.reduce(
        (best, d) => (d.avgEngagement > (best?.avgEngagement || 0) ? d : best),
        null,
      );
      if (!top || top.avgEngagement < 10) return null;
      return {
        id: this.id,
        category: "dj",
        message: `${top.djName} génère le plus de publications en moyenne par soirée.`,
        estimatedGain: 6,
        priority: "low",
      };
    },
  },
  {
    id: "dj-high-participation",
    evaluate(ctx) {
      const top = ctx.djAnalytics.perDj.reduce(
        (best, d) => (d.avgParticipation > (best?.avgParticipation || 0) ? d : best),
        null,
      );
      if (!top || top.avgParticipation < 10) return null;
      return {
        id: this.id,
        category: "dj",
        message: `${top.djName} génère le plus de scans QR en moyenne par soirée.`,
        estimatedGain: 6,
        priority: "low",
      };
    },
  },
  {
    id: "dj-no-name-set",
    evaluate(ctx) {
      if (ctx.event.dj_name) return null;
      return {
        id: this.id,
        category: "dj",
        message: "Aucun DJ renseigné pour cette soirée : impossible de comparer sa performance.",
        estimatedGain: 0,
        priority: "low",
      };
    },
  },
  {
    id: "dj-consistent-top-3",
    evaluate(ctx) {
      const ranked = ctx.djAnalytics.perDj;
      if (ranked.length < 3) return null;
      const current = ranked.find((d) => d.djName === ctx.event.dj_name);
      if (!current) return null;
      const rank = ranked.indexOf(current);
      if (rank > 2) return null;
      return {
        id: this.id,
        category: "dj",
        message: `${current.djName} se maintient dans le top 3 des DJs en reach.`,
        estimatedGain: 5,
        priority: "low",
      };
    },
  },
  {
    id: "dj-wide-roster-recommendation",
    evaluate(ctx) {
      if (ctx.djAnalytics.perDj.length < 4) return null;
      return {
        id: this.id,
        category: "dj",
        message: "Plusieurs DJs ont un historique suffisant : une rotation basée sur le reach moyen peut optimiser la programmation.",
        estimatedGain: 4,
        priority: "low",
      };
    },
  },
  {
    id: "dj-large-gap-warning",
    evaluate(ctx) {
      const { best, worst } = ctx.djAnalytics;
      if (!best || !worst || worst.avgReach <= 0) return null;
      const gap = ((best.avgReach - worst.avgReach) / worst.avgReach) * 100;
      if (gap < 60) return null;
      return {
        id: this.id,
        category: "dj",
        message: `L'écart de reach entre ${best.djName} et ${worst.djName} est très important (${Math.round(gap)}%) : réévaluer la programmation de ${worst.djName}.`,
        estimatedGain: estimateGain(gap, 0.3),
        priority: "high",
      };
    },
  },
];
