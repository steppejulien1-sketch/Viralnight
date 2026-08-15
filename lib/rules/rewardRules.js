// Regles sur les recompenses. Consomment uniquement ctx.rewardAnalytics.

import { estimateGain } from "./engine.js";

function pct(value) {
  return Math.round(value);
}

export const rewardRules = [
  {
    id: "reward-most-preferred",
    evaluate(ctx) {
      const { mostPreferred } = ctx.rewardAnalytics;
      if (!mostPreferred || mostPreferred.claimsCount < 5) return null;
      return {
        id: this.id,
        category: "reward",
        message: `${mostPreferred.title} est la récompense préférée des clients : ${Math.round(mostPreferred.claimShare * 100)}% des réclamations de la soirée.`,
        estimatedGain: 0,
        priority: "high",
      };
    },
  },
  {
    id: "reward-least-preferred",
    evaluate(ctx) {
      const { leastPreferred, mostPreferred } = ctx.rewardAnalytics;
      if (!leastPreferred || !mostPreferred || leastPreferred.claimsCount === 0) return null;
      if (leastPreferred.claimShare > 0.08) return null;
      return {
        id: this.id,
        category: "reward",
        message: `${leastPreferred.title} n'attire presque personne (${Math.round(leastPreferred.claimShare * 100)}% des réclamations) : la remplacer libérait du budget.`,
        estimatedGain: 8,
        priority: "medium",
      };
    },
  },
  {
    id: "reward-reach-gap-20",
    evaluate(ctx) {
      const { best, second } = ctx.rewardAnalytics.rankedByReach;
      if (!best || !second || second.avgReach <= 0) return null;
      const gap = (best.avgReach - second.avgReach) / second.avgReach;
      if (gap < 0.2) return null;
      return {
        id: this.id,
        category: "reward",
        message: `${best.title} génère ${pct(gap * 100)}% de reach supplémentaire par rapport à ${second.title}.`,
        estimatedGain: estimateGain(gap * 100),
        priority: "high",
      };
    },
  },
  {
    id: "reward-best-cost-visibility",
    evaluate(ctx) {
      const { bestCostVisibility, perReward } = ctx.rewardAnalytics;
      if (!bestCostVisibility || perReward.length < 2) return null;
      const others = perReward.filter((r) => r.rewardId !== bestCostVisibility.rewardId && r.costPerThousandReach);
      if (!others.length) return null;
      const avgCost = others.reduce((s, r) => s + r.costPerThousandReach, 0) / others.length;
      if (avgCost <= 0) return null;
      const gain = ((avgCost - bestCostVisibility.costPerThousandReach) / avgCost) * 100;
      if (gain < 10) return null;
      return {
        id: this.id,
        category: "reward",
        message: `${bestCostVisibility.title} offre le meilleur ratio coût/visibilité de la soirée.`,
        estimatedGain: estimateGain(gain),
        priority: "medium",
      };
    },
  },
  {
    id: "reward-underused",
    evaluate(ctx) {
      const underused = ctx.rewardAnalytics.perReward.find((r) => r.claimsCount === 0);
      if (!underused) return null;
      return {
        id: this.id,
        category: "reward",
        message: `${underused.title} n'a été réclamée par aucun client cette soirée.`,
        estimatedGain: 0,
        priority: "low",
      };
    },
  },
  {
    id: "reward-worst-reach",
    evaluate(ctx) {
      const { all } = ctx.rewardAnalytics.rankedByReach;
      if (all.length < 2) return null;
      const worst = all[all.length - 1];
      const best = all[0];
      if (best.avgReach <= 0) return null;

      // Ne jamais proposer de retirer la recompense preferee des clients : elle genere
      // peut-etre moins de reach par reclamation, mais c'est elle qui fait venir les gens.
      // Sans ce garde-fou, le moteur se contredit d'une section a l'autre.
      if (ctx.rewardAnalytics.mostPreferred?.rewardId === worst.rewardId) return null;

      const gap = ((best.avgReach - worst.avgReach) / best.avgReach) * 100;
      if (gap < 30) return null;
      return {
        id: this.id,
        category: "reward",
        message: `Remplacer ${worst.title} par ${best.title} pourrait améliorer le reach généré.`,
        estimatedGain: estimateGain(gap, 0.4),
        priority: "high",
      };
    },
  },
  {
    id: "reward-high-claim-rate",
    evaluate(ctx) {
      const top = ctx.rewardAnalytics.perReward.reduce(
        (best, r) => (r.claimsCount > (best?.claimsCount || 0) ? r : best),
        null,
      );
      if (!top || top.claimsCount < 5) return null;
      return {
        id: this.id,
        category: "reward",
        message: `${top.title} est la récompense la plus réclamée de la soirée (${top.claimsCount} réclamations).`,
        estimatedGain: 8,
        priority: "low",
      };
    },
  },
  {
    id: "reward-zero-publications",
    evaluate(ctx) {
      const noPub = ctx.rewardAnalytics.perReward.find((r) => r.claimsCount > 0 && r.publicationsCount === 0);
      if (!noPub) return null;
      return {
        id: this.id,
        category: "reward",
        message: `${noPub.title} est réclamée mais ne génère aucune publication associée.`,
        estimatedGain: 0,
        priority: "medium",
      };
    },
  },
  {
    id: "reward-best-avg-reach-absolute",
    evaluate(ctx) {
      const { best } = ctx.rewardAnalytics.rankedByReach;
      if (!best || best.avgReach <= 0) return null;
      return {
        id: this.id,
        category: "reward",
        message: `${best.title} est la récompense générant le plus de reach en moyenne (${Math.round(best.avgReach)} vues/réclamation).`,
        estimatedGain: 5,
        priority: "low",
      };
    },
  },
  {
    id: "reward-points-too-high-for-reach",
    evaluate(ctx) {
      const expensive = ctx.rewardAnalytics.perReward.find(
        (r) => r.pointsRequired > 150 && r.avgReach < 1000 && r.claimsCount > 0,
      );
      if (!expensive) return null;
      return {
        id: this.id,
        category: "reward",
        message: `${expensive.title} coûte cher en points pour un reach généré limité.`,
        estimatedGain: 10,
        priority: "medium",
      };
    },
  },
  {
    id: "reward-diversify-portfolio",
    evaluate(ctx) {
      const claimedCount = ctx.rewardAnalytics.perReward.filter((r) => r.claimsCount > 0).length;
      if (ctx.rewardAnalytics.perReward.length < 3 || claimedCount > 1) return null;
      return {
        id: this.id,
        category: "reward",
        message: "Une seule récompense concentre toutes les réclamations : diversifier limiterait le risque de saturation.",
        estimatedGain: 6,
        priority: "low",
      };
    },
  },
  {
    id: "reward-low-stock-risk",
    evaluate(ctx) {
      const heavy = ctx.rewardAnalytics.perReward.find((r) => r.claimsCount >= 20);
      if (!heavy) return null;
      return {
        id: this.id,
        category: "reward",
        message: `${heavy.title} approche un volume de réclamations élevé : vérifier le stock disponible.`,
        estimatedGain: 0,
        priority: "medium",
      };
    },
  },
  {
    id: "reward-engagement-leader",
    evaluate(ctx) {
      const top = ctx.rewardAnalytics.perReward.reduce(
        (best, r) => (r.publicationsCount > (best?.publicationsCount || 0) ? r : best),
        null,
      );
      if (!top || top.publicationsCount < 3) return null;
      return {
        id: this.id,
        category: "reward",
        message: `${top.title} génère le plus de publications par client (${top.publicationsCount}).`,
        estimatedGain: 7,
        priority: "low",
      };
    },
  },
  {
    id: "reward-cost-visibility-outlier-high",
    evaluate(ctx) {
      const outlier = ctx.rewardAnalytics.perReward.find((r) => r.costPerThousandReach && r.costPerThousandReach > 500);
      if (!outlier) return null;
      return {
        id: this.id,
        category: "reward",
        message: `${outlier.title} a un coût par 1000 vues très élevé, à reconsidérer.`,
        estimatedGain: 12,
        priority: "high",
      };
    },
  },
  {
    id: "reward-balance-points-required",
    evaluate(ctx) {
      const cheap = ctx.rewardAnalytics.perReward.filter((r) => r.pointsRequired < 50);
      const expensive = ctx.rewardAnalytics.perReward.filter((r) => r.pointsRequired >= 150);
      if (cheap.length === 0 || expensive.length === 0) return null;
      const cheapClaims = cheap.reduce((s, r) => s + r.claimsCount, 0);
      const expensiveClaims = expensive.reduce((s, r) => s + r.claimsCount, 0);
      if (expensiveClaims > 0 || cheapClaims === 0) return null;
      return {
        id: this.id,
        category: "reward",
        message: "Les récompenses à fort coût en points ne sont jamais atteintes : envisager d'abaisser leur seuil.",
        estimatedGain: 9,
        priority: "medium",
      };
    },
  },
  {
    id: "reward-single-platform-bias",
    evaluate(ctx) {
      if (ctx.metrics.tiktoks_count === 0) return null;
      const total = ctx.metrics.stories_count + ctx.metrics.reels_count + ctx.metrics.tiktoks_count;
      if (total === 0) return null;
      const tiktokShare = ctx.metrics.tiktoks_count / total;
      if (tiktokShare < 0.7) return null;
      return {
        id: this.id,
        category: "reward",
        message: "Les publications sont très concentrées sur TikTok : une récompense ciblant Instagram/Reels équilibrerait la diffusion.",
        estimatedGain: 8,
        priority: "low",
      };
    },
  },
  {
    id: "reward-no-redemptions-at-all",
    evaluate(ctx) {
      if (ctx.metrics.rewards_claimed_count > 0) return null;
      return {
        id: this.id,
        category: "reward",
        message: "Aucune récompense n'a été réclamée sur cette soirée : vérifier la visibilité du programme de récompenses.",
        estimatedGain: 0,
        priority: "high",
      };
    },
  },
];
