export const DEFAULT_POINT_RULES = {
  validatedPublication: 0,
  videoViewsPerThousand: 25,
  validatedStory: 0,
  storyViewsPerThousand: 80,
  viralBonus: 90,
  clubMention: 20,
  qrCheckin: 15,
  monthlyAmbassador: 350,
};

export const DEFAULT_REWARDS = [
  { key: "cloakroom", title: "Vestiaire offert", pointsRequired: 40 },
  { key: "softDrink", title: "Boisson soft ou shot", pointsRequired: 70 },
  { key: "premiumDrink", title: "Boisson premium", pointsRequired: 110 },
  { key: "fastPass", title: "Coupe-file", pointsRequired: 160 },
  { key: "freeEntry", title: "Entree gratuite", pointsRequired: 240 },
  { key: "guestPass", title: "Bracelet +1 invite", pointsRequired: 330 },
  { key: "tableUpgrade", title: "Surclassement table", pointsRequired: 500 },
  { key: "vipAccess", title: "Acces VIP / backroom", pointsRequired: 700 },
];

const now = new Date();

const daysAgo = (days) => {
  const date = new Date(now);
  date.setDate(date.getDate() - days);
  return date.toISOString();
};

const fallbackRewards = DEFAULT_REWARDS.map(({ title, pointsRequired }, index) => ({
  id: `demo-reward-${index + 1}`,
  title,
  points_required: pointsRequired,
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

export const fallbackDashboardData = {
  source: "demo",
  reason: "demo",
  pointRules: {
    ...DEFAULT_POINT_RULES,
  },
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
    clubMention: Number(row.club_mention ?? DEFAULT_POINT_RULES.clubMention),
    qrCheckin: Number(row.qr_checkin ?? DEFAULT_POINT_RULES.qrCheckin),
    monthlyAmbassador: Number(row.monthly_ambassador ?? DEFAULT_POINT_RULES.monthlyAmbassador),
  };
}

export async function fetchDashboardData(supabase, isSupabaseConfigured) {
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

  const [establishmentResult, pointRulesResult, submissionsResult, rewardsResult, redemptionsResult] = await Promise.all([
    supabase.from("establishments").select("*").single(),
    supabase.from("establishment_point_rules").select("*").maybeSingle(),
    supabase.from("submissions").select("*").order("submitted_at", { ascending: false }),
    supabase.from("rewards").select("*").order("points_required", { ascending: true }),
    supabase.from("reward_redemptions").select("*").order("redeemed_at", { ascending: false }),
  ]);

  const firstError =
    establishmentResult.error ||
    pointRulesResult.error ||
    submissionsResult.error ||
    rewardsResult.error ||
    redemptionsResult.error;

  if (firstError) {
    console.warn("Supabase dashboard fallback:", firstError.message);
    return {
      ...fallbackDashboardData,
      reason: "query_error",
      session,
      error: firstError.message,
    };
  }

  return {
    source: "supabase",
    reason: "connected",
    session,
    establishment: establishmentResult.data,
    pointRules: normalizePointRules(pointRulesResult.data),
    submissions: submissionsResult.data || [],
    rewards: rewardsResult.data || [],
    rewardRedemptions: redemptionsResult.data || [],
  };
}
