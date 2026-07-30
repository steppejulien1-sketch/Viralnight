// Repond en francais a une question libre sur une soiree.
//
// Ce module n'est PAS un modele de langage : il reconnait l'intention de la question,
// puis construit la reponse a partir des resultats deja calcules par lib/analytics.
// Chaque chiffre affiche vient donc du moteur, jamais d'une generation.
//
// Il sert deux usages :
//   - hors ligne (page de demonstration, artifact) : seule source de reponse ;
//   - en production : socle de la reponse, que la couche LLM peut ensuite reformuler.
//
// Chaque reponse renvoie du texte ET des blocs de visualisation : l'interface les rend
// en graphiques et pourcentages, pour montrer les chiffres au lieu de les enoncer.
// Types de blocs : "stats" (valeurs cles), "bars" (comparaison), "hours" (deux series
// horaires), "deltas" (variations en %), "ranked" (liste ordonnee avec gain).

/** Retire les accents pour que "récompense" et "recompense" se valent. */
function normalize(text) {
  return String(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

const INTENTS = [
  { id: "dj", keywords: ["dj", "mixe", "mix", "platine", "programmation", "resident"] },
  {
    id: "reward",
    keywords: ["recompense", "recompenses", "cadeau", "cadeaux", "reward", "prefere", "preferee", "preferent", "preferees", "shot", "entree", "vestiaire", "boisson", "lot"],
  },
  {
    id: "timing",
    keywords: ["heure", "heures", "quand", "moment", "postent", "poste", "publient", "story", "stories", "bonus", "horaire", "minuit", "pic"],
  },
  {
    id: "improve",
    // "mieux" et "faire" sont volontairement exclus : ce sont des comparatifs courants
    // ("quel DJ marche le mieux"), qui declenchaient a tort une reponse d'amelioration.
    keywords: ["ameliorer", "amelioration", "ameliore", "conseil", "conseils", "probleme", "problemes", "optimiser", "changer", "corriger", "rentable", "rate"],
  },
  { id: "score", keywords: ["note", "score", "noter", "pourquoi", "explique", "calcul", "detail"] },
  { id: "trend", keywords: ["tendance", "evolution", "progresse", "progression", "baisse", "monte", "compare", "comparaison", "avant", "precedente"] },
  { id: "scans", keywords: ["scan", "scans", "qr", "code", "participants", "monde", "affluence"] },
  { id: "reach", keywords: ["vue", "vues", "reach", "visibilite", "portee", "audience"] },
  { id: "customer", keywords: ["client", "clients", "fidele", "fideles", "ambassadeur", "public"] },
  { id: "content", keywords: ["tiktok", "instagram", "reel", "reels", "format", "contenu", "plateforme"] },
];

function detectIntents(question) {
  const wordSet = new Set(normalize(question).split(/[^a-z0-9]+/).filter(Boolean));

  return INTENTS.map((intent) => ({
    id: intent.id,
    score: intent.keywords.reduce((sum, keyword) => sum + (wordSet.has(keyword) ? 1 : 0), 0),
  }))
    .filter((intent) => intent.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((intent) => intent.id);
}

const nf = new Intl.NumberFormat("fr-FR");
const num = (value) => nf.format(Math.round(value));
const hour = (value) => (value === null || value === undefined ? "--" : `${String(value).padStart(2, "0")}h`);
const pct = (value) => `${value > 0 ? "+" : ""}${Math.round(value)} %`;

/** Suggestions proposees a l'utilisateur : ce que le moteur sait reellement traiter. */
export const SUGGESTED_QUESTIONS = [
  "Quel DJ marche le mieux ?",
  "Quelle récompense les gens préfèrent ?",
  "À quelle heure ils postent leurs stories ?",
  "Qu'est-ce que je peux améliorer ?",
  "Pourquoi cette note ?",
  "Est-ce que ça progresse ?",
];

const ANSWERS = {
  dj({ analysis }) {
    const { best, worst, perDj } = analysis.djAnalytics;
    if (!best) {
      return { text: "Aucun DJ n'est renseigné sur les soirées analysées, je ne peux pas les comparer." };
    }

    const current = perDj.find((dj) => dj.djName === analysis.event.dj_name);
    const sentences = [
      `${best.djName} arrive en tête avec ${num(best.avgReach)} vues en moyenne par soirée, mesuré sur ${best.eventsCount} soirée(s).`,
    ];

    // Un ecart de moyenne ne vaut que si l'echantillon tient : on le dit.
    if (best.eventsCount < 3) {
      sentences.push(
        `Attention, ${best.eventsCount} soirée(s) seulement : c'est encore trop peu pour en faire une règle fiable.`,
      );
    }

    if (worst && worst.djName !== best.djName && worst.avgReach > 0) {
      const gap = ((best.avgReach - worst.avgReach) / worst.avgReach) * 100;
      sentences.push(`L'écart avec ${worst.djName} est de ${Math.round(gap)} % (${num(worst.avgReach)} vues en moyenne).`);
    }

    // La regularite : une forte moyenne portee par une seule soiree exceptionnelle
    // n'a pas la meme valeur qu'une performance stable.
    if (best.eventsCount >= 2) {
      const spread = best.bestReach > 0 ? ((best.bestReach - best.worstReach) / best.bestReach) * 100 : 0;
      sentences.push(
        best.reachVariability < 0.25
          ? `Il est régulier : ses soirées vont de ${num(best.worstReach)} à ${num(best.bestReach)} vues, soit un écart contenu.`
          : `Il est en revanche irrégulier : de ${num(best.worstReach)} à ${num(best.bestReach)} vues selon les soirées (${Math.round(spread)} % d'amplitude). Sa moyenne est donc à prendre avec prudence.`,
      );
    }

    // Croisement avec un autre signal : le reach peut venir de l'audience en ligne
    // des clients plutot que de la capacite du DJ a remplir la salle.
    const scanLeader = [...perDj].sort((a, b) => b.avgParticipation - a.avgParticipation)[0];
    if (scanLeader && perDj.length > 1) {
      sentences.push(
        scanLeader.djName === best.djName
          ? `Il fait aussi venir le plus de monde : ${num(best.avgParticipation)} scans QR en moyenne, les deux signaux concordent.`
          : `À noter : c'est ${scanLeader.djName} qui attire le plus de scans QR (${num(scanLeader.avgParticipation)} contre ${num(best.avgParticipation)}). ${best.djName} génère donc plus de vues, mais pas plus d'affluence.`,
      );
    }

    if (current && current.djName !== best.djName) {
      const behind = best.avgReach > 0 ? ((best.avgReach - current.avgReach) / best.avgReach) * 100 : 0;
      sentences.push(
        `La soirée consultée était mixée par ${current.djName}, ${Math.round(behind)} % en dessous de ${best.djName}.`,
      );
    }

    return {
      text: sentences.join(" "),
      blocks: [
        {
          type: "bars",
          title: "Vues moyennes par soirée",
          items: perDj.map((dj) => ({
            label: dj.djName,
            value: dj.avgReach,
            display: `${num(dj.avgReach)} vues`,
            highlight: dj.djName === best.djName,
          })),
        },
      ],
    };
  },

  reward({ analysis }) {
    const { mostPreferred, leastPreferred, rankedByPreference, bestCostVisibility } = analysis.rewardAnalytics;
    if (!mostPreferred || mostPreferred.claimsCount === 0) {
      return { text: "Aucune récompense n'a été réclamée sur cette soirée : il n'y a rien à comparer." };
    }

    const claimed = rankedByPreference.filter((reward) => reward.claimsCount > 0);
    const totalClaims = claimed.reduce((sum, reward) => sum + reward.claimsCount, 0);

    const sentences = [
      `La préférée est ${mostPreferred.title} (${mostPreferred.pointsRequired} points) : ${mostPreferred.claimsCount} réclamations sur ${totalClaims}, soit ${Math.round(mostPreferred.claimShare * 100)} % des choix.`,
    ];

    // Le prix explique souvent la preference : le dire evite d'en tirer une fausse lecon
    // sur l'attrait intrinseque de la recompense.
    const cheapest = [...claimed].sort((a, b) => a.pointsRequired - b.pointsRequired)[0];
    if (cheapest && cheapest.rewardId === mostPreferred.rewardId && claimed.length > 1) {
      sentences.push(
        "C'est aussi la moins chère en points : sa popularité vient donc en partie de son accessibilité, pas seulement de son attrait.",
      );
    }

    // Preference et rentabilite sont deux choses differentes : les distinguer est le
    // coeur de la decision. Le classement de reach n'inclut que les echantillons fiables.
    const reachLeader = analysis.rewardAnalytics.rankedByReach.best;
    if (reachLeader) {
      sentences.push(
        reachLeader.rewardId === mostPreferred.rewardId
          ? `Elle est aussi celle qui génère le plus de vues par réclamation (${num(reachLeader.avgReach)}) : la garder est un choix sûr.`
          : `Mais ce n'est pas la plus rentable : ${reachLeader.title} génère ${num(reachLeader.avgReach)} vues par réclamation contre ${num(mostPreferred.avgReach)}. Les clients préfèrent l'une, l'autre rapporte davantage.`,
      );
    }

    const unreliable = claimed.filter((reward) => !reward.hasEnoughData);
    if (unreliable.length) {
      sentences.push(
        `${unreliable.map((r) => r.title).join(", ")} ${unreliable.length > 1 ? "ont" : "a"} trop peu de réclamations pour être ${unreliable.length > 1 ? "comparées" : "comparée"} de façon fiable : je les exclus du classement de rentabilité.`,
      );
    }

    if (leastPreferred && leastPreferred.claimsCount > 0 && leastPreferred.claimShare < 0.12) {
      sentences.push(
        `${leastPreferred.title} ne capte que ${Math.round(leastPreferred.claimShare * 100)} % des choix pour ${leastPreferred.pointsRequired} points : c'est la première à remplacer.`,
      );
    }

    if (bestCostVisibility && bestCostVisibility.rewardId !== mostPreferred.rewardId) {
      sentences.push(`Le meilleur rapport coût / visibilité reste ${bestCostVisibility.title}.`);
    }

    return {
      text: sentences.join(" "),
      blocks: [
        {
          type: "bars",
          title: "Part des réclamations",
          items: claimed.map((reward) => ({
            label: `${reward.title} · ${reward.pointsRequired} pts`,
            value: reward.claimsCount,
            display: `${reward.claimsCount} fois · ${Math.round(reward.claimShare * 100)} %`,
            highlight: reward.rewardId === mostPreferred.rewardId,
          })),
        },
      ],
    };
  },

  timing({ analysis }) {
    const { publicationPeakHour, scanPeakHour, recommendedBonusHour, heatmap } = analysis.timing;
    const total = heatmap.reduce((sum, bucket) => sum + bucket.publications, 0);

    if (total === 0) return { text: "Aucune publication n'a été enregistrée sur cette soirée." };

    const peak = heatmap.find((bucket) => bucket.hour === publicationPeakHour);
    const share = peak ? Math.round((peak.publications / total) * 100) : 0;

    const sentences = [
      `Le pic de publications est à ${hour(publicationPeakHour)} : ${peak ? peak.publications : 0} publications sur ${total}, soit ${share} % de la soirée.`,
    ];

    // Concentration vs etalement : cela change la strategie (un seul bonus cible,
    // ou plusieurs relances).
    const sorted = [...heatmap].sort((a, b) => b.publications - a.publications);
    const topTwoShare = total > 0 ? ((sorted[0].publications + (sorted[1]?.publications || 0)) / total) * 100 : 0;
    sentences.push(
      topTwoShare >= 60
        ? `L'activité est très concentrée : ${Math.round(topTwoShare)} % des publications tombent sur deux heures seulement (${hour(sorted[0].hour)} et ${hour(sorted[1]?.hour)}). Une seule activation bien placée suffit.`
        : `L'activité est étalée sur la nuit : les deux meilleures heures ne pèsent que ${Math.round(topTwoShare)} % du total. Deux relances valent mieux qu'une seule.`,
    );

    if (scanPeakHour !== null && publicationPeakHour !== null && scanPeakHour !== publicationPeakHour) {
      const lag = publicationPeakHour - scanPeakHour;
      const lagHours = Math.abs(lag < -12 ? lag + 24 : lag);
      sentences.push(
        `Les scans QR culminent à ${hour(scanPeakHour)}, soit ${lagHours} h avant les publications : vos clients s'inscrivent tôt puis publient plus tard dans la nuit.`,
        `Le bonus doit donc se déclencher vers ${hour(recommendedBonusHour)}, juste avant la vague de scans, pour que l'incitation soit connue au moment où ils publient.`,
      );
    } else if (recommendedBonusHour !== null) {
      sentences.push(
        `Scans et publications tombent au même moment : l'incitation doit être annoncée avant, vers ${hour(recommendedBonusHour)}.`,
      );
    }

    // Debut de soiree souvent neglige : c'est un levier concret et peu couteux.
    const early = heatmap.filter((bucket) => [22, 23].includes(bucket.hour));
    const earlyShare = total > 0 ? (early.reduce((sum, b) => sum + b.publications, 0) / total) * 100 : 0;
    if (earlyShare < 15) {
      sentences.push(
        `Le début de soirée est creux : seulement ${Math.round(earlyShare)} % des publications avant minuit. Une incitation dès l'entrée récupérerait ce créneau perdu.`,
      );
    }

    return {
      text: sentences.join(" "),
      blocks: [
        {
          type: "hours",
          title: "Publications et scans par heure",
          peakHour: publicationPeakHour,
          items: heatmap.map((bucket) => ({
            hour: bucket.hour,
            publications: bucket.publications,
            scans: bucket.scans,
          })),
        },
      ],
    };
  },

  improve({ recommendations }) {
    const actions = recommendations
      .filter((rec) => rec.estimatedGain > 0)
      .sort((a, b) => b.estimatedGain - a.estimatedGain)
      .slice(0, 4);

    if (!actions.length) {
      return { text: "Rien de préoccupant sur cette soirée : aucun levier d'amélioration significatif n'est détecté." };
    }

    const totalGain = actions.reduce((sum, action) => sum + action.estimatedGain, 0);

    // Regrouper par domaine indique s'il faut corriger un point precis
    // ou revoir plusieurs leviers a la fois.
    const byCategory = actions.reduce((acc, action) => {
      acc[action.category] = (acc[action.category] || 0) + 1;
      return acc;
    }, {});
    const labels = { reward: "récompenses", dj: "programmation DJ", timing: "horaires", trend: "tendance", customer: "clients" };
    const dominant = Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0];

    const sentences = [
      `${actions.length} leviers ressortent, pour un gain cumulé estimé à +${Math.round(totalGain)} %.`,
      `Le plus rentable : ${actions[0].message}`,
    ];

    if (dominant && dominant[1] > 1) {
      sentences.push(
        `L'essentiel se concentre sur un domaine : ${labels[dominant[0]] || dominant[0]} (${dominant[1]} leviers sur ${actions.length}). C'est là qu'il faut agir en premier.`,
      );
    } else {
      sentences.push("Les leviers sont répartis sur plusieurs domaines : aucun point unique ne débloque la soirée.");
    }

    const urgent = actions.filter((action) => action.priority === "high").length;
    if (urgent) {
      sentences.push(`${urgent} ${urgent > 1 ? "sont prioritaires" : "est prioritaire"} : à traiter avant la prochaine soirée.`);
    }

    return {
      text: sentences.join(" "),
      blocks: [
        {
          type: "ranked",
          title: "Classé par gain estimé",
          items: actions.map((action) => ({
            label: action.message,
            gain: Math.round(action.estimatedGain),
            priority: action.priority,
          })),
        },
      ],
    };
  },

  score({ analysis }) {
    const score = Math.round(analysis.viralScore);
    const breakdown = analysis.scoreBreakdown;

    const parts = [
      { label: "Reach", value: breakdown.reach, max: 30 },
      { label: "Participation", value: breakdown.participation, max: 20 },
      { label: "Taux de réclamation", value: breakdown.claimRate, max: 20 },
      { label: "Diversité de contenu", value: breakdown.contentDiversity, max: 15 },
      { label: "Croissance", value: breakdown.growth, max: 15 },
    ];

    const weakest = [...parts].sort((a, b) => a.value / a.max - b.value / b.max)[0];
    const strongest = [...parts].sort((a, b) => b.value / b.max - a.value / a.max)[0];

    // Le point le plus faible n'est pas forcement celui qui rapporte le plus :
    // c'est le nombre de points manquants qui compte, pas le taux de remplissage.
    const biggestOpportunity = [...parts].sort((a, b) => b.max - b.value - (a.max - a.value))[0];
    const missing = Math.round(biggestOpportunity.max - biggestOpportunity.value);

    const sentences = [
      `La note est de ${score}/100, calculée sur cinq critères pondérés.`,
      `Le point fort est « ${strongest.label} » (${Math.round(strongest.value)}/${strongest.max}), le point faible « ${weakest.label} » (${Math.round(weakest.value)}/${weakest.max}).`,
    ];

    if (missing >= 2) {
      sentences.push(
        `En valeur absolue, c'est « ${biggestOpportunity.label} » qui laisse le plus sur la table : ${missing} points manquants sur ${biggestOpportunity.max}. Agir là ferait bouger la note davantage.`,
      );
    } else {
      sentences.push("Tous les critères sont proches de leur maximum : la marge de progression est faible.");
    }

    return {
      text: sentences.join(" "),
      blocks: [
        {
          type: "bars",
          title: "Détail de la note",
          items: parts.map((part) => ({
            label: part.label,
            // La barre represente le taux de remplissage du critere, pas sa valeur brute :
            // sinon un critere sur 30 paraitrait toujours meilleur qu'un critere sur 15.
            value: (part.value / part.max) * 100,
            display: `${Math.round(part.value)}/${part.max}`,
            highlight: part.label === weakest.label,
          })),
        },
      ],
    };
  },

  trend({ analysis }) {
    const deltas = [
      { label: "Reach", percent: analysis.comparison.vsAverage.total_reach },
      { label: "Scans QR", percent: analysis.comparison.vsAverage.scans_count },
      { label: "Récompenses réclamées", percent: analysis.comparison.vsAverage.rewards_claimed_count },
      { label: "Points distribués", percent: analysis.comparison.vsAverage.points_distributed },
    ];

    const reach = analysis.comparison.vsAverage.total_reach;
    const scans = analysis.comparison.vsAverage.scans_count;
    const direction = reach >= 10 ? "en progression" : reach <= -10 ? "en recul" : "stable";

    const sentences = [`Par rapport à la moyenne de vos dernières soirées, cette soirée est ${direction} : reach ${pct(reach)}.`];

    // Distinguer "plus de monde" de "plus de portee par personne" : les deux causes
    // n'appellent pas les memes decisions.
    if (Math.abs(reach) >= 10) {
      if (Math.abs(scans) >= 10 && Math.sign(scans) === Math.sign(reach)) {
        sentences.push(
          `L'affluence suit le même sens (scans ${pct(scans)}) : la variation vient donc du nombre de personnes présentes, pas de leur audience individuelle.`,
        );
      } else {
        sentences.push(
          `L'affluence, elle, ne bouge quasiment pas (scans ${pct(scans)}) : la variation vient de la portée par personne, pas du remplissage. Le levier est le contenu publié, pas la fréquentation.`,
        );
      }
    }

    const claims = analysis.comparison.vsAverage.rewards_claimed_count;
    if (Math.abs(claims - scans) >= 25) {
      sentences.push(
        claims > scans
          ? "Les réclamations progressent plus vite que les scans : votre programme de récompenses gagne en attractivité auprès des présents."
          : "Les réclamations décrochent par rapport aux scans : des clients scannent sans aller jusqu'à la récompense, il y a une friction dans le parcours.",
      );
    }

    return {
      text: sentences.join(" "),
      blocks: [{ type: "deltas", title: "Écart vs moyenne récente", items: deltas }],
    };
  },

  scans({ analysis }) {
    const { uniqueScanners, scanToPublishRatio, uniquePublishers } = analysis.customerAnalytics;
    const participants = analysis.event.participants_count;
    const coverage = participants > 0 ? (uniqueScanners / participants) * 100 : 0;

    const sentences = [
      `${num(analysis.metrics.scans_count)} scans QR, réalisés par ${num(uniqueScanners)} personnes différentes.`,
    ];

    if (participants > 0) {
      sentences.push(`Cela couvre ${Math.round(coverage)} % des ${num(participants)} participants.`);
    }

    sentences.push(`Parmi ceux qui scannent, ${Math.round(scanToPublishRatio * 100)} % publient ensuite.`);

    return {
      text: sentences.join(" "),
      blocks: [
        {
          type: "stats",
          items: [
            { label: "Scans QR", value: num(analysis.metrics.scans_count) },
            { label: "Personnes distinctes", value: num(uniqueScanners) },
            {
              label: "Couverture des participants",
              value: `${Math.round(coverage)} %`,
              tone: coverage >= 40 ? "good" : coverage >= 25 ? "warn" : "bad",
            },
            {
              label: "Scan → publication",
              value: `${Math.round(scanToPublishRatio * 100)} %`,
              tone: scanToPublishRatio >= 0.5 ? "good" : "warn",
            },
            { label: "Clients qui publient", value: num(uniquePublishers) },
          ],
        },
      ],
    };
  },

  reach({ analysis }) {
    const posts = analysis.metrics.stories_count + analysis.metrics.reels_count + analysis.metrics.tiktoks_count;
    const perPost = posts > 0 ? analysis.metrics.total_reach / posts : 0;
    const delta = analysis.comparison.vsAverage.total_reach;

    return {
      text: `Cette soirée a généré ${num(analysis.metrics.total_reach)} vues à partir de ${num(posts)} publications, soit ${num(perPost)} vues par publication. C'est ${pct(delta)} par rapport à la moyenne de vos dernières soirées.`,
      blocks: [
        {
          type: "stats",
          items: [
            { label: "Vues générées", value: num(analysis.metrics.total_reach) },
            { label: "Publications", value: num(posts) },
            { label: "Vues par publication", value: num(perPost) },
            { label: "vs moyenne récente", value: pct(delta), tone: delta >= 0 ? "good" : "bad" },
          ],
        },
      ],
    };
  },

  customer({ analysis }) {
    const { uniquePublishers, mostViralCustomerReach, loyalCustomersCount } = analysis.customerAnalytics;
    const share = analysis.metrics.total_reach > 0 ? (mostViralCustomerReach / analysis.metrics.total_reach) * 100 : 0;

    const sentences = [`${num(uniquePublishers)} clients différents ont publié cette soirée.`];

    if (mostViralCustomerReach > 0) {
      sentences.push(
        `Le plus viral a généré ${num(mostViralCustomerReach)} vues à lui seul, soit ${Math.round(share)} % du total.`,
      );
    }

    sentences.push(
      loyalCustomersCount > 0
        ? `${loyalCustomersCount} clients sont des habitués (3 soirées récentes ou plus).`
        : "Aucun client récurrent n'est encore détecté.",
    );

    return {
      text: sentences.join(" "),
      blocks: [
        {
          type: "stats",
          items: [
            { label: "Clients qui publient", value: num(uniquePublishers) },
            { label: "Clients fidèles", value: num(loyalCustomersCount) },
            {
              label: "Part du client le plus viral",
              value: `${Math.round(share)} %`,
              tone: share > 50 ? "bad" : "good",
            },
          ],
        },
      ],
    };
  },

  content({ analysis }) {
    const { stories_count, reels_count, tiktoks_count } = analysis.metrics;
    const total = stories_count + reels_count + tiktoks_count;

    if (total === 0) return { text: "Aucune publication sur cette soirée." };

    const formats = [
      { label: "Stories", value: stories_count },
      { label: "Reels", value: reels_count },
      { label: "TikTok", value: tiktoks_count },
    ].sort((a, b) => b.value - a.value);

    return {
      text: `${total} publications, dominées par les ${formats[0].label.toLowerCase()} (${Math.round((formats[0].value / total) * 100)} %). ${
        analysis.scoreBreakdown.contentDiversity < 8
          ? "Le contenu est très concentré sur un seul format : diversifier améliorerait la portée."
          : "La répartition entre formats est équilibrée."
      }`,
      blocks: [
        {
          type: "bars",
          title: "Répartition par format",
          items: formats.map((format) => ({
            label: format.label,
            value: format.value,
            display: `${format.value} · ${Math.round((format.value / total) * 100)} %`,
            highlight: format.label === formats[0].label,
          })),
        },
      ],
    };
  },
};

/**
 * Repond a une question libre sur une soiree.
 *
 * @param {string} question
 * @param {{analysis: object, recommendations: object[]}} context
 * @returns {{text: string, blocks: object[], intents: string[], grounded: boolean}}
 */
export function answerQuestion(question, context) {
  if (!question || !normalize(question).trim()) {
    return {
      text: "Posez-moi une question sur cette soirée : les DJs, les récompenses, les heures de publication, ou ce qu'il faut améliorer.",
      blocks: [],
      intents: [],
      grounded: false,
    };
  }

  const intents = detectIntents(question);

  if (!intents.length) {
    return {
      text: "Je n'ai pas trouvé de quoi répondre précisément. Je sais parler des DJs, des récompenses préférées, des heures de publication, des scans QR, de la note de la soirée, de la tendance et de ce qu'il faut améliorer.",
      blocks: [],
      intents: [],
      grounded: false,
    };
  }

  // Une question peut porter sur deux sujets ("quel DJ et quelle recompense ?") :
  // on repond aux deux intentions les plus fortes, pas seulement a la premiere.
  const answers = intents.slice(0, 2).map((intent) => ANSWERS[intent](context));

  return {
    text: answers.map((answer) => answer.text).join("\n\n"),
    blocks: answers.flatMap((answer) => answer.blocks || []),
    intents: intents.slice(0, 2),
    grounded: true,
  };
}
