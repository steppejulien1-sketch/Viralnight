import { DEFAULT_POINT_RULES, fallbackDashboardData, fetchDashboardData } from "./dashboardData.js";
import { isSupabaseConfigured, supabase } from "./supabaseClient.js";

const navLinks = document.querySelectorAll("[data-view-link]");
const views = document.querySelectorAll("[data-view]");
const jumpButtons = document.querySelectorAll("[data-jump]");
const ruleInputs = document.querySelectorAll("[data-rule-points]");
const dataStatus = document.querySelector("[data-data-status]");
const authForm = document.querySelector("[data-auth-form]");
const accessMenu = document.querySelector("[data-access-menu]");
const authFeedback = document.querySelector("[data-auth-feedback]");
const openAccessButtons = document.querySelectorAll("[data-open-access]");
const passwordResetButton = document.querySelector("[data-password-reset]");
const passwordUpdateForm = document.querySelector("[data-password-update]");
const signOutButton = document.querySelector("[data-sign-out]");
const rewardEditor = document.querySelector("[data-reward-editor]");
const rewardPreview = document.querySelector("[data-reward-preview]");
const totalRulePoints = document.querySelector("[data-total-rule-points]");
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

function isStrongPassword(password) {
  return password.length >= 8 && /\d/.test(password);
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

  const valeur = metric.querySelector(".metric-value");
  const legende = metric.querySelector(".metric-caption");

  if (valeur) valeur.textContent = value;
  if (legende && caption) legende.textContent = caption;
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

function setAuthFeedback(message = "", state = "") {
  if (!authFeedback) return;
  authFeedback.textContent = message;
  authFeedback.dataset.state = state;
}

function openAccessMenu() {
  if (accessMenu) accessMenu.open = true;
}

function showPasswordUpdateForm() {
  openAccessMenu();
  if (passwordUpdateForm) passwordUpdateForm.hidden = false;
}

function hasDashboardAccess(data) {
  return true;
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

  // Pas de session : on envoie directement au formulaire de connexion.
  //
  // On teste la session et non hasDashboardAccess(), qui renvoie toujours true :
  // sans ce test, un visiteur non connecte voyait un dashboard de demonstration
  // rempli de chiffres qui ne sont pas les siens.
  if (!data.session && data.reason !== "missing_env") {
    const retour = encodeURIComponent(window.location.pathname + window.location.hash);
    window.location.replace(`./connexion.html?suivant=${retour}`);
    return false;
  }

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
  // Les scans viennent de la table qr_scans. Aucune estimation : afficher un chiffre
  // invente comme s'il etait mesure induit le gerant en erreur sur sa frequentation.
  const qrScans = data.qrScans || [];

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
    scanCount: qrScans.length,
    uniqueScanners: getUniqueCustomerCount(qrScans),
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

  // ⚠️ Le cas le plus frequent aujourd'hui : le compte existe mais n'est
  // rattache a aucun club (la table establishment_owners est vide). Il
  // faut le DIRE, sinon le gerant croit que son tableau de bord est
  // casse — ou pire, prend les chiffres affiches pour les siens.
  if (data.reason === "no_establishment") {
    setDataStatus("Club non rattaché", "warning");
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
  // ⚠️ NE JAMAIS retomber sur le club de demonstration quand une session
  // existe. Un gerant connecte lisait « Mirage Club Brussels » en haut de
  // SON tableau de bord, avec les chiffres qui vont avec.
  const reel = data.source === "supabase";
  const establishment = data.establishment || (reel ? null : data.session ? null : fallbackDashboardData.establishment);

  setText("[data-establishment-name]", establishment?.name || (data.session ? "Votre club" : "Établissement ViralNight"));

  // La phrase « Rien n'est estime » est une promesse : elle ne doit
  // s'afficher que si les chiffres viennent bien de la base.
  const promesse = document.querySelector("[data-promesse-chiffres]");
  if (promesse) {
    promesse.textContent = reel
      ? "Chiffres mesurés sur vos contenus validés. Rien n'est estimé."
      : "Aucune donnée à afficher pour le moment.";
  }

  const sidebarNote = document.querySelector(".sidebar-note");
  const plan = sidebarNote?.querySelector("strong");
  const detail = sidebarNote?.querySelector("small");

  if (plan) {
    plan.textContent = establishment?.subscription_status === "actif" ? "Plan actif" : "Plan pilote";
  }

  if (detail) {
    const city = establishment?.city ? ` - ${establishment.city}` : "";
    detail.textContent = `${establishment?.category || "club"}${city}`;
  }
}

function renderOverview(data) {
  const stats = getDashboardStats(data);

  updateMetric("reach", formatNumber(stats.reach), `${formatNumber(stats.validatedCount)} contenus validés`);
  updateMetric("points", formatNumber(stats.points), "Selon votre barème");
  updateMetric(
    "scans",
    formatNumber(stats.scanCount),
    stats.scanCount ? `${formatNumber(stats.uniqueScanners)} personnes différentes` : "Aucun scan enregistré",
  );
  updateMetric(
    "rewards",
    formatNumber(stats.redemptions.length),
    `${formatNumber(stats.activeRewards.length)} récompenses actives`,
  );

  renderPipeline(stats);
}

/**
 * Parcours d'un contenu, du depot a la recompense.
 *
 * Chaque etape est un compte reel. L'ancienne version estimait les scans a partir
 * du nombre de clients, ce qui affichait une frequentation inventee.
 */
function renderPipeline(stats) {
  const container = document.querySelector("[data-pipeline]");
  const note = document.querySelector("[data-pipeline-note]");
  if (!container) return;

  const etapes = [
    { label: "Scans du QR code", valeur: stats.scanCount },
    { label: "Contenus reçus", valeur: stats.receivedCount },
    { label: "Contenus validés", valeur: stats.validatedCount },
    { label: "Récompenses réclamées", valeur: stats.redemptions.length },
  ];

  const max = Math.max(...etapes.map((e) => e.valeur), 1);

  container.innerHTML = etapes
    .map(
      (e) => `
      <li class="pipeline-step">
        <span class="pipeline-label">${escapeHtml(e.label)}</span>
        <span class="pipeline-value">${formatNumber(e.valeur)}</span>
        <div class="pipeline-track"><div class="pipeline-fill" style="width:${Math.round((e.valeur / max) * 100)}%"></div></div>
      </li>`,
    )
    .join("");

  if (!note) return;

  // Le message pointe la prochaine action utile plutot qu'un constat neutre.
  if (!stats.scanCount && !stats.receivedCount) {
    note.textContent = "Rien n'est encore collecté. Affichez votre QR code à l'entrée pour démarrer.";
  } else if (stats.pendingCount) {
    note.textContent = `${formatNumber(stats.pendingCount)} contenu(s) attendent d'être validés : sans validation, aucun point n'est crédité.`;
  } else if (stats.receivedCount && !stats.redemptions.length) {
    note.textContent = "Vos clients publient mais ne réclament aucune récompense : vos seuils sont peut-être trop hauts.";
  } else {
    note.textContent = "Tout est à jour.";
  }
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

function renderDashboard(data) {
  dashboardState = data;
  renderDataSource(data);
  updateAuthUi(data.session);
  renderEstablishment(data);
  if (!renderAccessGate(data)) return;
  renderOverview(data);
  renderPointRules(data);
  renderRewardEditor(data);
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
  setAuthFeedback();

  if (!supabase) {
    setAuthFeedback("Connexion indisponible pour le moment.", "error");
    return;
  }

  const formData = new FormData(authForm);
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  if (!email || !password) {
    setAuthFeedback("Entre l'email du club et le mot de passe.", "warning");
    return;
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    setAuthFeedback("Connexion impossible. Vérifie l'email et le mot de passe.", "error");
    return;
  }

  authForm.reset();
  setAuthFeedback("Connexion réussie.", "connected");
});

passwordResetButton?.addEventListener("click", async () => {
  setAuthFeedback();

  if (!supabase) {
    setAuthFeedback("Création du mot de passe indisponible pour le moment.", "error");
    return;
  }

  const formData = new FormData(authForm);
  const email = String(formData.get("email") || "").trim();

  if (!email) {
    setAuthFeedback("Entre l'email du club pour recevoir le lien de création.", "warning");
    return;
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: new URL("./app.html", window.location.href).href,
  });

  setAuthFeedback(
    error
      ? "Impossible d'envoyer le lien pour le moment."
      : "Lien envoyé. Ouvre l'email, puis enregistre ton nouveau mot de passe ici.",
    error ? "error" : "connected",
  );
});

passwordUpdateForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setAuthFeedback();

  if (!supabase) return;

  const formData = new FormData(passwordUpdateForm);
  const password = String(formData.get("new_password") || "");

  if (!isStrongPassword(password)) {
    setAuthFeedback("Le mot de passe doit contenir au moins 8 caractères et 1 chiffre.", "warning");
    return;
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    setAuthFeedback("Impossible d'enregistrer le mot de passe.", "error");
    return;
  }

  passwordUpdateForm.reset();
  passwordUpdateForm.hidden = true;
  setAuthFeedback("Mot de passe enregistré.", "connected");
});

signOutButton?.addEventListener("click", async () => {
  if (!supabase) return;
  selectedClientEmail = "";
  await supabase.auth.signOut();
  await refreshDashboard();
});

openAccessButtons.forEach((button) => {
  button.addEventListener("click", () => {
    openAccessMenu();
    authForm?.querySelector('input[name="email"]')?.focus();
  });
});

if (supabase) {
  // L'admin ne doit jamais rester sur app.html — il a son propre espace.
  // Cas typique : connexion via Google OAuth qui redirige toujours vers app.html.
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (session?.user?.email?.trim().toLowerCase() === "viralnight001@gmail.com") {
      window.location.replace("./admin.html");
    }
  });

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY" && passwordUpdateForm) {
      showPasswordUpdateForm();
      setAuthFeedback("Enregistre ton nouveau mot de passe ci-dessous.", "connected");
      return;
    }
    if (session?.user?.email?.trim().toLowerCase() === "viralnight001@gmail.com") {
      window.location.replace("./admin.html");
      return;
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
