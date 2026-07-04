import { DEFAULT_POINT_RULES, fallbackDashboardData, fetchDashboardData } from "./dashboardData.js";
import { isSupabaseConfigured, supabase } from "./supabaseClient.js";

const navLinks = document.querySelectorAll("[data-view-link]");
const views = document.querySelectorAll("[data-view]");
const jumpButtons = document.querySelectorAll("[data-jump]");
const ruleInputs = document.querySelectorAll("[data-rule-points]");
const dataStatus = document.querySelector("[data-data-status]");
const authForm = document.querySelector("[data-auth-form]");
const passwordResetButton = document.querySelector("[data-password-reset]");
const passwordUpdateForm = document.querySelector("[data-password-update]");
const signOutButton = document.querySelector("[data-sign-out]");
const rewardEditor = document.querySelector("[data-reward-editor]");
const rewardPreview = document.querySelector("[data-reward-preview]");
const totalRulePoints = document.querySelector("[data-total-rule-points]");
const checkinStats = document.querySelector("[data-checkin-stats]");
const addRewardButton = document.querySelector("[data-add-reward]");
const customRuleEditor = document.querySelector("[data-custom-rule-editor]");
const addPointRuleButton = document.querySelector("[data-add-point-rule]");
const dashboardContent = document.querySelectorAll("[data-dashboard-content]");
const lockedDashboard = document.querySelector("[data-dashboard-locked]");
const lockedTitle = document.querySelector("[data-locked-title]");
const lockedMessage = document.querySelector("[data-locked-message]");
const INITIAL_REWARD_COUNT = 5;
const LOCAL_REWARD_PREFIX = "local-reward-";
const LOCAL_POINT_RULE_PREFIX = "local-point-rule-";

const numberFormatter = new Intl.NumberFormat("fr-FR");
const currencyFormatter = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});

let dashboardState = {
  ...fallbackDashboardData,
};
let localAddedRewards = [];
let localAddedPointRules = [];
let selectedClientEmail = new URLSearchParams(window.location.search).get("client_email")?.trim().toLowerCase() || "";

function getPointRules(data = dashboardState) {
  return {
    ...DEFAULT_POINT_RULES,
    ...(data.pointRules || {}),
  };
}

function activateView(viewId) {
  navLinks.forEach((link) => link.classList.toggle("is-active", link.dataset.viewLink === viewId));
  history.replaceState(null, "", `#${viewId}`);
  const target = document.querySelector(`[data-view="${viewId}"]`);
  target?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function formatPoints(value) {
  return `${numberFormatter.format(Math.round(value || 0))} pts`;
}

function formatNumber(value) {
  return numberFormatter.format(Math.round(value || 0));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setDataStatus(message, state = "warning") {
  if (!dataStatus) return;
  dataStatus.textContent = message;
  dataStatus.dataset.state = state;
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
}

function updateMetric(name, value, caption) {
  const metric = document.querySelector(`[data-metric="${name}"]`);
  if (!metric) return;
  metric.textContent = value;
  const note = metric.closest(".metric-card")?.querySelector("small");
  if (note && caption) note.textContent = caption;
}

function updateTaskButton(button, label, text) {
  if (!button) return;
  button.innerHTML = `<span>${escapeHtml(label)}</span>${escapeHtml(text)}`;
}

function updateAuthUi(session) {
  const isConnected = Boolean(session);
  if (authForm) authForm.hidden = isConnected;
  if (signOutButton) signOutButton.hidden = !isConnected;
}

function hasDashboardAccess(data) {
  if (data.source !== "supabase") return false;
  if (data.reason === "admin_client") return true;
  return data.establishment?.subscription_status === "actif";
}

function getLockedCopy(data) {
  if (!data.session) {
    return {
      title: "Dashboard réservé aux clients actifs.",
      message: "Connectez-vous avec l'email du club pour vérifier l'accès.",
    };
  }

  if (data.reason === "admin_select_client") {
    return {
      title: "Sélectionne un client depuis l'admin.",
      message: "Ajoute l'email du client dans l'URL ou ouvre son dashboard depuis l'espace admin.",
    };
  }

  const status = data.establishment?.subscription_status || "essai";

  if (status === "suspendu") {
    return {
      title: "Accès suspendu.",
      message: "Ce dashboard est désactivé. Contacte ViralNight pour réactiver l'établissement.",
    };
  }

  return {
    title: "Dashboard réservé aux clients actifs.",
    message: "L'espace est prêt, mais il s'ouvre seulement quand l'abonnement du club est actif.",
  };
}

function renderAccessGate(data) {
  const allowed = hasDashboardAccess(data);
  dashboardContent.forEach((section) => {
    section.hidden = !allowed;
  });

  if (lockedDashboard) {
    lockedDashboard.hidden = allowed;
  }

  if (!allowed) {
    const copy = getLockedCopy(data);
    if (lockedTitle) lockedTitle.textContent = copy.title;
    if (lockedMessage) lockedMessage.textContent = copy.message;
  }

  return allowed;
}

function getValidatedSubmissions(submissions) {
  return submissions.filter((submission) => submission.status === "validated");
}

function getActiveRewards(rewards) {
  return rewards.filter((reward) => reward.active !== false);
}

function getUniqueCustomerCount(items) {
  return new Set(items.map((item) => item.customer_id).filter(Boolean)).size;
}

function getDashboardStats(data) {
  const submissions = data.submissions || [];
  const validated = getValidatedSubmissions(submissions);
  const activeRewards = getActiveRewards(data.rewards || []);
  const redemptions = data.rewardRedemptions || [];
  const reach = validated.reduce((sum, submission) => sum + Number(submission.views_count || 0), 0);
  const points = validated.reduce((sum, submission) => sum + Number(submission.points_awarded || 0), 0);
  const estimatedBudget = redemptions.length * 6;
  const cpm = reach > 0 ? (estimatedBudget / reach) * 1000 : 0;

  return {
    submissions,
    validated,
    activeRewards,
    redemptions,
    receivedCount: submissions.length,
    validatedCount: validated.length,
    pendingCount: submissions.filter((submission) => submission.status === "pending").length,
    rejectedCount: submissions.filter((submission) => submission.status === "rejected").length,
    rewardedCustomers: getUniqueCustomerCount(redemptions),
    activeCustomers: getUniqueCustomerCount(submissions),
    reach,
    points,
    cpm,
    estimatedBudget,
  };
}

function renderDataSource(data) {
  if (data.source === "supabase") {
    if (data.reason === "admin_client") {
      setDataStatus(`Admin · ${data.establishment?.name || "client"}`, "connected");
      return;
    }

    setDataStatus("Données réelles", "connected");
    return;
  }

  if (data.reason === "admin_select_client") {
    setDataStatus("Admin · email client requis", "warning");
    return;
  }

  if (data.reason === "admin_required") {
    setDataStatus("Accès admin requis", "error");
    return;
  }

  if (data.reason === "client_not_found") {
    setDataStatus("Client introuvable", "error");
    return;
  }

  if (data.reason === "missing_env") {
    setDataStatus("Mode démo", "warning");
    return;
  }

  if (data.reason === "signed_out") {
    setDataStatus("Mode démo", "warning");
    return;
  }

  if (data.reason === "query_error") {
    setDataStatus("Erreur données", "error");
    return;
  }

  setDataStatus("Mode démo", "warning");
}

function renderEstablishment(data) {
  const establishment = data.establishment || fallbackDashboardData.establishment;
  setText("[data-establishment-name]", establishment.name || "Établissement ViralNight");

  const sidebarNote = document.querySelector(".sidebar-note");
  const plan = sidebarNote?.querySelector("strong");
  const detail = sidebarNote?.querySelector("small");

  if (plan) {
    plan.textContent = establishment.subscription_status === "actif" ? "Plan actif" : "Plan pilote";
  }

  if (detail) {
    const city = establishment.city ? ` - ${establishment.city}` : "";
    detail.textContent = `${establishment.category || "club"}${city}`;
  }
}

function renderOverview(data) {
  const stats = getDashboardStats(data);

  updateMetric("reach", formatNumber(stats.reach), `${stats.validatedCount} contenus validés`);
  updateMetric("points", formatNumber(stats.points), "Barème de l'établissement appliqué");
  updateMetric("rewards", formatNumber(stats.redemptions.length), `${stats.activeRewards.length} récompenses actives`);
  updateMetric("cpm", currencyFormatter.format(stats.cpm), "Estimation basée sur les récompenses");

  const funnelRows = document.querySelectorAll(".funnel div");
  const estimatedScans = stats.activeCustomers + Math.max(40, Math.round(stats.activeCustomers * 0.6));
  const rows = [
    { label: "QR scans", value: estimatedScans, max: Math.max(estimatedScans, 1) },
    { label: "Contenus reçus", value: stats.receivedCount, max: Math.max(estimatedScans, stats.receivedCount, 1) },
    { label: "Contenus validés", value: stats.validatedCount, max: Math.max(estimatedScans, stats.receivedCount, 1) },
    { label: "Récompenses utilisées", value: stats.redemptions.length, max: Math.max(estimatedScans, stats.receivedCount, 1) },
  ];

  funnelRows.forEach((row, index) => {
    const dataRow = rows[index];
    if (!dataRow) return;
    row.querySelector("span").textContent = dataRow.label;
    row.querySelector("strong").textContent = formatNumber(dataRow.value);
    const progress = row.querySelector("progress");
    progress.value = dataRow.value;
    progress.max = dataRow.max;
  });

  const pointTasks = document.querySelectorAll('[data-jump="points"]');
  const checkinTask = document.querySelector('[data-jump="checkin"]');
  updateTaskButton(pointTasks[0], "Stock", `Vérifier ${formatNumber(stats.activeRewards.length)} récompenses actives`);
  updateTaskButton(pointTasks[1], "Points", "Ajuster les seuils avant vendredi");
  updateTaskButton(checkinTask, "QR", "Préparer le check-in de la soirée");
}

function updatePointRuleExamples(rules = getPointRules()) {
  setText("[data-views-rate-base]", `1 000 vues = ${formatPoints(rules.videoViewsPerThousand)}`);
  setText("[data-views-rate-mid]", formatPoints(rules.videoViewsPerThousand * 10));
  setText("[data-views-rate-high]", formatPoints(rules.videoViewsPerThousand * 50));
  setText("[data-story-rate-base]", `1 000 vues story = ${formatPoints(rules.storyViewsPerThousand)}`);
  setText("[data-story-rate-mid]", formatPoints(rules.storyViewsPerThousand * 2.5));
  setText("[data-story-rate-high]", formatPoints(rules.storyViewsPerThousand * 5));
}

function renderPointRules(data) {
  const rules = getPointRules(data);

  ruleInputs.forEach((input) => {
    const key = input.dataset.rulePoints;
    if (!key) return;
    input.value = rules[key] ?? 0;
    input.disabled = false;
    input.title = "Barème configurable par cet établissement.";
  });

  renderCustomPointRules(data);
  updatePointRuleExamples(rules);
}

function isLocalPointRuleId(id) {
  return String(id || "").startsWith(LOCAL_POINT_RULE_PREFIX);
}

function getCustomPointRules(data = dashboardState) {
  return [...(data.pointRuleItems || []), ...localAddedPointRules];
}

function renderCustomPointRules(data = dashboardState) {
  if (!customRuleEditor) return;
  const rules = getCustomPointRules(data);

  customRuleEditor.innerHTML = rules
    .map(
      (rule, index) => `
        <label>
          <span>Critère personnalisé ${index + 1}</span>
          <input type="text" value="${escapeHtml(rule.title)}" data-custom-rule-name="${index}" data-custom-rule-id="${escapeHtml(rule.id)}" data-custom-rule-added="${rule.added ? "true" : "false"}" />
        </label>
        <label>
          <span>Points</span>
          <input type="number" value="${Number(rule.points || 0)}" min="0" step="5" data-custom-rule-points="${index}" data-custom-rule-id="${escapeHtml(rule.id)}" data-custom-rule-added="${rule.added ? "true" : "false"}" />
        </label>
      `,
    )
    .join("");

  attachCustomRuleHandlers();
}

function getEditedCustomPointRules() {
  return Array.from(document.querySelectorAll("[data-custom-rule-name]")).map((input) => {
    const index = input.dataset.customRuleName;
    const pointsInput = document.querySelector(`[data-custom-rule-points="${index}"]`);
    return {
      id: input.dataset.customRuleId,
      title: input.value || "Nouveau critère",
      points: Number(pointsInput?.value || 0),
      active: true,
      added: input.dataset.customRuleAdded === "true",
    };
  });
}

function syncCustomPointRuleEdits() {
  const editedRules = getEditedCustomPointRules();
  dashboardState = {
    ...dashboardState,
    pointRuleItems: editedRules.filter((rule) => !rule.added),
  };
  localAddedPointRules = editedRules.filter((rule) => rule.added);
}

function getCustomPointRuleTotal() {
  return getCustomPointRules().reduce((sum, rule) => sum + Number(rule.points || 0), 0);
}

function isLocalRewardId(id) {
  return String(id || "").startsWith(LOCAL_REWARD_PREFIX);
}

function parseRewardLimit(value) {
  if (value === "" || value === null || value === undefined) return null;
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? Math.max(0, Math.round(parsedValue)) : null;
}

function formatRewardLimitInput(value) {
  const parsedValue = parseRewardLimit(value);
  return parsedValue === null ? "" : String(parsedValue);
}

function getRewardUsageMap() {
  return (dashboardState.rewardRedemptions || []).reduce((usage, redemption) => {
    if (!redemption.reward_id) return usage;
    usage.set(redemption.reward_id, (usage.get(redemption.reward_id) || 0) + 1);
    return usage;
  }, new Map());
}

function getBaseRewardRows(rewards) {
  const activeRewards = getActiveRewards(rewards);
  return activeRewards.length > 0 ? activeRewards : fallbackDashboardData.rewards;
}

function getRewardRows(rewards) {
  return [...getBaseRewardRows(rewards).slice(0, INITIAL_REWARD_COUNT), ...localAddedRewards];
}

function renderRewardEditor(data) {
  const rewards = getRewardRows(data.rewards || []);

  rewardEditor.innerHTML = rewards
    .map(
      (reward, index) => `
        <div class="reward-row">
          <label>
            <span>Récompense ${index + 1}</span>
            <input type="text" value="${escapeHtml(reward.title)}" data-reward-name="${index}" data-reward-id="${escapeHtml(reward.id)}" data-reward-added="${reward.added ? "true" : "false"}" />
          </label>
          <label>
            <span>Seuil</span>
            <input type="number" value="${Number(reward.points_required || 0)}" min="0" step="10" data-reward-threshold="${index}" data-reward-id="${escapeHtml(reward.id)}" data-reward-added="${reward.added ? "true" : "false"}" />
          </label>
          <label>
            <span>Stock max</span>
            <input type="number" value="${formatRewardLimitInput(reward.max_redemptions)}" min="0" step="1" placeholder="Illimité" data-reward-limit="${index}" data-reward-id="${escapeHtml(reward.id)}" data-reward-added="${reward.added ? "true" : "false"}" />
          </label>
        </div>
      `,
    )
    .join("");

  attachRewardHandlers();
  renderRewardPreview(rewards);
}

function getEditedRewards() {
  return Array.from(document.querySelectorAll("[data-reward-name]"))
    .map((input) => {
      const index = input.dataset.rewardName;
      const thresholdInput = document.querySelector(`[data-reward-threshold="${index}"]`);
      const limitInput = document.querySelector(`[data-reward-limit="${index}"]`);
      return {
        id: input.dataset.rewardId,
        title: input.value || "Récompense",
        points_required: Number(thresholdInput?.value || 0),
        max_redemptions: parseRewardLimit(limitInput?.value),
        active: true,
        added: input.dataset.rewardAdded === "true",
      };
    });
}

function syncVisibleRewardEdits() {
  const editedRewards = getEditedRewards();
  const visibleBaseRewards = editedRewards.filter((reward) => !reward.added);
  localAddedRewards = editedRewards.filter((reward) => reward.added);

  const baseRewards = getBaseRewardRows(dashboardState.rewards || []);
  const mergedRewards = baseRewards.map((reward, index) => ({
    ...reward,
    ...(visibleBaseRewards[index] || {}),
    added: false,
  }));

  dashboardState = {
    ...dashboardState,
    rewards: mergedRewards,
  };
}

function renderRewardPreview(rewards = getEditedRewards()) {
  if (!rewardPreview || !totalRulePoints) return;

  const rules = getPointRules();
  const storyRate = rules.storyViewsPerThousand;
  const usageMap = getRewardUsageMap();
  const total = Object.values(rules).reduce((sum, value) => sum + Number(value || 0), 0) + getCustomPointRuleTotal();
  totalRulePoints.textContent = `${formatNumber(total)} pts de barème configuré`;

  rewardPreview.innerHTML = rewards
    .map((reward) => {
      const storyCount = storyRate > 0 ? Math.ceil(Number(reward.points_required || 0) / storyRate) : 0;
      const storyLabel = storyCount > 1 ? "stories" : "story";
      const maxRedemptions = parseRewardLimit(reward.max_redemptions);
      const usedCount = usageMap.get(reward.id) || 0;
      const stockLabel =
        maxRedemptions === null
          ? "Stock illimité"
          : `${formatNumber(Math.max(maxRedemptions - usedCount, 0))} restants sur ${formatNumber(maxRedemptions)}`;
      return `
        <article>
          <strong>${escapeHtml(reward.title)}</strong>
          <span>${formatPoints(reward.points_required)}</span>
          <small>${storyRate > 0 ? `environ ${formatNumber(storyCount)} ${storyLabel} de 1 000 vues` : "Seuil configuré par le club"}</small>
          <small>${escapeHtml(stockLabel)}</small>
        </article>
      `;
    })
    .join("");
}

function attachRewardHandlers() {
  document.querySelectorAll("[data-reward-name], [data-reward-threshold], [data-reward-limit]").forEach((input) => {
    input.addEventListener("input", () => {
      syncVisibleRewardEdits();
      renderRewardPreview();
    });
    input.addEventListener("change", () => persistReward(input));
  });
}

async function persistReward(input) {
  if (dashboardState.source !== "supabase" || !supabase) return;

  const rewardId = input.dataset.rewardId;
  const index = input.dataset.rewardName || input.dataset.rewardThreshold || input.dataset.rewardLimit;
  const nameInput = document.querySelector(`[data-reward-name="${index}"]`);
  const thresholdInput = document.querySelector(`[data-reward-threshold="${index}"]`);
  const limitInput = document.querySelector(`[data-reward-limit="${index}"]`);

  if (!nameInput || !thresholdInput || !limitInput) return;

  const payload = {
    title: nameInput.value || "Récompense",
    points_required: Number(thresholdInput.value || 0),
    max_redemptions: parseRewardLimit(limitInput.value),
  };

  if (!rewardId || isLocalRewardId(rewardId)) {
    const establishmentId = dashboardState.establishment?.id;

    if (!establishmentId) {
      setDataStatus("Impossible d'ajouter la récompense : établissement introuvable.", "error");
      return;
    }

    const { data, error } = await supabase
      .from("rewards")
      .insert({
        ...payload,
        establishment_id: establishmentId,
        active: true,
      })
      .select("id, title, points_required, max_redemptions, active, created_at")
      .single();

    if (error) {
      setDataStatus(`Erreur ajout récompense : ${error.message}`, "error");
      return;
    }

    nameInput.dataset.rewardId = data.id;
    thresholdInput.dataset.rewardId = data.id;
    limitInput.dataset.rewardId = data.id;
    localAddedRewards = localAddedRewards.map((reward) =>
      reward.id === rewardId ? { ...reward, ...data, added: true } : reward,
    );
    dashboardState = {
      ...dashboardState,
      rewards: [...(dashboardState.rewards || []), data],
    };
    setDataStatus("Récompense ajoutée pour cet établissement.", "connected");
    return;
  }

  const { error } = await supabase
    .from("rewards")
    .update(payload)
    .eq("id", rewardId);

  if (error) {
    setDataStatus(`Erreur sauvegarde récompense : ${error.message}`, "error");
    return;
  }

  setDataStatus("Récompense sauvegardée.", "connected");
}

function attachCustomRuleHandlers() {
  document.querySelectorAll("[data-custom-rule-name], [data-custom-rule-points]").forEach((input) => {
    input.addEventListener("input", () => {
      syncCustomPointRuleEdits();
      renderRewardPreview();
    });
    input.addEventListener("change", () => persistCustomPointRule(input));
  });
}

async function persistCustomPointRule(input) {
  if (dashboardState.source !== "supabase" || !supabase) return;

  const ruleId = input.dataset.customRuleId;
  const index = input.dataset.customRuleName || input.dataset.customRulePoints;
  const nameInput = document.querySelector(`[data-custom-rule-name="${index}"]`);
  const pointsInput = document.querySelector(`[data-custom-rule-points="${index}"]`);

  if (!nameInput || !pointsInput) return;

  const payload = {
    title: nameInput.value || "Nouveau critère",
    points: Number(pointsInput.value || 0),
  };

  if (!ruleId || isLocalPointRuleId(ruleId)) {
    const establishmentId = dashboardState.establishment?.id;

    if (!establishmentId) {
      setDataStatus("Impossible d'ajouter le critère : établissement introuvable.", "error");
      return;
    }

    const { data, error } = await supabase
      .from("establishment_point_rule_items")
      .insert({
        ...payload,
        establishment_id: establishmentId,
        active: true,
      })
      .select("id, title, points, active, created_at")
      .single();

    if (error) {
      setDataStatus(`Erreur ajout critère : ${error.message}`, "error");
      return;
    }

    nameInput.dataset.customRuleId = data.id;
    pointsInput.dataset.customRuleId = data.id;
    localAddedPointRules = localAddedPointRules.map((rule) =>
      rule.id === ruleId ? { ...rule, ...data, added: true } : rule,
    );
    dashboardState = {
      ...dashboardState,
      pointRuleItems: [...(dashboardState.pointRuleItems || []), data],
    };
    setDataStatus("Critère ajouté au barème.", "connected");
    return;
  }

  const { error } = await supabase.from("establishment_point_rule_items").update(payload).eq("id", ruleId);

  if (error) {
    setDataStatus(`Erreur sauvegarde critère : ${error.message}`, "error");
    return;
  }

  setDataStatus("Critère sauvegardé.", "connected");
}

function pointRulesToRow(rules) {
  return {
    validated_publication: 0,
    video_views_per_thousand: Number(rules.videoViewsPerThousand || 0),
    validated_story: 0,
    story_views_per_thousand: Number(rules.storyViewsPerThousand || 0),
    viral_bonus: Number(rules.viralBonus || 0),
    club_mention: 0,
    qr_checkin: Number(rules.qrCheckin || 0),
    monthly_ambassador: Number(rules.monthlyAmbassador || 0),
  };
}

async function persistPointRules() {
  const rules = getPointRules();

  if (dashboardState.source !== "supabase" || !supabase) {
    setDataStatus("Mode démo : barème modifié localement, avec données locales visibles sur toutes les vues. Connecte Supabase pour sauvegarder.", "warning");
    return;
  }

  const establishmentId = dashboardState.establishment?.id;

  if (!establishmentId) {
    setDataStatus("Impossible de sauvegarder le barème : établissement introuvable.", "error");
    return;
  }

  const { error } = await supabase.from("establishment_point_rules").upsert(
    {
      establishment_id: establishmentId,
      ...pointRulesToRow(rules),
    },
    { onConflict: "establishment_id" },
  );

  if (error) {
    setDataStatus(`Erreur sauvegarde barème : ${error.message}`, "error");
    return;
  }

  setDataStatus("Barème de points sauvegardé pour cet établissement.", "connected");
}

function renderCheckins(data) {
  const stats = getDashboardStats(data);
  const checkins = stats.activeCustomers + Math.max(40, Math.round(stats.activeCustomers * 0.6));
  const presenceBonuses = Math.round(checkins * 0.34);
  const usedRewards = stats.redemptions.filter((redemption) => redemption.status === "used").length;

  checkinStats.innerHTML = `
    <div><strong>${formatNumber(checkins)}</strong><span>check-ins estimés</span></div>
    <div><strong>${formatNumber(presenceBonuses)}</strong><span>bonus de présence attribués</span></div>
    <div><strong>${formatNumber(usedRewards)}</strong><span>récompenses utilisées</span></div>
  `;
}

function renderDashboard(data) {
  dashboardState = data;
  renderDataSource(data);
  updateAuthUi(data.session);
  renderEstablishment(data);
  if (!renderAccessGate(data)) return;
  renderOverview(data);
  renderPointRules(data);
  renderRewardEditor(data);
  renderCheckins(data);
}

async function refreshDashboard() {
  const data = await fetchDashboardData(supabase, isSupabaseConfigured, { ownerEmail: selectedClientEmail });
  renderDashboard(data);
}

navLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    activateView(link.dataset.viewLink);
  });
});

jumpButtons.forEach((button) => {
  button.addEventListener("click", () => activateView(button.dataset.jump));
});

ruleInputs.forEach((input) => {
  input.addEventListener("input", () => {
    const key = input.dataset.rulePoints;
    if (!key) return;

    dashboardState = {
      ...dashboardState,
      pointRules: {
        ...getPointRules(),
        [key]: Number(input.value || 0),
      },
    };

    updatePointRuleExamples(dashboardState.pointRules);
    renderRewardPreview();
  });

  input.addEventListener("change", persistPointRules);
});

addPointRuleButton?.addEventListener("click", () => {
  syncCustomPointRuleEdits();
  localAddedPointRules.push({
    id: `${LOCAL_POINT_RULE_PREFIX}${Date.now()}`,
    title: "Nouveau critère",
    points: 10,
    active: true,
    added: true,
  });
  renderCustomPointRules(dashboardState);
  renderRewardPreview();
});

addRewardButton?.addEventListener("click", () => {
  const editedRewards = getEditedRewards();
  const lastThreshold = editedRewards[editedRewards.length - 1]?.points_required || 240;
  syncVisibleRewardEdits();

  localAddedRewards.push({
    id: `${LOCAL_REWARD_PREFIX}${Date.now()}`,
    title: "Nouvelle récompense",
    points_required: Math.ceil((lastThreshold + 50) / 10) * 10,
    max_redemptions: null,
    active: true,
    added: true,
  });

  renderRewardEditor(dashboardState);
});

authForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!supabase) {
    setDataStatus("Ajoute VITE_SUPABASE_URL dans .env.local avant de te connecter.", "warning");
    return;
  }

  const formData = new FormData(authForm);
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  if (!email || !password) {
    setDataStatus("Entre l'email du club et le mot de passe.", "warning");
    return;
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    setDataStatus(`Erreur connexion : ${error.message}`, "error");
    return;
  }

  authForm.reset();
  setDataStatus("Connexion réussie. Chargement des données réelles du club.", "connected");
});

passwordResetButton?.addEventListener("click", async () => {
  if (!supabase) {
    setDataStatus("Supabase n'est pas configuré pour créer un mot de passe.", "warning");
    return;
  }

  const formData = new FormData(authForm);
  const email = String(formData.get("email") || "").trim();

  if (!email) {
    setDataStatus("Entre l'email du club avant de créer ou changer le mot de passe.", "warning");
    return;
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: new URL("./app.html", window.location.href).href,
  });

  setDataStatus(
    error
      ? `Impossible d'envoyer l'email de mot de passe : ${error.message}`
      : "Email envoyé. Ouvre le lien reçu pour créer ou changer le mot de passe.",
    error ? "error" : "connected",
  );
});

passwordUpdateForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!supabase) return;

  const formData = new FormData(passwordUpdateForm);
  const password = String(formData.get("new_password") || "");

  if (password.length < 8) {
    setDataStatus("Le mot de passe doit contenir au moins 8 caractères.", "warning");
    return;
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    setDataStatus(`Impossible d'enregistrer le mot de passe : ${error.message}`, "error");
    return;
  }

  passwordUpdateForm.reset();
  passwordUpdateForm.hidden = true;
  setDataStatus("Mot de passe enregistré. Tu peux maintenant te connecter au dashboard.", "connected");
});

signOutButton?.addEventListener("click", async () => {
  if (!supabase) return;
  selectedClientEmail = "";
  await supabase.auth.signOut();
  await refreshDashboard();
});

if (supabase) {
  supabase.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY" && passwordUpdateForm) {
      passwordUpdateForm.hidden = false;
      setDataStatus("Choisis ton nouveau mot de passe pour activer l'accès au dashboard.", "connected");
    }
    refreshDashboard();
  });
}

const initialView = window.location.hash.replace("#", "");
if (initialView && document.querySelector(`[data-view="${initialView}"]`)) {
  activateView(initialView);
} else if (initialView) {
  navLinks.forEach((link) => link.classList.toggle("is-active", link.dataset.viewLink === "overview"));
}

window.addEventListener("hashchange", () => {
  const viewId = window.location.hash.replace("#", "");
  if (viewId && document.querySelector(`[data-view="${viewId}"]`)) {
    activateView(viewId);
  }
});

refreshDashboard();
