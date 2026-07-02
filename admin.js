const submissions = [
  {
    id: "vn-001",
    establishment: "Mirage Club Brussels",
    platform: "TikTok",
    type: "Reel dancefloor",
    views: 12800,
    points: 320,
    status: "pending",
  },
  {
    id: "vn-002",
    establishment: "La House",
    platform: "Instagram",
    type: "Story VIP",
    views: 4200,
    points: 336,
    status: "pending",
  },
  {
    id: "vn-003",
    establishment: "Pulse Room",
    platform: "YouTube",
    type: "Short ambiance",
    views: 9100,
    points: 228,
    status: "review",
  },
  {
    id: "vn-004",
    establishment: "Mirage Club Brussels",
    platform: "Instagram",
    type: "Story table",
    views: 2600,
    points: 208,
    status: "validated",
  },
  {
    id: "vn-005",
    establishment: "Neon Bar",
    platform: "TikTok",
    type: "Vidéo entrée",
    views: 6800,
    points: 170,
    status: "pending",
  },
  {
    id: "vn-006",
    establishment: "Pulse Room",
    platform: "Instagram",
    type: "Post flou",
    views: 900,
    points: 0,
    status: "rejected",
  },
];

const state = {
  submissions: [...submissions],
  establishment: "all",
  status: "all",
};

const table = document.querySelector("[data-admin-table]");
const establishmentFilter = document.querySelector("[data-filter-establishment]");
const statusFilter = document.querySelector("[data-filter-status]");
const numberFormatter = new Intl.NumberFormat("fr-FR");

const statusLabels = {
  pending: "En attente",
  review: "À revoir",
  validated: "Validé",
  rejected: "Rejeté",
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
  setMetric("review", state.submissions.filter((submission) => submission.status === "review").length);
  setMetric("validated", state.submissions.filter((submission) => submission.status === "validated").length);
  setMetric("establishments", establishments.size);
}

function renderEstablishmentOptions() {
  const establishments = [...new Set(state.submissions.map((submission) => submission.establishment))].sort();
  establishmentFilter.innerHTML =
    '<option value="all">Tous les établissements</option>' +
    establishments
      .map((establishment) => `<option value="${escapeHtml(establishment)}">${escapeHtml(establishment)}</option>`)
      .join("");
}

function renderTable() {
  const rows = getFilteredSubmissions();
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

  if (rows.length === 0) {
    table.innerHTML = `${head}<div class="empty-state">Aucun contenu dans cette file.</div>`;
    return;
  }

  table.innerHTML =
    head +
    rows
      .map((submission) => {
        const isDone = ["validated", "rejected"].includes(submission.status);
        return `
          <div class="admin-row" data-submission-id="${escapeHtml(submission.id)}">
            <strong>${escapeHtml(submission.establishment)}</strong>
            <div>
              <strong>${escapeHtml(submission.type)}</strong>
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

function attachActionHandlers() {
  document.querySelectorAll("[data-admin-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const row = button.closest("[data-submission-id]");
      const submission = state.submissions.find((item) => item.id === row?.dataset.submissionId);

      if (!submission) return;

      submission.status = button.dataset.adminAction === "validate" ? "validated" : "rejected";
      updateMetrics();
      renderTable();
    });
  });
}

function render() {
  updateMetrics();
  renderTable();
}

renderEstablishmentOptions();
render();

establishmentFilter.addEventListener("change", () => {
  state.establishment = establishmentFilter.value;
  renderTable();
});

statusFilter.addEventListener("change", () => {
  state.status = statusFilter.value;
  renderTable();
});
