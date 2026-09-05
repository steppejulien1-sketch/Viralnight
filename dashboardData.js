export const DEFAULT_POINT_RULES = {
  validatedPublication: 0,
  videoViewsPerThousand: 25,
  validatedStory: 0,
  storyViewsPerThousand: 80,
  viralBonus: 90,
  clubMention: 0,
  qrCheckin: 15,
  monthlyAmbassador: 350,
};

/* Le catalogue de DEMONSTRATION. Julien, 05/09/2026 : "retire accès VIP,
   boisson soft, boisson premium, et mets juste un truc pour qu'on puisse
   ajouter les récompenses".

   ⚠️ Ce n'etait deja plus ce qu'un vrai club recoit. api/create-client.js
   pose Vestiaire / Shot / Pinte / Cocktail depuis le 03/09 -- ces quatre
   la ont un dessin, les autres non, d'ou les tuiles au pictogramme gris.
   Cette liste-ci etait restee sur l'ancienne, et c'est elle que la demo
   affiche. Les deux sources avaient diverge ; elles disent maintenant la
   meme chose.

   Si l'une des deux bouge, l'autre doit bouger : un gerant qui a vu la
   demo avant de creer son club doit retrouver sa boutique. */
export const DEFAULT_REWARDS = [
  { key: "cloakroom", title: "Vestiaire offert", pointsRequired: 40, maxRedemptions: 100, category: "acces" },
  { key: "shot", title: "Shot offert", pointsRequired: 60, maxRedemptions: 100, category: "bar" },
  { key: "pint", title: "Pinte offerte", pointsRequired: 90, maxRedemptions: 50, category: "bar" },
  { key: "cocktail", title: "Cocktail offert", pointsRequired: 130, maxRedemptions: 25, category: "bar" },
];

const now = new Date();
const ADMIN_EMAIL = "viralnight001@gmail.com";

const daysAgo = (days) => {
  const date = new Date(now);
  date.setDate(date.getDate() - days);
  return date.toISOString();
};

const fallbackRewards = DEFAULT_REWARDS.map(({ title, pointsRequired, maxRedemptions, category }, index) => ({
  id: `demo-reward-${index + 1}`,
  title,
  points_required: pointsRequired,
  max_redemptions: maxRedemptions,
  category,
  active: true,
  created_at: daysAgo(index + 1),
}));

/* ==========================================================
   LE CLUB DE DEMONSTRATION
   ==========================================================

   Julien, 06/09/2026 : "montre un peu ce que ca donnerait, mettre la
   data un peu pour voir les dashboards, ce que ca donnerait, si c'est
   beau".

   La demo montrait 21 jours d'activite REGULIERE et pas un seul scan.
   Trois consequences, toutes visibles a l'ecran :

   · le tableau de bord sur 30 jours ou 3 mois comparait a une periode
     vide -- "nouveau" ecrit dans les quatre cases ;
   · la courbe etait un PLATEAU, la seule forme qu'aucun club n'a jamais
     eue ;
   · "Scans QR : 0 / Aucun scan", alors que c'est le premier chiffre que
     regarde un gerant : est-ce que l'affiche collee au mur sert ?

   Ce club-ci ouvre le VENDREDI ET LE SAMEDI (le meme defaut que
   establishment_schedule.opening_weekdays, '{5,6}'), il grandit sur six
   mois, et il a des creux. C'est ce qui fait qu'un graphe ressemble a
   une soiree plutot qu'a un remplissage de tableur.

   ⚠️ SUITE DETERMINISTE, jamais Math.random : deux chargements de suite
   doivent donner exactement le meme graphe. Des chiffres qui bougent a
   chaque F5 ne se lisent pas comme une demo, ils se lisent comme un bug.
   ⚠️ Et ca reste une DEMO : le garde-fou du haut de ce fichier tient
   toujours -- des qu'un club est connecte, c'est le vide honnete. */

const DEMO_JOURS = 182;

// Bruit reproductible dans [0,1[. La partie fractionnaire d'un sinus
// mis a l'echelle : sans dependance, sans etat, et stable d'un
// navigateur a l'autre.
const bruit = (n) => {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/* Combien de contenus deposes il y a `recul` jours.
   Vendredi et samedi portent la soiree ; le jeudi en garde un peu ; le
   reste de la semaine vit sur la trainee des publications tardives. */
function volumeDuJour(recul) {
  const d = new Date(now);
  d.setDate(d.getDate() - recul);
  const jour = d.getDay(); // 0 dimanche ... 6 samedi

  const socle = jour === 5 || jour === 6 ? 7 : jour === 4 ? 3 : jour === 0 ? 2 : 1;
  // Le club grandit : deux fois moins d'activite il y a six mois
  // qu'aujourd'hui. C'est ce qui donne son sens a la comparaison de
  // periodes -- sans progression, tous les deltas valent zero.
  const croissance = 0.5 + 0.5 * (1 - recul / DEMO_JOURS);
  // Une soiree sur douze tombe a l'eau (meteo, concurrence, rien).
  const creux = bruit(recul * 3.1) < 0.08 ? 0.15 : 1;
  return Math.round(socle * croissance * creux * (0.7 + 0.7 * bruit(recul)));
}

// L'horaire d'une publication : la nuit du club, pas 9 h du matin.
function heureDeNuit(recul, i) {
  const d = new Date(now);
  d.setDate(d.getDate() - recul);
  d.setHours(22 + Math.floor(bruit(recul * 7 + i) * 6), Math.floor(bruit(recul + i * 3) * 60), 0, 0);
  // setHours(24..27) bascule au lendemain, et c'est voulu : une soiree
  // du samedi finit le dimanche matin (meme regle que lib/scheduling).
  // Mais rien ne doit tomber dans le futur -- une demo datee de demain
  // sortirait de toutes les fenetres et laisserait un trou a droite du
  // graphe. On recule alors d'une semaine, meme jour, meme heure.
  while (d > now) d.setDate(d.getDate() - 7);
  return d.toISOString();
}

/* Un vivier de clients qui REVIENNENT. Tirer un identifiant neuf a
   chaque publication ferait autant de membres que de contenus : le
   chiffre "Membres" ne voudrait plus rien dire, et c'est justement
   celui qui separe un club qui fidelise d'un club qui defile. */
const DEMO_CLIENTS = 210;
const clientDemo = (n) =>
  `00000000-0000-4000-8000-${String((n % DEMO_CLIENTS) + 1).padStart(12, "0")}`;

const PLATEFORMES = ["instagram", "instagram", "tiktok", "instagram", "youtube", "tiktok"];
const FORMATS = ["story", "reel", "story", "post", "video", "story"];

const fallbackSubmissions = (() => {
  const out = [];
  let n = 0;
  for (let recul = DEMO_JOURS; recul >= 1; recul--) {
    const combien = volumeDuJour(recul);
    for (let i = 0; i < combien; i++) {
      n++;
      const alea = bruit(n * 1.7);
      // Une story fait 800 a 9 000 vues, un Reel qui prend fait beaucoup
      // plus. L'echelle est logarithmique, pas lineaire : c'est ce qui
      // donne les pics qu'un club reconnait.
      const vues = Math.round(700 + Math.pow(alea, 3) * 42000 + bruit(n) * 2600);
      /* Les contenus recents sont encore en file d'attente ; les vieux
         ont tous ete tries. Un club qui aurait 20 % de "en attente"
         datant de trois mois aurait surtout un probleme de moderation. */
      const statut = recul < 3 && alea > 0.55 ? "pending" : alea > 0.93 ? "rejected" : "validated";
      out.push({
        id: `demo-submission-${n}`,
        customer_id: clientDemo(Math.floor(bruit(n * 4.3) * DEMO_CLIENTS)),
        platform: PLATEFORMES[n % PLATEFORMES.length],
        content_type: FORMATS[n % FORMATS.length],
        url: `https://viralnight.example/contenu/${n}`,
        views_count: vues,
        // 15 pts pour 1 000 vues, le bareme par defaut du produit.
        points_awarded: statut === "validated" ? Math.max(10, Math.round((vues / 1000) * 15)) : 0,
        status: statut,
        submitted_at: heureDeNuit(recul, i),
      });
    }
  }
  return out;
})();

/* Les scans du QR colle au mur. Toujours PLUS nombreux que les
   publications -- on scanne pour regarder ses points, on ne publie pas
   a chaque fois. Le rapport de l'un a l'autre est d'ailleurs le vrai
   sujet du gerant : combien de scans finissent en story. */
const fallbackScans = (() => {
  const out = [];
  let n = 0;
  for (let recul = DEMO_JOURS; recul >= 1; recul--) {
    const combien = Math.round(volumeDuJour(recul) * (2.4 + bruit(recul * 5) * 1.6));
    for (let i = 0; i < combien; i++) {
      n++;
      out.push({
        id: `demo-scan-${n}`,
        customer_id: clientDemo(Math.floor(bruit(n * 2.9) * DEMO_CLIENTS)),
        scanned_at: heureDeNuit(recul, i + 40),
      });
    }
  }
  return out;
})();

/* Un bon s'echange AU BAR, donc un soir d'ouverture : les caler sur le
   meme rythme que les publications, plutot que sur "un par jour",
   evite la ligne parfaitement plate que Julien voyait dans la case
   Recompenses. */
const fallbackRedemptions = (() => {
  const out = [];
  let n = 0;
  for (let recul = DEMO_JOURS; recul >= 1; recul--) {
    const combien = Math.round(volumeDuJour(recul) * 0.55 * bruit(recul * 1.3 + 2));
    for (let i = 0; i < combien; i++) {
      n++;
      out.push({
        id: `demo-redemption-${n}`,
        reward_id: fallbackRewards[n % fallbackRewards.length].id,
        customer_id: clientDemo(Math.floor(bruit(n * 6.1) * DEMO_CLIENTS)),
        status: n % 5 === 0 ? "used" : "claimed",
        redeemed_at: heureDeNuit(recul, i + 80),
      });
    }
  }
  return out;
})();

/**
 * Jeu de donnees VIDE, pour les cas ou l'on sait qu'on n'a rien a montrer.
 *
 * ⚠️ A ne pas confondre avec `fallbackDashboardData`, qui est une DEMO :
 * un club nomme, 249 480 vues, 81 contenus. Servir cette demo a un gerant
 * connecte, sous un titre qui promet « Chiffres mesures sur vos contenus
 * valides. Rien n'est estime. », revient a lui montrer les chiffres d'un
 * autre club en les presentant comme les siens.
 * La demo reste legitime hors session (page publique, dev sans .env) ;
 * des qu'il y a un compte, c'est le vide honnete qui s'affiche.
 */
export const emptyDashboardData = {
  source: "empty",
  reason: "empty",
  pointRules: { ...DEFAULT_POINT_RULES },
  pointRuleItems: [],
  establishment: null,
  submissions: [],
  rewards: [],
  rewardRedemptions: [],
  qrScans: [],
};

export const fallbackDashboardData = {
  source: "demo",
  reason: "demo",
  pointRules: {
    ...DEFAULT_POINT_RULES,
  },
  pointRuleItems: [],
  establishment: {
    id: "demo-establishment",
    name: "Mirage Club Brussels",
    // Code public de DEMO : sert a montrer l'onglet QR de club-app.html
    // hors session. Il ne resout aucun etablissement reel -- l'ecran
    // l'annonce d'ailleurs comme un exemple, pour que personne ne
    // l'imprime en croyant que c'est le sien.
    public_code: "DEMO2026",
    address: "Avenue Louise 100",
    city: "Brussels",
    category: "club",
    subscription_status: "essai",
    // Six mois d'historique : le club ne peut pas etre plus jeune que
    // ses propres donnees.
    created_at: daysAgo(DEMO_JOURS + 20),
  },
  submissions: fallbackSubmissions,
  rewards: fallbackRewards,
  rewardRedemptions: fallbackRedemptions,
  // Sans cette ligne, `ETAT.data.qrScans` valait undefined et le tableau
  // de bord affichait "Scans QR : 0 / Aucun scan" -- dans une DEMO.
  qrScans: fallbackScans,
};

function normalizePointRules(row) {
  if (!row) return { ...DEFAULT_POINT_RULES };

  return {
    validatedPublication: 0,
    videoViewsPerThousand: Number(row.video_views_per_thousand ?? DEFAULT_POINT_RULES.videoViewsPerThousand),
    validatedStory: 0,
    storyViewsPerThousand: Number(row.story_views_per_thousand ?? DEFAULT_POINT_RULES.storyViewsPerThousand),
    viralBonus: Number(row.viral_bonus ?? DEFAULT_POINT_RULES.viralBonus),
    clubMention: 0,
    qrCheckin: Number(row.qr_checkin ?? DEFAULT_POINT_RULES.qrCheckin),
    monthlyAmbassador: Number(row.monthly_ambassador ?? DEFAULT_POINT_RULES.monthlyAmbassador),
  };
}

function isNoctifyAdmin(session) {
  return String(session?.user?.email || "").toLowerCase() === ADMIN_EMAIL;
}

export async function fetchDashboardData(supabase, isSupabaseConfigured, options = {}) {
  const ownerEmail = String(options.ownerEmail || "").trim().toLowerCase();

  if (!isSupabaseConfigured || !supabase) {
    return {
      ...fallbackDashboardData,
      reason: "missing_env",
      session: null,
    };
  }

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session) {
    return {
      ...fallbackDashboardData,
      reason: "signed_out",
      session: null,
    };
  }

  if (isNoctifyAdmin(session) && !ownerEmail) {
    return {
      ...fallbackDashboardData,
      reason: "admin_select_client",
      session,
    };
  }

  if (ownerEmail && !isNoctifyAdmin(session)) {
    return {
      ...fallbackDashboardData,
      reason: "admin_required",
      session,
    };
  }

  let establishmentId = "";

  // ⚠️ UN GERANT DOIT ETRE RATTACHE A SON CLUB PAR SON COMPTE, comme le
  // fait lib/auth/requireEstablishment.js cote serveur
  // (`establishment_owners.id` REFERENCE `auth.users.id`).
  //
  // Avant, `establishmentId` restait VIDE pour tout gerant normal, et la
  // requete partait alors sans aucun filtre :
  //     supabase.from("establishments").select("*").single()
  // c'est-a-dire « rends-moi l'etablissement », en comptant uniquement
  // sur la RLS pour qu'il n'y en ait qu'un. Deux consequences :
  //   - aujourd'hui la RLS n'en rend aucun -> `.single()` repond 406,
  //     on tombait en repli et le tableau de bord affichait un club et
  //     des chiffres qui n'existent pas ;
  //   - le jour ou une policy deviendrait plus large, `.single()` ne
  //     protegerait rien du tout.
  // Le filtre doit venir du compte, pas de la chance.
  if (!ownerEmail) {
    const lien = await supabase
      .from("establishment_owners")
      .select("establishment_id")
      .eq("id", session.user.id)
      .maybeSingle();

    if (lien.error || !lien.data?.establishment_id) {
      return {
        ...emptyDashboardData,
        reason: "no_establishment",
        session,
        error: lien.error?.message || null,
      };
    }

    establishmentId = lien.data.establishment_id;
  }

  if (ownerEmail) {
    const ownerResult = await supabase
      .from("establishment_owners")
      .select("email, establishment_id")
      .ilike("email", ownerEmail)
      .maybeSingle();

    if (ownerResult.error || !ownerResult.data?.establishment_id) {
      return {
        ...fallbackDashboardData,
        reason: "client_not_found",
        session,
        error: ownerResult.error?.message || ownerEmail,
      };
    }

    establishmentId = ownerResult.data.establishment_id;
  }

  const byEstablishment = (query) => (establishmentId ? query.eq("establishment_id", establishmentId) : query);
  const establishmentQuery = establishmentId
    ? supabase.from("establishments").select("*").eq("id", establishmentId).single()
    : supabase.from("establishments").select("*").single();

  const [establishmentResult, pointRulesResult, customRulesResult, submissionsResult, rewardsResult] = await Promise.all([
    establishmentQuery,
    byEstablishment(supabase.from("establishment_point_rules").select("*")).maybeSingle(),
    byEstablishment(supabase.from("establishment_point_rule_items").select("*")).eq("active", true).order("created_at", { ascending: true }),
    byEstablishment(supabase.from("submissions").select("*")).order("submitted_at", { ascending: false }),
    byEstablishment(supabase.from("rewards").select("*")).order("points_required", { ascending: true }),
  ]);

  const rewardIds = (rewardsResult.data || []).map((reward) => reward.id).filter(Boolean);

  // Les scans QR sont desormais collectes reellement : on les lit au lieu de les estimer.
  const qrScansResult = establishmentId
    ? await supabase.from("qr_scans").select("id, customer_id, scanned_at").eq("establishment_id", establishmentId)
    : { data: [], error: null };
  const redemptionsResult =
    rewardIds.length > 0
      ? await supabase.from("reward_redemptions").select("*").in("reward_id", rewardIds).order("redeemed_at", { ascending: false })
      : { data: [], error: null };

  const firstError =
    establishmentResult.error ||
    pointRulesResult.error ||
    submissionsResult.error ||
    rewardsResult.error ||
    redemptionsResult.error;

  if (firstError) {
    // ⚠️ Vide, pas demo : la session existe, donc afficher les chiffres
    // d'un club de demonstration ferait passer une panne pour des
    // resultats. Mieux vaut un ecran vide qui dit qu'il y a un probleme.
    console.warn("Supabase dashboard, lecture en echec :", firstError.message);
    return {
      ...emptyDashboardData,
      reason: "query_error",
      session,
      error: firstError.message,
    };
  }

  return {
    source: "supabase",
    reason: ownerEmail ? "admin_client" : "connected",
    session,
    selectedOwnerEmail: ownerEmail,
    establishment: establishmentResult.data,
    pointRules: normalizePointRules(pointRulesResult.data),
    pointRuleItems: customRulesResult.error ? [] : customRulesResult.data || [],
    submissions: submissionsResult.data || [],
    rewards: rewardsResult.data || [],
    rewardRedemptions: redemptionsResult.data || [],
    qrScans: qrScansResult.error ? [] : qrScansResult.data || [],
  };
}
