import { isSupabaseConfigured, supabase } from "./supabaseClient.js";
import { computePoints, describePoints } from "./lib/points/computePoints.js";
import { evaluerFiabilite, validationRapidePossible } from "./lib/verification/customerTrust.js";

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

const prospectStorageKey = "viralnight.prospects.v1";

const state = {
  submissions: demoSubmissions.map((submission) => ({ ...submission })),
  prospects: loadProspects(),
  establishment: "all",
  status: "all",
  source: "demo",
  session: null,
  loading: false,
  prospectLoading: false,
};

const table = document.querySelector("[data-admin-table]");
const establishmentFilter = document.querySelector("[data-filter-establishment]");
const statusFilter = document.querySelector("[data-filter-status]");
const authForm = document.querySelector("[data-admin-login]");
const emailInput = document.querySelector("[data-admin-email]");
const passwordInput = document.querySelector("[data-admin-password]");
const passwordResetButton = document.querySelector("[data-admin-password-reset]");
const passwordUpdateField = document.querySelector("[data-admin-password-update]");
const newPasswordInput = document.querySelector("[data-admin-new-password]");
const passwordSaveButton = document.querySelector("[data-admin-password-save]");
const logoutButton = document.querySelector("[data-admin-logout]");
const authStatus = document.querySelector("[data-admin-auth-status]");
const clientDashboardForm = document.querySelector("[data-client-dashboard-form]");
const createClientForm = document.querySelector("[data-create-client-form]");
const clientAccessForm = document.querySelector("[data-client-access-form]");
const prospectForm = document.querySelector("[data-prospect-form]");
const prospectTable = document.querySelector("[data-prospect-table]");
const prospectStatus = document.querySelector("[data-prospect-status]");
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

function isStrongPassword(password) {
  return password.length >= 8 && /\d/.test(password);
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

function loadProspects() {
  try {
    const raw = localStorage.getItem(prospectStorageKey);
    const prospects = raw ? JSON.parse(raw) : [];
    return Array.isArray(prospects) ? prospects : [];
  } catch {
    return [];
  }
}

function saveProspects() {
  localStorage.setItem(prospectStorageKey, JSON.stringify(state.prospects.slice(0, 80)));
}

function cleanCell(value, fallback = "—") {
  const text = String(value || "").trim();
  return text ? escapeHtml(text) : `<span>${fallback}</span>`;
}

function socialCell(prospect, key) {
  const social = prospect.socials?.[key];
  const url = safeHttpUrl(social?.url);

  if (!url) return "<span>Non trouvé</span>";

  const confidence = social.confidence || "moyenne";
  const followers = social.followers ? `${numberFormatter.format(social.followers)} abonnés` : "abonnés non publics";

  return `
    <a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(new URL(url).hostname.replace(/^www\./, ""))}</a>
    <small>Confiance ${escapeHtml(confidence)} · ${escapeHtml(followers)}</small>
  `;
}

function linkCell(url, label = "Ouvrir") {
  const safeUrl = safeHttpUrl(url);
  return safeUrl ? `<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>` : "<span>Non trouvé</span>";
}

function scoreClass(score) {
  if (score >= 75) return "high";
  if (score >= 50) return "medium";
  return "low";
}

function capacitySourceCell(prospect) {
  const url = safeHttpUrl(prospect.capacity_source);
  const confidence = prospect.capacity_confidence ? `Confiance ${prospect.capacity_confidence}` : "";

  if (url) {
    return `
      <a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">Source</a>
      ${confidence ? `<small>${escapeHtml(confidence)}</small>` : ""}
    `;
  }

  return cleanCell(prospect.capacity_source || "Non trouvée");
}

function activityCell(prospect) {
  const activity = prospect.social_activity || "faible";
  const contentTypes = Array.isArray(prospect.content_types) && prospect.content_types.length > 0
    ? prospect.content_types.join(", ")
    : "contenu non confirmé";

  return `${escapeHtml(activity)}<small>Contenu : ${escapeHtml(contentTypes)}</small>`;
}

function renderProspects() {
  if (!prospectTable) return;

  if (state.prospectLoading) {
    prospectTable.innerHTML = '<tr><td colspan="19">Qualification en cours...</td></tr>';
    return;
  }

  if (state.prospects.length === 0) {
    prospectTable.innerHTML = '<tr><td colspan="19">Aucun club qualifié pour le moment.</td></tr>';
    return;
  }

  prospectTable.innerHTML = state.prospects
    .map((prospect) => {
      const score = Number(prospect.score || 0);
      const capacityMax = prospect.capacity_max ? `${numberFormatter.format(prospect.capacity_max)} pers.` : "Non trouvée";

      return `
        <tr>
          <td><strong>${cleanCell(prospect.club)}</strong></td>
          <td>${cleanCell(prospect.city)}</td>
          <td>${cleanCell(prospect.address)}</td>
          <td>${linkCell(prospect.site, "Site")}</td>
          <td>${cleanCell(prospect.email, "Non trouvé")}</td>
          <td>${cleanCell(prospect.phone, "Non trouvé")}</td>
          <td>${socialCell(prospect, "instagram")}</td>
          <td>${socialCell(prospect, "tiktok")}</td>
          <td>${socialCell(prospect, "facebook")}</td>
          <td>${socialCell(prospect, "linkedin")}</td>
          <td>${socialCell(prospect, "youtube")}</td>
          <td>${escapeHtml(capacityMax)}</td>
          <td>${cleanCell(prospect.capacity_type || "inconnue")}</td>
          <td>${capacitySourceCell(prospect)}</td>
          <td>${cleanCell(prospect.size_category || "inconnue")}</td>
          <td>${activityCell(prospect)}</td>
          <td><span class="score-pill ${scoreClass(score)}">${score}/100</span></td>
          <td>${cleanCell(prospect.message)}</td>
          <td><span class="confidence-pill ${scoreClass(score)}">${cleanCell(prospect.status)}</span></td>
        </tr>
      `;
    })
    .join("");
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
  if (!establishmentFilter) return;

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
  if (!table) return;

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
          <div class="admin-entry" data-submission-id="${escapeHtml(submission.id)}">
          <div class="admin-row">
            <strong>${escapeHtml(submission.establishment)}</strong>
            <div>
              ${contentName}
              <span>${numberFormatter.format(submission.points)} pts proposés</span>
            </div>
            <span>${escapeHtml(submission.platform)}</span>
            <div class="admin-views">
              <input
                type="number"
                min="0"
                step="100"
                inputmode="numeric"
                data-views-input
                value="${submission.views || submission.declaredViews || ""}"
                placeholder="Vues reelles"
                aria-label="Nombre de vues verifie"
                ${isDone ? "disabled" : ""}
              />
              ${
                // Affiche seulement s'il y a une declaration reelle ET differente du constat.
                // Un test sur !== null laissait passer undefined et affichait "NaN".
                Number.isFinite(submission.declaredViews) && submission.declaredViews > 0
                && submission.declaredViews !== submission.views
                  ? `<small data-declared>Annonce par le client : ${numberFormatter.format(submission.declaredViews)}</small>`
                  : ""
              }
              <small data-points-preview>${escapeHtml(pointsPreviewFor(submission))}</small>
            </div>
            <span class="status ${escapeHtml(submission.status)}">${escapeHtml(statusLabels[submission.status])}</span>
            <div class="admin-actions">
              <span class="admin-trust is-inconnu" data-trust></span>
              <button type="button" class="admin-quick" data-quick-validate hidden></button>
              <button type="button" data-admin-action="validate" ${isDone ? "disabled" : ""}>Valider</button>
              <button type="button" data-admin-action="reject" ${isDone ? "disabled" : ""}>Rejeter</button>
            </div>
          </div>
          <div class="admin-preview" data-preview></div>
          </div>
        `;
      })
      .join("");

  attachActionHandlers();
  primePointRules();
  chargerFiabilites();
}

function render() {
  setModeNotice();
  updateMetrics();
  renderEstablishmentOptions();
  renderTable();
  renderProspects();
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
    declaredViews: row.declared_views === null || row.declared_views === undefined ? null : Number(row.declared_views),
    points: Number(row.points_awarded || 0),
    status: row.status || "pending",
    url: row.url || "",
    establishmentId: row.establishment_id || null,
    customerId: row.customer_id || null,
    contentType,
    source: row.source || "staff",
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
    .select("id, establishment_id, customer_id, platform, content_type, url, views_count, declared_views, points_awarded, status, submitted_at, source, establishment:establishments(name, city)")
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

  // Une fois connecte, un formulaire de connexion n'a plus rien a dire.
  // Il restait a l'ecran avec ses deux champs, au milieu des outils de
  // travail — de l'attention prise pour rien, sur la page qui sert
  // maintenant a crediter tous les clubbeurs.
  const champsConnexion = [emailInput, passwordInput]
    .map((champ) => champ?.closest("label"))
    .filter(Boolean);
  for (const champ of champsConnexion) champ.hidden = Boolean(state.session);
  if (clientDashboardForm) clientDashboardForm.hidden = email.toLowerCase() !== ADMIN_EMAIL;
  if (createClientForm) createClientForm.hidden = email.toLowerCase() !== ADMIN_EMAIL;
  if (clientAccessForm) clientAccessForm.hidden = email.toLowerCase() !== ADMIN_EMAIL;
  if (prospectStatus) {
    prospectStatus.textContent =
      email.toLowerCase() === ADMIN_EMAIL
        ? "Prêt : ajoute un club et son site officiel pour lancer la qualification."
        : "Connecte-toi en admin pour lancer une qualification.";
  }

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

  // Une validation credite le client : elle doit enregistrer les vues verifiees
  // et les points correspondants. Sans cela le contenu passe "valide" avec 0 vue
  // et 0 point, et aucune statistique ne peut etre calculee.
  const miseAJour = { status: nextStatus };

  if (nextStatus === "validated") {
    const rules = await loadPointRules(submission.establishmentId);
    const { points } = computePoints({
      views: submission.views,
      contentType: submission.contentType,
      rules,
    });
    miseAJour.views_count = submission.views;
    miseAJour.points_awarded = points;
    submission.points = points;
  }

  const { error } = await supabase.from("submissions").update(miseAJour).eq("id", id);

  if (error) {
    submission.status = previousStatus;
    setAuthStatus("Impossible de mettre à jour Supabase : vérifie les droits admin RLS.");
    updateMetrics();
    renderTable();
    return;
  }

  // ⚠️ LE CLUBBEUR VIT DANS L'AUTRE BASE. Mettre `status = validated`
  // ici ne lui donne rien : ses points sont dans le projet Supabase de
  // la PWA. Depuis que la validation est centralisee sur ce site, c'est
  // ce pont qui remplace l'ecran « A valider » de la console gerant.
  //
  // Un echec du pont ne doit PAS annuler la validation cote B2B : le
  // contenu a bien ete verifie. On le dit, et on laisse rejouer.
  const credit = await crediterClubbeur(id, nextStatus === "validated", submission);

  setAuthStatus(
    nextStatus === "validated"
      ? `Contenu validé : ${numberFormatter.format(submission.views)} vues, ${numberFormatter.format(submission.points)} pts crédités.${credit}`
      : `Contenu rejeté dans Supabase.${credit}`,
  );
}

/**
 * Repercute la decision sur le compte du clubbeur, dans la base de la PWA.
 *
 * Renvoie un complement de message, jamais une exception : le pont est un
 * effet de bord de la validation, pas sa condition.
 */
async function crediterClubbeur(submissionId, approuve, submission) {
  try {
    const { data } = await supabase.auth.getSession();
    const jeton = data?.session?.access_token;
    if (!jeton) return "";

    const reponse = await fetch("/api/credit-clubbeur", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${jeton}` },
      body: JSON.stringify({
        submissionId,
        approve: approuve,
        points: approuve ? submission.points : null,
        views: approuve ? submission.views : null,
      }),
    });

    const sortie = await reponse.json().catch(() => ({}));

    if (!reponse.ok) return ` ⚠️ Points non crédités au clubbeur : ${sortie.error || reponse.status}.`;
    if (sortie.skipped === "sans_origine_pwa") return "";
    if (sortie.skipped === "deja_credite") return " (clubbeur déjà crédité)";
    return ` Clubbeur crédité de ${numberFormatter.format(sortie.awarded || 0)} pts.`;
  } catch (error) {
    return ` ⚠️ Pont vers l'app clubbeur injoignable : ${error.message}`;
  }
}

/**
 * Baremes par etablissement, charges a la demande.
 *
 * Chaque club a son propre bareme : valider un contenu sans le bareme du bon
 * etablissement crediterait un nombre de points errone.
 */
const pointRulesCache = new Map();

const DEFAULT_POINT_RULES = {
  videoViewsPerThousand: 25,
  storyViewsPerThousand: 80,
  viralBonus: 90,
};

async function loadPointRules(establishmentId) {
  if (!establishmentId) return { ...DEFAULT_POINT_RULES };
  if (pointRulesCache.has(establishmentId)) return pointRulesCache.get(establishmentId);

  let regles = { ...DEFAULT_POINT_RULES };

  if (supabase && state.source === "supabase") {
    const { data } = await supabase
      .from("establishment_point_rules")
      .select("video_views_per_thousand, story_views_per_thousand, viral_bonus")
      .eq("establishment_id", establishmentId)
      .maybeSingle();

    if (data) {
      regles = {
        videoViewsPerThousand: Number(data.video_views_per_thousand ?? DEFAULT_POINT_RULES.videoViewsPerThousand),
        storyViewsPerThousand: Number(data.story_views_per_thousand ?? DEFAULT_POINT_RULES.storyViewsPerThousand),
        viralBonus: Number(data.viral_bonus ?? DEFAULT_POINT_RULES.viralBonus),
      };
    }
  }

  pointRulesCache.set(establishmentId, regles);
  return regles;
}

/** Bareme deja en cache, pour un affichage synchrone pendant la frappe. */
function cachedRules(establishmentId) {
  return pointRulesCache.get(establishmentId) || { ...DEFAULT_POINT_RULES };
}

function pointsPreviewFor(submission, viewsOverride) {
  const vues = viewsOverride === undefined ? (submission.views || submission.declaredViews || 0) : viewsOverride;
  if (!vues) return "Saisis les vues pour calculer les points";
  return describePoints({
    views: vues,
    contentType: submission.contentType,
    rules: cachedRules(submission.establishmentId),
  });
}

/** Prepare les baremes des contenus affiches, puis rafraichit les apercus. */
async function primePointRules() {
  const ids = [...new Set(state.submissions.map((s) => s.establishmentId).filter(Boolean))];
  await Promise.all(ids.map(loadPointRules));

  document.querySelectorAll("[data-submission-id]").forEach((row) => {
    const submission = state.submissions.find((s) => s.id === row.dataset.submissionId);
    const apercu = row.querySelector("[data-points-preview]");
    if (submission && apercu) apercu.textContent = pointsPreviewFor(submission);
  });
}

/**
 * Fiabilite des clients, calculee sur leur historique de declarations.
 * Un client regulierement exact peut etre valide en un clic : c'est le seul moyen
 * de reduire le travail sur Instagram et TikTok, ou aucune API ne donne les vues.
 */
const fiabiliteParClient = new Map();

async function chargerFiabilites() {
  if (state.source !== "supabase" || !supabase) return;

  const clients = [...new Set(state.submissions.map((s) => s.customerId).filter(Boolean))];
  const inconnus = clients.filter((id) => !fiabiliteParClient.has(id));
  if (!inconnus.length) return rafraichirFiabilites();

  const { data } = await supabase
    .from("submissions")
    .select("customer_id, declared_views, views_count, status")
    .in("customer_id", inconnus);

  const parClient = new Map();
  for (const ligne of data || []) {
    if (!parClient.has(ligne.customer_id)) parClient.set(ligne.customer_id, []);
    parClient.get(ligne.customer_id).push(ligne);
  }

  for (const id of inconnus) {
    fiabiliteParClient.set(id, evaluerFiabilite(parClient.get(id) || []));
  }

  rafraichirFiabilites();
}

const LIBELLES_FIABILITE = {
  fiable: "Client fiable",
  a_surveiller: "A verifier",
  inconnu: "Nouveau client",
};

/** Injecte l'indicateur de fiabilite dans les lignes deja affichees. */
function rafraichirFiabilites() {
  document.querySelectorAll("[data-submission-id]").forEach((row) => {
    const submission = state.submissions.find((s) => s.id === row.dataset.submissionId);
    const cible = row.querySelector("[data-trust]");
    if (!submission || !cible) return;

    const fiabilite = fiabiliteParClient.get(submission.customerId);
    if (!fiabilite) return;

    cible.className = `admin-trust is-${fiabilite.niveau}`;
    cible.textContent = LIBELLES_FIABILITE[fiabilite.niveau];
    cible.title = fiabilite.libelle;

    // Le bouton de validation rapide n'apparait que pour un client fiable
    // ayant declare ses vues : il reprend sa declaration telle quelle.
    const rapide = row.querySelector("[data-quick-validate]");
    if (rapide) {
      const possible = validationRapidePossible(fiabilite) && submission.declaredViews > 0;
      rapide.hidden = !possible;
      if (possible) rapide.textContent = `Valider ${numberFormatter.format(submission.declaredViews)} vues`;
    }
  });
}

/**
 * Apercu de la publication : miniature, auteur, et vues reelles quand la plateforme
 * les expose. Evite d'ouvrir l'application pour chaque contenu a verifier.
 */
async function chargerApercu(row, submission) {
  const cible = row.querySelector("[data-preview]");
  if (!cible || cible.dataset.charge) return;
  cible.dataset.charge = "1";
  cible.textContent = "Verification...";

  try {
    const { data } = await supabase.auth.getSession();
    const jeton = data?.session?.access_token;
    if (!jeton) throw new Error("session absente");

    const reponse = await fetch(`/api/preview-link?url=${encodeURIComponent(submission.url)}`, {
      headers: { Authorization: `Bearer ${jeton}` },
    });
    const apercu = await reponse.json();

    if (!reponse.ok) {
      cible.textContent = apercu.error || "Verification impossible.";
      return;
    }

    const morceaux = [];
    if (apercu.auteur) morceaux.push(`<strong>${escapeHtml(apercu.auteur)}</strong>`);
    if (apercu.vuesAutomatiques) {
      morceaux.push(`<em>${numberFormatter.format(apercu.vues)} vues verifiees</em>`);
    }
    if (apercu.note) morceaux.push(`<small>${escapeHtml(apercu.note)}</small>`);

    cible.innerHTML = [
      apercu.miniature
        ? `<img src="${escapeHtml(apercu.miniature)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`
        : "",
      `<span>${morceaux.join(" ")}</span>`,
    ].join("");

    // Vues officielles disponibles : on prerempli, le staff n'a plus qu'a valider.
    if (apercu.vuesAutomatiques) {
      const champ = row.querySelector("[data-views-input]");
      if (champ && !champ.disabled) {
        champ.value = apercu.vues;
        champ.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }
  } catch (error) {
    cible.textContent = "Verification impossible.";
  }
}

function attachActionHandlers() {
  document.querySelectorAll("[data-admin-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const row = button.closest("[data-submission-id]");
      const nextStatus = button.dataset.adminAction === "validate" ? "validated" : "rejected";
      const submission = state.submissions.find((item) => item.id === row?.dataset.submissionId);

      if (nextStatus === "validated") {
        const saisie = Number(row?.querySelector("[data-views-input]")?.value || 0);
        if (!saisie) {
          setAuthStatus("Saisis le nombre de vues verifie avant de valider : sans vues, aucun point ne peut etre credite.");
          row?.querySelector("[data-views-input]")?.focus();
          return;
        }
        if (submission) submission.views = Math.max(0, Math.round(saisie));
      }

      updateSubmissionStatus(row?.dataset.submissionId, nextStatus);
    });
  });

  // Validation rapide : reprend la declaration d'un client fiable sans recomptage.
  document.querySelectorAll("[data-quick-validate]").forEach((bouton) => {
    bouton.addEventListener("click", () => {
      const row = bouton.closest("[data-submission-id]");
      const submission = state.submissions.find((item) => item.id === row?.dataset.submissionId);
      if (!submission?.declaredViews) return;

      submission.views = submission.declaredViews;
      updateSubmissionStatus(submission.id, "validated");
    });
  });

  // Apercus charges apres le rendu : ce sont des appels reseau, ils ne doivent pas
  // retarder l'affichage de la file.
  document.querySelectorAll("[data-submission-id]").forEach((row) => {
    const submission = state.submissions.find((item) => item.id === row.dataset.submissionId);
    if (submission?.url && state.source === "supabase") chargerApercu(row, submission);
  });

  // Apercu recalcule pendant la frappe : le staff voit le total credite
  // avant de cliquer, plutot que de le decouvrir apres.
  document.querySelectorAll("[data-views-input]").forEach((input) => {
    input.addEventListener("input", () => {
      const row = input.closest("[data-submission-id]");
      const submission = state.submissions.find((item) => item.id === row?.dataset.submissionId);
      const apercu = row?.querySelector("[data-points-preview]");
      if (submission && apercu) {
        apercu.textContent = pointsPreviewFor(submission, Number(input.value || 0));
      }
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
  const password = passwordInput?.value || "";
  const newPassword = newPasswordInput?.value || "";

  if (newPassword) {
    if (!isStrongPassword(newPassword)) {
      setAuthStatus("Le nouveau mot de passe doit contenir au moins 8 caractères et 1 chiffre.");
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      setAuthStatus("Impossible d'enregistrer le nouveau mot de passe admin.");
      return;
    }

    authForm.reset();
    if (passwordUpdateField) passwordUpdateField.hidden = true;
    if (passwordSaveButton) passwordSaveButton.hidden = true;
    setAuthStatus("Mot de passe admin enregistré. Tu peux te connecter.");
    return;
  }

  if (email !== ADMIN_EMAIL) {
    setAuthStatus(`Utilise le compte admin autorisé : ${ADMIN_EMAIL}.`);
    return;
  }

  if (!password) {
    setAuthStatus("Entre le mot de passe admin.");
    return;
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    setAuthStatus("Connexion admin impossible. Vérifie l'email et le mot de passe.");
    return;
  }

  authForm.reset();
  setAuthStatus("Connexion admin réussie.");
});

passwordResetButton?.addEventListener("click", async () => {
  if (!supabase) {
    setAuthStatus("Supabase n'est pas configuré sur cette page.");
    return;
  }

  const email = emailInput.value.trim().toLowerCase();

  if (email !== ADMIN_EMAIL) {
    setAuthStatus(`Entre d'abord le compte admin autorisé : ${ADMIN_EMAIL}.`);
    return;
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: new URL("./admin.html", window.location.href).href,
  });

  setAuthStatus(error ? "Impossible d'envoyer l'email de mot de passe admin." : "Lien envoyé. Ouvre l'email, puis enregistre le nouveau mot de passe admin.");
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
    setAuthStatus("Entre l'email du club à ouvrir.");
    return;
  }

  window.location.href = `./app.html?client_email=${encodeURIComponent(clientEmail)}`;
});

createClientForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!supabase || !state.session?.access_token) {
    setAuthStatus("Connecte-toi en admin avant de créer un client.");
    return;
  }

  const formData = new FormData(createClientForm);
  const payload = {
    establishment_name: String(formData.get("establishment_name") || "").trim(),
    owner_email: String(formData.get("owner_email") || "").trim().toLowerCase(),
    city: String(formData.get("city") || "").trim(),
    subscription_status: String(formData.get("subscription_status") || "essai").trim(),
    category: "club",
  };

  if (!payload.establishment_name || !payload.owner_email) {
    setAuthStatus("Ajoute au minimum le nom du club et son email.");
    return;
  }

  setAuthStatus("Création du client en cours...");

  const response = await fetch("/api/create-client", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${state.session.access_token}`,
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    setAuthStatus(`Impossible de créer le client : ${result.error || response.statusText}`);
    return;
  }

  createClientForm.reset();
  setAuthStatus(
    result.password_email_sent
      ? `Client créé. Email de création du mot de passe envoyé à ${result.owner_email}.`
      : `Client créé, mais l'email de mot de passe n'a pas été envoyé : ${result.warning || "à vérifier"}.`,
  );
});

clientAccessForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!supabase || !state.session?.access_token) {
    setAuthStatus("Connecte-toi en admin avant de modifier l'accès.");
    return;
  }

  const formData = new FormData(clientAccessForm);
  const payload = {
    owner_email: String(formData.get("owner_email") || "").trim().toLowerCase(),
    subscription_status: String(formData.get("subscription_status") || "essai").trim(),
  };

  if (!payload.owner_email) {
    setAuthStatus("Ajoute l'email du client à modifier.");
    return;
  }

  setAuthStatus("Mise à jour de l'accès client...");

  const response = await fetch("/api/update-client-status", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${state.session.access_token}`,
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    setAuthStatus(`Impossible de modifier l'accès : ${result.error || response.statusText}`);
    return;
  }

  setAuthStatus(`Accès mis à jour : ${result.establishment_name} est maintenant ${result.subscription_status}.`);
});

prospectForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!state.session?.access_token) {
    if (prospectStatus) prospectStatus.textContent = "Connecte-toi en admin avant de qualifier un club.";
    return;
  }

  const formData = new FormData(prospectForm);
  const payload = {
    club: String(formData.get("club") || "").trim(),
    city: String(formData.get("city") || "").trim(),
    address: String(formData.get("address") || "").trim(),
    site: String(formData.get("site") || "").trim(),
    email: String(formData.get("email") || "").trim().toLowerCase(),
    phone: String(formData.get("phone") || "").trim(),
    socials: {
      instagram: String(formData.get("instagram") || "").trim(),
      tiktok: String(formData.get("tiktok") || "").trim(),
      facebook: String(formData.get("facebook") || "").trim(),
      linkedin: String(formData.get("linkedin") || "").trim(),
      youtube: String(formData.get("youtube") || "").trim(),
    },
  };

  if (!payload.club) {
    if (prospectStatus) prospectStatus.textContent = "Ajoute au minimum le nom du club.";
    return;
  }

  state.prospectLoading = true;
  renderProspects();
  if (prospectStatus) prospectStatus.textContent = "Qualification en cours : site, réseaux, capacité et score...";

  const response = await fetch("/api/qualify-club", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${state.session.access_token}`,
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json().catch(() => ({}));
  state.prospectLoading = false;

  if (!response.ok) {
    renderProspects();
    if (prospectStatus) prospectStatus.textContent = `Qualification impossible : ${result.error || response.statusText}`;
    return;
  }

  state.prospects = [result.prospect, ...state.prospects].filter(Boolean);
  saveProspects();
  renderProspects();
  prospectForm.reset();
  if (prospectStatus) prospectStatus.textContent = `Club qualifié : ${result.prospect.club} · score ${result.prospect.score}/100.`;
});

// Optionnel : absent de admin-prospection.html, qui n'a pas de file de
// contenus a filtrer. Sans le ?., ce module entier plantait au chargement
// sur cette page (throw synchrone = plus rien ne s'executait apres, pas
// meme la connexion admin).
establishmentFilter?.addEventListener("change", () => {
  state.establishment = establishmentFilter.value;
  renderTable();
});

// Meme raison que establishmentFilter juste au-dessus : absent sur
// admin-prospection.html.
statusFilter?.addEventListener("change", () => {
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

  supabase.auth.onAuthStateChange((event, sessionState) => {
    state.session = sessionState;
    updateAuthUi();
    if (event === "PASSWORD_RECOVERY" && passwordUpdateField) {
      passwordUpdateField.hidden = false;
      if (passwordSaveButton) passwordSaveButton.hidden = false;
      setAuthStatus("Enregistre le nouveau mot de passe admin ci-dessous.");
    }
    if (sessionState) {
      loadSupabaseSubmissions();
    } else {
      useDemoData("Déconnecté : affichage en mode démonstration.");
    }
  });
}

init();
