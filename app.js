import { DEFAULT_POINT_RULES, fallbackDashboardData, fetchDashboardData } from "./dashboardData.js";
import { isSupabaseConfigured, supabase } from "./supabaseClient.js";

const navLinks = document.querySelectorAll("[data-view-link]");
const views = document.querySelectorAll("[data-view]");
const jumpButtons = document.querySelectorAll("[data-jump]");
const ruleInputs = document.querySelectorAll("[data-rule-points]");
const forecastInputs = document.querySelectorAll("[data-forecast]");
const dataStatus = document.querySelector("[data-data-status]");
const authForm = document.querySelector("[data-auth-form]");
const signOutButton = document.querySelector("[data-sign-out]");
const rewardEditor = document.querySelector("[data-reward-editor]");
const rewardPreview = document.querySelector("[data-reward-preview]");
const totalRulePoints = document.querySelector("[data-total-rule-points]");
const contentTable = document.querySelector("[data-content-table]");
const clientGrid = document.querySelector("[data-client-grid]");
const checkinStats = document.querySelector("[data-checkin-stats]");

const numberFormatter = new Intl.NumberFormat("fr-FR");
const currencyFormatter = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});

const platformLabels = {
  tiktok: "TT",
  instagram: "IG",
  youtube: "YT",
};

const statusLabels = {
  pending: "A qualifier",
  validated: "Valide",
  rejected: "A revoir",
};

const statusClasses = {
  pending: "pending",
  validated: "approved",
  rejected: "review",
};

let dashboardState = {
  ...fallbackDashboardData,
};

function getPointRules(data = dashboardState) {
  return {
    ...DEFAULT_POINT_RULES,
    ...(data.pointRules || {}),
  };
}

function activateView(viewId) {
  views.forEach((view) => view.classList.toggle("is-active", view.dataset.view === viewId));
  navLinks.forEach((link) => link.classList.toggle("is-active", link.dataset.viewLink === viewId));
  history.replaceState(null, "", `#${viewId}`);
  requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
  window.setTimeout(() => window.scrollTo({ top: 0, behavior: "auto" }), 80);
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

function updateAuthUi(session) {
  const isConnected = Boolean(session);
  if (authForm) authForm.hidden = isConnected;
  if (signOutButton) signOutButton.hidden = !isConnected;
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
    setDataStatus("Connecte a Supabase : donnees reelles de l'etablissement.", "connected");
    return;
  }

  if (data.reason === "missing_env") {
    setDataStatus("Mode demo : donnees locales affichees sur toutes les vues. Ajoute VITE_SUPABASE_URL dans .env.local pour activer Supabase.", "warning");
    return;
  }

  if (data.reason === "signed_out") {
    setDataStatus("Mode demo : donnees locales affichees sur toutes les vues. Connecte-toi avec l'email owner pour voir les donnees Supabase.", "warning");
    return;
  }

  if (data.reason === "query_error") {
    setDataStatus(`Mode demo : donnees locales affichees sur toutes les vues, car Supabase a repondu avec une erreur (${data.error}).`, "error");
    return;
  }

  setDataStatus("Mode demo : donnees locales affichees sur toutes les vues du dashboard.", "warning");
}

function renderEstablishment(data) {
  const establishment = data.establishment || fallbackDashboardData.establishment;
  setText("[data-establishment-name]", establishment.name || "Etablissement ViralNight");

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

  updateMetric("reach", formatNumber(stats.reach), `${stats.validatedCount} contenus valides`);
  updateMetric("points", formatNumber(stats.points), "Bareme de l'etablissement applique");
  updateMetric("rewards", formatNumber(stats.redemptions.length), `${stats.activeRewards.length} recompenses actives`);
  updateMetric("cpm", currencyFormatter.format(stats.cpm), "Estimation basee sur les recompenses");

  const funnelRows = document.querySelectorAll(".funnel div");
  const rows = [
    { label: "Contenus recus", value: stats.receivedCount, max: Math.max(stats.receivedCount, 1) },
    { label: "Contenus qualifies", value: stats.validatedCount, max: Math.max(stats.receivedCount, 1) },
    { label: "Clients recompenses", value: stats.rewardedCustomers, max: Math.max(stats.activeCustomers, 1) },
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

  const contentTask = document.querySelector('[data-jump="content"]');
  const pointsTask = document.querySelector('[data-jump="points"]');
  const checkinTask = document.querySelector('[data-jump="checkin"]');
  if (contentTask) contentTask.textContent = `Qualifier ${formatNumber(stats.pendingCount)} contenus en attente`;
  if (pointsTask) pointsTask.textContent = `Verifier ${formatNumber(stats.activeRewards.length)} recompenses actives`;
  if (checkinTask) checkinTask.textContent = "Preparer le QR check-in de vendredi";
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
    input.title = "Bareme configurable par cet etablissement.";
  });

  updatePointRuleExamples(rules);
}

function getRewardRows(rewards) {
  const activeRewards = getActiveRewards(rewards);
  return activeRewards.length > 0 ? activeRewards : fallbackDashboardData.rewards;
}

function renderRewardEditor(data) {
  const rewards = getRewardRows(data.rewards || []);

  rewardEditor.innerHTML = rewards
    .map(
      (reward, index) => `
        <label>
          <span>Recompense ${index + 1}</span>
          <input type="text" value="${escapeHtml(reward.title)}" data-reward-name="${index}" data-reward-id="${escapeHtml(reward.id)}" />
        </label>
        <label>
          <span>Seuil</span>
          <input type="number" value="${Number(reward.points_required || 0)}" min="0" step="10" data-reward-threshold="${index}" data-reward-id="${escapeHtml(reward.id)}" />
        </label>
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
      return {
        id: input.dataset.rewardId,
        title: input.value || "Recompense",
        points_required: Number(thresholdInput?.value || 0),
      };
    })
    .sort((a, b) => a.points_required - b.points_required);
}

function renderRewardPreview(rewards = getEditedRewards()) {
  const rules = getPointRules();
  const storyRate = rules.storyViewsPerThousand;
  const total = Object.values(rules).reduce((sum, value) => sum + Number(value || 0), 0);
  totalRulePoints.textContent = `${formatNumber(total)} pts de bareme configure`;

  rewardPreview.innerHTML = rewards
    .map((reward) => {
      const storyCount = storyRate > 0 ? Math.ceil(Number(reward.points_required || 0) / storyRate) : 0;
      const storyLabel = storyCount > 1 ? "stories" : "story";
      return `
        <article>
          <strong>${escapeHtml(reward.title)}</strong>
          <span>${formatPoints(reward.points_required)}</span>
          <small>${storyRate > 0 ? `environ ${formatNumber(storyCount)} ${storyLabel} de 1 000 vues` : "Seuil configure par le club"}</small>
        </article>
      `;
    })
    .join("");
}

function attachRewardHandlers() {
  document.querySelectorAll("[data-reward-name], [data-reward-threshold]").forEach((input) => {
    input.addEventListener("input", () => renderRewardPreview());
    input.addEventListener("change", () => persistReward(input));
  });
}

async function persistReward(input) {
  if (dashboardState.source !== "supabase" || !supabase) return;

  const rewardId = input.dataset.rewardId;
  const index = input.dataset.rewardName || input.dataset.rewardThreshold;
  const nameInput = document.querySelector(`[data-reward-name="${index}"]`);
  const thresholdInput = document.querySelector(`[data-reward-threshold="${index}"]`);

  if (!rewardId || !nameInput || !thresholdInput) return;

  const { error } = await supabase
    .from("rewards")
    .update({
      title: nameInput.value,
      points_required: Number(thresholdInput.value || 0),
    })
    .eq("id", rewardId);

  if (error) {
    setDataStatus(`Erreur sauvegarde recompense : ${error.message}`, "error");
  }
}

function pointRulesToRow(rules) {
  return {
    validated_publication: 0,
    video_views_per_thousand: Number(rules.videoViewsPerThousand || 0),
    validated_story: 0,
    story_views_per_thousand: Number(rules.storyViewsPerThousand || 0),
    viral_bonus: Number(rules.viralBonus || 0),
    club_mention: Number(rules.clubMention || 0),
    qr_checkin: Number(rules.qrCheckin || 0),
    monthly_ambassador: Number(rules.monthlyAmbassador || 0),
  };
}

async function persistPointRules() {
  const rules = getPointRules();

  if (dashboardState.source !== "supabase" || !supabase) {
    setDataStatus("Mode demo : bareme modifie localement, avec donnees locales visibles sur toutes les vues. Connecte Supabase pour sauvegarder.", "warning");
    return;
  }

  const establishmentId = dashboardState.establishment?.id;

  if (!establishmentId) {
    setDataStatus("Impossible de sauvegarder le bareme : etablissement introuvable.", "error");
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
    setDataStatus(`Erreur sauvegarde bareme : ${error.message}`, "error");
    return;
  }

  setDataStatus("Bareme de points sauvegarde pour cet etablissement.", "connected");
}

function renderContentTable(data) {
  const submissions = [...(data.submissions || [])].sort(
    (a, b) => new Date(b.submitted_at || 0) - new Date(a.submitted_at || 0),
  );

  const rows = submissions.slice(0, 12);
  const tableHead = `
    <div class="table-row table-head">
      <span>Publication</span>
      <span>Plateforme</span>
      <span>Vues</span>
      <span>Points</span>
      <span>Statut</span>
      <span>Action</span>
    </div>
  `;

  if (rows.length === 0) {
    contentTable.innerHTML = `${tableHead}<div class="empty-state">Aucun contenu soumis pour le moment.</div>`;
    return;
  }

  contentTable.innerHTML =
    tableHead +
    rows
      .map((submission) => {
        const label = `${submission.content_type || "Publication"} ${statusLabels[submission.status] || ""}`.trim();
        const statusClass = statusClasses[submission.status] || "pending";
        const isValidated = submission.status === "validated";
        return `
          <div class="table-row" data-content-row data-content-id="${escapeHtml(submission.id)}">
            <strong>${escapeHtml(label)}</strong>
            <span>${escapeHtml(platformLabels[submission.platform] || submission.platform)}</span>
            <span>${formatNumber(submission.views_count)}</span>
            <span>${formatNumber(submission.points_awarded)}</span>
            <span class="status ${statusClass}">${escapeHtml(statusLabels[submission.status] || submission.status)}</span>
            <button type="button" data-approve-content ${isValidated ? "disabled" : ""}>${isValidated ? "Termine" : "Attribuer"}</button>
          </div>
        `;
      })
      .join("");

  attachContentHandlers();
}

function attachContentHandlers() {
  document.querySelectorAll("[data-approve-content]").forEach((button) => {
    button.addEventListener("click", async () => {
      const row = button.closest("[data-content-row]");
      const contentId = row?.dataset.contentId;

      if (dashboardState.source === "supabase" && supabase && contentId) {
        const { error } = await supabase.from("submissions").update({ status: "validated" }).eq("id", contentId);
        if (error) {
          setDataStatus(`Erreur validation contenu : ${error.message}`, "error");
          return;
        }
      }

      const status = row.querySelector(".status");
      status.textContent = statusLabels.validated;
      status.className = "status approved";
      button.textContent = "Termine";
      button.disabled = true;
    });
  });
}

function renderCheckins(data) {
  const stats = getDashboardStats(data);
  const checkins = stats.activeCustomers + Math.max(40, Math.round(stats.activeCustomers * 0.6));
  const presenceBonuses = Math.round(checkins * 0.34);
  const usedRewards = stats.redemptions.filter((redemption) => redemption.status === "used").length;

  checkinStats.innerHTML = `
    <div><strong>${formatNumber(checkins)}</strong><span>check-ins estimes</span></div>
    <div><strong>${formatNumber(presenceBonuses)}</strong><span>bonus de presence attribues</span></div>
    <div><strong>${formatNumber(usedRewards)}</strong><span>recompenses utilisees</span></div>
  `;
}

function getClientSummaries(data) {
  const summaries = new Map();

  for (const submission of data.submissions || []) {
    const id = submission.customer_id;
    if (!id) continue;
    const summary = summaries.get(id) || { id, points: 0, submissions: 0, redemptions: 0 };
    summary.points += Number(submission.points_awarded || 0);
    summary.submissions += 1;
    summaries.set(id, summary);
  }

  for (const redemption of data.rewardRedemptions || []) {
    const id = redemption.customer_id;
    if (!id) continue;
    const summary = summaries.get(id) || { id, points: 0, submissions: 0, redemptions: 0 };
    summary.redemptions += 1;
    summaries.set(id, summary);
  }

  return [...summaries.values()].sort((a, b) => b.points - a.points).slice(0, 3);
}

function getClientLevel(points) {
  if (points >= 700) return "Niveau Gold";
  if (points >= 300) return "Niveau Silver";
  return "Nouveau";
}

function renderClients(data) {
  const clients = getClientSummaries(data);

  if (clients.length === 0) {
    clientGrid.innerHTML = '<div class="empty-state">Aucun client actif pour le moment.</div>';
    return;
  }

  clientGrid.innerHTML = clients
    .map((client) => {
      const shortId = client.id.split("-").pop()?.slice(-4) || "0000";
      return `
        <article class="client-card">
          <span>${getClientLevel(client.points)}</span>
          <strong>Client #VN-${escapeHtml(shortId)}</strong>
          <p>${formatPoints(client.points)} - ${formatNumber(client.submissions)} publications qualifiees - ${formatNumber(client.redemptions)} recompenses utilisees</p>
        </article>
      `;
    })
    .join("");
}

function updateForecastFromData(data) {
  const stats = getDashboardStats(data);
  const budgetInput = document.querySelector('[data-forecast="budget"]');
  const viewsInput = document.querySelector('[data-forecast="views"]');
  const clientsInput = document.querySelector('[data-forecast="clients"]');

  if (viewsInput && stats.reach > 0) viewsInput.value = String(stats.reach);
  if (clientsInput && stats.activeCustomers > 0) clientsInput.value = String(stats.activeCustomers);
  if (budgetInput && stats.estimatedBudget > 0) budgetInput.value = String(Math.max(stats.estimatedBudget, 300));

  updateForecast();
}

function updateForecast() {
  const budget = Number(document.querySelector('[data-forecast="budget"]')?.value || 0);
  const viewsTarget = Number(document.querySelector('[data-forecast="views"]')?.value || 0);
  const clients = Number(document.querySelector('[data-forecast="clients"]')?.value || 0);
  const cpm = viewsTarget > 0 ? (budget / viewsTarget) * 1000 : 0;
  const cpa = clients > 0 ? budget / clients : 0;
  const score = cpm <= 5 ? "Fort" : cpm <= 8 ? "Correct" : "A optimiser";

  setText('[data-forecast-result="cpm"]', currencyFormatter.format(cpm));
  setText('[data-forecast-result="cpa"]', currencyFormatter.format(cpa));
  setText('[data-forecast-result="score"]', score);
}

function renderDashboard(data) {
  dashboardState = data;
  renderDataSource(data);
  updateAuthUi(data.session);
  renderEstablishment(data);
  renderOverview(data);
  renderPointRules(data);
  renderRewardEditor(data);
  renderContentTable(data);
  renderCheckins(data);
  renderClients(data);
  updateForecastFromData(data);
}

async function refreshDashboard() {
  const data = await fetchDashboardData(supabase, isSupabaseConfigured);
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

forecastInputs.forEach((input) => {
  input.addEventListener("input", updateForecast);
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

authForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!supabase) {
    setDataStatus("Ajoute VITE_SUPABASE_URL dans .env.local avant de te connecter.", "warning");
    return;
  }

  const formData = new FormData(authForm);
  const email = String(formData.get("email") || "").trim();

  if (!email) {
    setDataStatus("Entre l'email owner pour recevoir le lien de connexion.", "warning");
    return;
  }

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: window.location.href,
    },
  });

  if (error) {
    setDataStatus(`Erreur connexion : ${error.message}`, "error");
    return;
  }

  setDataStatus("Lien de connexion envoye par email. Ouvre-le pour charger les donnees reelles.", "connected");
});

signOutButton?.addEventListener("click", async () => {
  if (!supabase) return;
  await supabase.auth.signOut();
  await refreshDashboard();
});

if (supabase) {
  supabase.auth.onAuthStateChange(() => {
    refreshDashboard();
  });
}

const initialView = window.location.hash.replace("#", "");
if (initialView && document.querySelector(`[data-view="${initialView}"]`)) {
  activateView(initialView);
} else if (initialView) {
  activateView("overview");
}

window.addEventListener("hashchange", () => {
  const viewId = window.location.hash.replace("#", "");
  if (viewId && document.querySelector(`[data-view="${viewId}"]`)) {
    activateView(viewId);
  }
});

refreshDashboard();
