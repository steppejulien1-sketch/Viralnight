import { isSupabaseConfigured, supabase } from "./supabaseClient.js";

const ADMIN_EMAIL = "viralnight001@gmail.com";

const demoSubmissions = [
  {
    id: "vn-001",
    establishment: "Mirage Club Brussels",
    platform: "TikTok",
    type: "Reel dancefloor",
    views: 12800,
    points: 320,
    status: "pending",
    url: "",
  },
  {
    id: "vn-002",
    establishment: "La House",
    platform: "Instagram",
    type: "Story VIP",
    views: 4200,
    points: 336,
    status: "pending",
    url: "",
  },
  {
    id: "vn-003",
    establishment: "Pulse Room",
    platform: "YouTube",
    type: "Short ambiance",
    views: 9100,
    points: 228,
    status: "review",
    url: "",
  },
  {
    id: "vn-004",
    establishment: "Mirage Club Brussels",
    platform: "Instagram",
    type: "Story table",
    views: 2600,
    points: 208,
    status: "validated",
    url: "",
  },
  {
    id: "vn-005",
    establishment: "Neon Bar",
    platform: "TikTok",
    type: "Vidéo entrée",
    views: 6800,
    points: 170,
    status: "pending",
    url: "",
  },
  {
    id: "vn-006",
    establishment: "Pulse Room",
    platform: "Instagram",
    type: "Post flou",
    views: 900,
    points: 0,
    status: "rejected",
    url: "",
  },
];

const state = {
  submissions: demoSubmissions.map((submission) => ({ ...submission })),
  establishment: "all",
  status: "all",
  source: "demo",
  session: null,
  loading: false,
};

const table = document.querySelector("[data-admin-table]");
const establishmentFilter = document.querySelector("[data-filter-establishment]");
const statusFilter = document.querySelector("[data-filter-status]");
const authForm = document.querySelector("[data-admin-login]");
const emailInput = document.querySelector("[data-admin-email]");
const logoutButton = document.querySelector("[data-admin-logout]");
const authStatus = document.querySelector("[data-admin-auth-status]");
const clientDashboardForm = document.querySelector("[data-client-dashboard-form]");
const modeNotice = document.querySelector("[data-admin-mode]");
const loginButton = authForm?.querySelector('button[type="submit"]');
const numberFormatter = new Intl.NumberFormat("fr-FR");

const statusLabels = {
  pending: "En attente",
  review: "À revoir",
  validated: "Validé",
  rejected: "Rejeté",
};

const platformLabels = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
};

const contentTypeLabels = {
  story: "Story",
  reel: "Reel",
  post: "Post",
  video: "Vidéo",
  short: "Short",
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeHttpUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function setAuthStatus(message) {
  if (authStatus) authStatus.textContent = message;
}

function setModeNotice() {
  if (!modeNotice) return;

  modeNotice.textContent =
    state.source === "supabase"
      ? "Mode réel : données chargées depuis Supabase."
      : "Mode démonstration : connecte-toi avec le compte admin ViralNight pour charger la vraie file.";
}

function getFilteredSubmissions() {
  return state.submissions.filter((submission) => {
    const matchesEstablishment = state.establishment === "all" || submission.establishment === state.establishment;
    const matchesStatus = state.status === "all" || submission.status === state.status;
    return matchesEstablishment && matchesStatus;
  });
}

function setMetric(name, value) {
  const element = document.querySelector(`[data-admin-metric="${name}"]`);
  if (element) element.textContent = numberFormatter.format(value);
}

function updateMetrics() {
  const establishments = new Set(state.submissions.map((submission) => submission.establishment));

  setMetric("pending", state.submissions.filter((submission) => submission.status === "pending").length);
  setMetric("review", state.submissions.filter((submission) => ["review", "rejected"].includes(submission.status)).length);
  setMetric("validated", state.submissions.filter((submission) => submission.status === "validated").length);
  setMetric("establishments", establishments.size);
}

function renderEstablishmentOptions() {
  const selectedValue = state.establishment;
  const establishments = [...new Set(state.submissions.map((submission) => submission.establishment))].sort();

  establishmentFilter.innerHTML =
    '<option value="all">Tous les établissements</option>' +
    establishments
      .map((establishment) => `<option value="${escapeHtml(establishment)}">${escapeHtml(establishment)}</option>`)
      .join("");

  state.establishment = establishments.includes(selectedValue) ? selectedValue : "all";
  establishmentFilter.value = state.establishment;
}

function renderTable() {
  const head = `
    <div class="admin-row admin-head">
      <span>Établissement</span>
      <span>Contenu</span>
      <span>Plateforme</span>
      <span>Vues</span>
      <span>Statut</span>
      <span>Action ViralNight</span>
    </div>
  `;

  if (state.loading) {
    table.innerHTML = `${head}<div class="empty-state">Chargement de la file Supabase...</div>`;
    return;
  }

  const rows = getFilteredSubmissions();

  if (rows.length === 0) {
    table.innerHTML = `${head}<div class="empty-state">Aucun contenu dans cette file.</div>`;
    return;
  }

  table.innerHTML =
    head +
    rows
      .map((submission) => {
        const isDone = ["validated", "rejected"].includes(submission.status);
        const contentUrl = safeHttpUrl(submission.url);
        const contentTitle = escapeHtml(submission.type);
        const contentName = contentUrl
          ? `<a href="${escapeHtml(contentUrl)}" target="_blank" rel="noreferrer"><strong>${contentTitle}</strong></a>`
          : `<strong>${contentTitle}</strong>`;

        return `
          <div class="admin-row" data-submission-id="${escapeHtml(submission.id)}">
            <strong>${escapeHtml(submission.establishment)}</strong>
            <div>
              ${contentName}
              <span>${numberFormatter.format(submission.points)} pts proposés</span>
            </div>
            <span>${escapeHtml(submission.platform)}</span>
            <span>${numberFormatter.format(submission.views)}</span>
            <span class="status ${escapeHtml(submission.status)}">${escapeHtml(statusLabels[submission.status])}</span>
            <div class="admin-actions">
              <button type="button" data-admin-action="validate" ${isDone ? "disabled" : ""}>Valider</button>
              <button type="button" data-admin-action="reject" ${isDone ? "disabled" : ""}>Rejeter</button>
            </div>
          </div>
        `;
      })
      .join("");

  attachActionHandlers();
}

function render() {
  setModeNotice();
  updateMetrics();
  renderEstablishmentOptions();
  renderTable();
}

function normalizeSubmission(row) {
  const establishment = row.establishment || row.establishments || {};
  const contentType = row.content_type || "video";
  const platform = row.platform || "instagram";

  return {
    id: row.id,
    establishment: establishment.name || "Établissement sans nom",
    platform: platformLabels[platform] || platform,
    type: contentTypeLabels[contentType] || contentType,
    views: Number(row.views_count || 0),
    points: Number(row.points_awarded || 0),
    status: row.status || "pending",
    url: row.url || "",
  };
}

function useDemoData(message) {
  state.source = "demo";
  state.loading = false;
  state.submissions = demoSubmissions.map((submission) => ({ ...submission }));
  if (message) setAuthStatus(message);
  render();
}

async function loadSupabaseSubmissions() {
  if (!supabase) {
    useDemoData("Supabase n'est pas configuré sur cette page.");
    return;
  }

  state.loading = true;
  renderTable();

  const { data, error } = await supabase
    .from("submissions")
    .select("id, platform, content_type, url, views_count, points_awarded, status, submitted_at, establishment:establishments(name, city)")
    .order("submitted_at", { ascending: false });

  if (error) {
    useDemoData("Lecture admin refusée par Supabase. Applique la migration RLS admin puis reconnecte-toi.");
    return;
  }

  state.source = "supabase";
  state.loading = false;
  state.submissions = (data || []).map(normalizeSubmission);
  setAuthStatus(`Connecté à Supabase avec ${state.session?.user?.email || ADMIN_EMAIL}.`);
  render();
}

function updateAuthUi() {
  const email = state.session?.user?.email || "";

  if (emailInput && email) emailInput.value = email;
  if (loginButton) loginButton.hidden = Boolean(state.session);
  if (logoutButton) logoutButton.hidden = !state.session;
  if (clientDashboardForm) clientDashboardForm.hidden = email.toLowerCase() !== ADMIN_EMAIL;

  if (!isSupabaseConfigured || !supabase) {
    setAuthStatus("Supabase n'est pas configuré côté front : affichage en mode démonstration.");
  } else if (state.session) {
    setAuthStatus(`Connecté avec ${email}.`);
  } else {
    setAuthStatus("Connecte-toi avec viralnight001@gmail.com pour charger les vraies validations.");
  }
}

async function updateSubmissionStatus(id, nextStatus) {
  const submission = state.submissions.find((item) => item.id === id);
  if (!submission) return;

  const previousStatus = submission.status;
  submission.status = nextStatus;
  updateMetrics();
  renderTable();

  if (state.source !== "supabase" || !supabase) return;

  const { error } = await supabase.from("submissions").update({ status: nextStatus }).eq("id", id);

  if (error) {
    submission.status = previousStatus;
    setAuthStatus("Impossible de mettre à jour Supabase : vérifie les droits admin RLS.");
    updateMetrics();
    renderTable();
    return;
  }

  setAuthStatus(nextStatus === "validated" ? "Contenu validé dans Supabase." : "Contenu rejeté dans Supabase.");
}

function attachActionHandlers() {
  document.querySelectorAll("[data-admin-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const row = button.closest("[data-submission-id]");
      const nextStatus = button.dataset.adminAction === "validate" ? "validated" : "rejected";
      updateSubmissionStatus(row?.dataset.submissionId, nextStatus);
    });
  });
}

authForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!supabase) {
    setAuthStatus("Supabase n'est pas configuré sur cette page.");
    return;
  }

  const email = emailInput.value.trim().toLowerCase();

  if (email !== ADMIN_EMAIL) {
    setAuthStatus(`Utilise le compte admin autorisé : ${ADMIN_EMAIL}.`);
    return;
  }

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: new URL("./admin.html", window.location.href).href,
    },
  });

  setAuthStatus(error ? "Impossible d'envoyer le lien de connexion admin." : "Lien de connexion envoyé par email.");
});

logoutButton?.addEventListener("click", async () => {
  if (supabase) await supabase.auth.signOut();
  state.session = null;
  updateAuthUi();
  useDemoData("Déconnecté : retour au mode démonstration.");
});

clientDashboardForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(clientDashboardForm);
  const clientEmail = String(formData.get("client_email") || "").trim().toLowerCase();

  if (!clientEmail) {
    setAuthStatus("Entre l'email owner du client à ouvrir.");
    return;
  }

  window.location.href = `./app.html?client_email=${encodeURIComponent(clientEmail)}`;
});

establishmentFilter.addEventListener("change", () => {
  state.establishment = establishmentFilter.value;
  renderTable();
});

statusFilter.addEventListener("change", () => {
  state.status = statusFilter.value;
  renderTable();
});

async function init() {
  render();
  updateAuthUi();

  if (!supabase) return;

  const {
    data: { session },
  } = await supabase.auth.getSession();

  state.session = session;
  updateAuthUi();

  if (session) {
    await loadSupabaseSubmissions();
  }

  supabase.auth.onAuthStateChange((_event, sessionState) => {
    state.session = sessionState;
    updateAuthUi();
    if (sessionState) {
      loadSupabaseSubmissions();
    } else {
      useDemoData("Déconnecté : affichage en mode démonstration.");
    }
  });
}

init();
