// Jeu de donnees de demonstration pour tester Viral Intelligence sans Supabase.
//
// Les donnees sont generees de facon deterministe (PRNG a graine fixe) pour que la demo
// affiche toujours les memes chiffres : sans cela, impossible de verifier qu'une
// recommandation est correcte ou de comparer deux chargements.
//
// Les timestamps sont volontairement produits en heure LOCALE (sans suffixe Z), car
// lib/analytics/timeAnalytics.js lit les heures locales pour construire la heatmap.

const REWARDS = [
  { id: "rw-vestiaire", title: "Vestiaire offert", points_required: 40 },
  { id: "rw-shot", title: "Shot offert", points_required: 70 },
  { id: "rw-premium", title: "Boisson premium", points_required: 110 },
  { id: "rw-entree", title: "Entree gratuite", points_required: 240 },
];

// DJ Martin surperforme DJ Alex, mais avec un ecart plausible pour un vrai club
// (~+60% de reach moyen) : un ecart de x4 rendrait la demo peu credible.
const DJ_PROFILES = {
  "DJ Martin": { reachPerPost: 3900, postRate: 0.2, scanRate: 0.62 },
  "DJ Alex": { reachPerPost: 2600, postRate: 0.15, scanRate: 0.5 },
};

/** PRNG deterministe (mulberry32) : meme graine = memes donnees. */
function createRandom(seed) {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function isoDate(date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/**
 * Construit un timestamp local a partir d'une date de soiree et d'une heure de nuit.
 * Une heure < 6 appartient au lendemain civil, comme dans la realite.
 */
function nightTimestamp(eventDate, hour, minute) {
  const [year, month, day] = eventDate.split("-").map(Number);
  const base = new Date(Date.UTC(year, month - 1, day));
  if (hour < 6) base.setUTCDate(base.getUTCDate() + 1);
  return `${isoDate(base)}T${pad(hour)}:${pad(minute)}:00`;
}

/**
 * Tire une heure de nuit selon une distribution realiste :
 * montee a partir de 22h, pic vers minuit, decroissance jusqu'a 4h.
 */
function drawNightHour(random) {
  const weights = [
    [22, 8],
    [23, 16],
    [0, 24],
    [1, 18],
    [2, 10],
    [3, 5],
    [4, 2],
  ];
  const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
  let threshold = random() * total;

  for (const [hour, weight] of weights) {
    threshold -= weight;
    if (threshold <= 0) return hour;
  }
  return 0;
}

function buildEventDates(count, lastEventDate) {
  // Vendredis et samedis consecutifs, en remontant depuis la derniere soiree.
  const dates = [];
  const cursor = new Date(`${lastEventDate}T00:00:00Z`);

  while (dates.length < count) {
    const weekday = cursor.getUTCDay();
    if (weekday === 5 || weekday === 6) dates.push(isoDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  return dates.reverse();
}

/**
 * Genere un etablissement complet avec son historique de soirees.
 * @param {object} [options]
 * @param {number} [options.seed]
 * @param {number} [options.eventCount]
 * @param {string} [options.lastEventDate]
 */
export function buildDemoDataset({ seed = 20260731, eventCount = 8, lastEventDate = "2026-07-25" } = {}) {
  const random = createRandom(seed);
  const establishmentId = "demo-establishment";
  const eventDates = buildEventDates(eventCount, lastEventDate);

  const events = [];
  const submissions = [];
  const qrScans = [];
  const redemptions = [];

  eventDates.forEach((eventDate, index) => {
    const eventId = `evt-${index + 1}`;
    const djName = index % 2 === 0 ? "DJ Alex" : "DJ Martin";
    const profile = DJ_PROFILES[djName];

    // Croissance progressive de l'affluence sur la periode, avec du bruit.
    const growth = 1 + index * 0.06;
    const participants = Math.round((180 + random() * 90) * growth);

    events.push({
      id: eventId,
      establishment_id: establishmentId,
      name: `Soiree du ${eventDate.split("-").reverse().join("/")}`,
      event_date: eventDate,
      dj_name: djName,
      participants_count: participants,
    });

    const scanCount = Math.round(participants * profile.scanRate * (0.9 + random() * 0.2));
    const postCount = Math.round(participants * profile.postRate * (0.85 + random() * 0.3));

    // Pool de clients distincts : la plupart des scanneurs sont des personnes differentes,
    // une minorite scanne deux fois. Un pool trop petit ferait croire a tort que peu de
    // participants ont scanne.
    const scannerPoolSize = Math.max(1, Math.round(scanCount * 0.88));
    const scannerIds = Array.from({ length: scannerPoolSize }, (_, i) => `cust-${index}-${i}`);

    for (let i = 0; i < scanCount; i += 1) {
      qrScans.push({
        id: `${eventId}-scan-${i}`,
        event_id: eventId,
        customer_id: scannerIds[Math.floor(random() * scannerPoolSize)],
        scanned_at: nightTimestamp(eventDate, drawNightHour(random), Math.floor(random() * 60)),
      });
    }

    // Les publications viennent de clients qui ont scanne : c'est le parcours reel
    // (scan du QR, puis publication pour gagner des points).
    for (let i = 0; i < postCount; i += 1) {
      const roll = random();
      const platform = roll < 0.45 ? "tiktok" : roll < 0.8 ? "instagram" : "youtube";
      const contentType = platform === "tiktok" ? "video" : roll < 0.62 ? "story" : "reel";
      const views = Math.round(profile.reachPerPost * (0.35 + random() * 1.5));

      submissions.push({
        id: `${eventId}-sub-${i}`,
        establishment_id: establishmentId,
        event_id: eventId,
        customer_id: scannerIds[Math.floor(random() * scannerPoolSize)],
        platform,
        content_type: contentType,
        url: `https://example.com/${eventId}/${i}`,
        views_count: views,
        points_awarded: Math.round(views / 1000) * 25,
        status: "validated",
        submitted_at: nightTimestamp(eventDate, drawNightHour(random), Math.floor(random() * 60)),
      });
    }

    // Les recompenses accessibles sont plus souvent reclamees que les coûteuses.
    REWARDS.forEach((reward) => {
      const appeal = reward.points_required <= 70 ? 0.16 : reward.points_required <= 110 ? 0.08 : 0.035;
      const claims = Math.round(scanCount * appeal * (0.7 + random() * 0.6));

      for (let i = 0; i < claims; i += 1) {
        redemptions.push({
          id: `${eventId}-${reward.id}-${i}`,
          reward_id: reward.id,
          event_id: eventId,
          customer_id: scannerIds[Math.floor(random() * scannerPoolSize)],
          redeemed_at: nightTimestamp(eventDate, drawNightHour(random), Math.floor(random() * 60)),
          status: "claimed",
        });
      }
    });
  });

  return { establishmentId, events, rewards: REWARDS, submissions, qrScans, redemptions };
}

/** Metriques agregees d'une soiree, identiques a computeRawMetrics cote serveur. */
export function computeMetricsForEvent(eventId, { submissions, redemptions, qrScans }) {
  const eventSubmissions = submissions.filter((s) => s.event_id === eventId);

  return {
    total_reach: eventSubmissions.reduce((sum, s) => sum + s.views_count, 0),
    stories_count: eventSubmissions.filter((s) => s.content_type === "story").length,
    reels_count: eventSubmissions.filter((s) => s.content_type === "reel").length,
    tiktoks_count: eventSubmissions.filter((s) => s.platform === "tiktok").length,
    points_distributed: eventSubmissions.reduce((sum, s) => sum + s.points_awarded, 0),
    rewards_claimed_count: redemptions.filter((r) => r.event_id === eventId).length,
    scans_count: qrScans.filter((s) => s.event_id === eventId).length,
  };
}

/** event_metrics indexees par event_id, comme la table Supabase du meme nom. */
export function buildMetricsMap(dataset) {
  return new Map(dataset.events.map((event) => [event.id, computeMetricsForEvent(event.id, dataset)]));
}
