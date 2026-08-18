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

export const DEFAULT_REWARDS = [
  { key: "cloakroom", title: "Vestiaire offert", pointsRequired: 40, maxRedemptions: 100, category: "acces" },
  { key: "softDrink", title: "Boisson soft ou shot", pointsRequired: 70, maxRedemptions: 50, category: "bar" },
  { key: "premiumDrink", title: "Boisson premium", pointsRequired: 110, maxRedemptions: 30, category: "bar" },
  { key: "fastPass", title: "Coupe-file", pointsRequired: 160, maxRedemptions: 20, category: "acces" },
  { key: "freeEntry", title: "Entrée gratuite", pointsRequired: 240, maxRedemptions: 10, category: "acces" },
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

const fallbackRedemptions = Array.from({ length: 42 }, (_, index) => ({
  id: `demo-redemption-${index + 1}`,
  reward_id: fallbackRewards[index % fallbackRewards.length].id,
  customer_id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  status: index % 5 === 0 ? "used" : "claimed",
  redeemed_at: daysAgo(index % 14),
}));

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
    address: "Avenue Louise 100",
    city: "Brussels",
    category: "club",
    subscription_status: "essai",
    created_at: daysAgo(30),
  },
  submissions: [
    {
      id: "demo-submission-1",
      customer_id: "00000000-0000-4000-8000-000000000001",
      platform: "tiktok",
      content_type: "video",
      url: "https://tiktok.com/@demo/video/1",
      views_count: 12800,
      points_awarded: 320,
      status: "pending",
      submitted_at: daysAgo(1),
    },
    {
      id: "demo-submission-2",
      customer_id: "00000000-0000-4000-8000-000000000002",
      platform: "instagram",
      content_type: "story",
      url: "https://instagram.com/stories/demo/2",
      views_count: 7240,
      points_awarded: 579,
      status: "pending",
      submitted_at: daysAgo(2),
    },
    {
      id: "demo-submission-3",
      customer_id: "00000000-0000-4000-8000-000000000003",
      platform: "youtube",
      content_type: "video",
      url: "https://youtube.com/shorts/demo3",
      views_count: 3910,
      points_awarded: 128,
      status: "rejected",
      submitted_at: daysAgo(3),
    },
    ...Array.from({ length: 123 }, (_, index) => ({
      id: `demo-submission-extra-${index + 1}`,
      customer_id: `00000000-0000-4000-8000-${String(index + 4).padStart(12, "0")}`,
      platform: index % 3 === 0 ? "instagram" : index % 3 === 1 ? "tiktok" : "youtube",
      content_type: index % 4 === 0 ? "story" : index % 4 === 1 ? "reel" : index % 4 === 2 ? "post" : "video",
      url: `https://viralnight.example/content/${index + 4}`,
      views_count: 1200 + index * 47,
      points_awarded: index < 81 ? 55 + (index % 9) * 8 : 0,
      status: index < 81 ? "validated" : index < 98 ? "pending" : "rejected",
      submitted_at: daysAgo((index % 21) + 1),
    })),
  ],
  rewards: fallbackRewards,
  rewardRedemptions: fallbackRedemptions,
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

function isViralNightAdmin(session) {
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

  if (isViralNightAdmin(session) && !ownerEmail) {
    return {
      ...fallbackDashboardData,
      reason: "admin_select_client",
      session,
    };
  }

  if (ownerEmail && !isViralNightAdmin(session)) {
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
