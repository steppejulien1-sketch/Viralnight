// Regles clients. Consomment uniquement ctx.customerAnalytics.

import { estimateGain } from "./engine.js";

export const customerRules = [
  {
    id: "customer-most-viral",
    evaluate(ctx) {
      const { mostViralCustomerId, mostViralCustomerReach } = ctx.customerAnalytics;
      if (!mostViralCustomerId || mostViralCustomerReach < 1000) return null;
      return {
        id: this.id,
        category: "customer",
        message: `Un client a généré à lui seul ${mostViralCustomerReach} vues cette soirée : envisager un statut ambassadeur.`,
        estimatedGain: 5,
        priority: "low",
      };
    },
  },
  {
    id: "customer-loyalty-signal",
    evaluate(ctx) {
      if (ctx.customerAnalytics.loyalCustomersCount < 3) return null;
      return {
        id: this.id,
        category: "customer",
        message: `${ctx.customerAnalytics.loyalCustomersCount} clients fidèles (3+ soirées récentes) ont participé : un programme VIP dédié augmenterait leur rétention.`,
        estimatedGain: 6,
        priority: "medium",
      };
    },
  },
  {
    id: "customer-scan-without-publish",
    evaluate(ctx) {
      const { uniqueScanners, uniquePublishers } = ctx.customerAnalytics;
      if (uniqueScanners === 0) return null;
      const gap = (uniqueScanners - uniquePublishers) / uniqueScanners;
      if (gap < 0.5) return null;
      return {
        id: this.id,
        category: "customer",
        message: `${Math.round(gap * 100)}% des clients qui scannent ne publient jamais : simplifier le parcours de publication augmenterait la conversion.`,
        estimatedGain: estimateGain(gap * 100, 0.2),
        priority: "high",
      };
    },
  },
  {
    id: "customer-high-conversion",
    evaluate(ctx) {
      if (ctx.customerAnalytics.scanToPublishRatio < 0.8) return null;
      return {
        id: this.id,
        category: "customer",
        message: "Le taux de conversion scan -> publication est excellent cette soirée.",
        estimatedGain: 0,
        priority: "low",
      };
    },
  },
  {
    id: "customer-no-loyal-customers",
    evaluate(ctx) {
      if (ctx.customerAnalytics.loyalCustomersCount > 0) return null;
      return {
        id: this.id,
        category: "customer",
        message: "Aucun client récurrent détecté sur les dernières soirées : un programme de fidélisation pourrait combler ce manque.",
        estimatedGain: 4,
        priority: "low",
      };
    },
  },
  {
    id: "customer-low-scanner-base",
    evaluate(ctx) {
      if (ctx.customerAnalytics.uniqueScanners >= ctx.event.participants_count * 0.3) return null;
      if (ctx.event.participants_count === 0) return null;
      return {
        id: this.id,
        category: "customer",
        message: "Moins de 30% des participants ont scanné le QR code : renforcer la visibilité du dispositif.",
        estimatedGain: 12,
        priority: "high",
      };
    },
  },
  {
    id: "customer-single-publisher-dominance",
    evaluate(ctx) {
      const { mostViralCustomerReach } = ctx.customerAnalytics;
      if (!mostViralCustomerReach || ctx.metrics.total_reach === 0) return null;
      const share = mostViralCustomerReach / ctx.metrics.total_reach;
      if (share < 0.5) return null;
      return {
        id: this.id,
        category: "customer",
        message: "Un seul client concentre plus de la moitié du reach total : la viralité repose sur trop peu de personnes.",
        estimatedGain: 0,
        priority: "medium",
      };
    },
  },
  {
    id: "customer-broad-publisher-base",
    evaluate(ctx) {
      if (ctx.customerAnalytics.uniquePublishers < 20) return null;
      return {
        id: this.id,
        category: "customer",
        message: `${ctx.customerAnalytics.uniquePublishers} clients différents ont publié cette soirée : bonne diversification de la source de viralité.`,
        estimatedGain: 0,
        priority: "low",
      };
    },
  },
];
