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
const instagramBanner = document.querySelector("[data-instagram-banner]");
const instagramSubtitle = document.querySelector("[data-instagram-subtitle]");
const instagramBody = document.querySelector("[data-instagram-body]");
const INITIAL_REWARD_COUNT = 5;
// Choisit l'illustration generique affichee dans la boutique de la PWA
// clubbeur : un gerant qui cree "Shot cadeau anniversaire" n'a pas de dessin
// sur-mesure, seulement une famille. Memes trois valeurs que les filtres et
// halos de couleur de la boutique — ne pas en ajouter une quatrieme sans
// aussi l'ajouter la-bas.
const REWARD_CATEGORIES = [
  { value: "bar", label: "Bar" },
  { value: "acces", label: "Accès" },
  { value: "vip", label: "VIP" },
];
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

// Remplit TOUS les elements correspondants, pas seulement le premier : le
// nom de l'etablissement est affiche a deux endroits (barre laterale et
// barre du haut), et un querySelector simple en laissait un sur "—".
function setText(selector, value) {
  document.querySelectorAll(selector).forEach((element) => {
    element.textContent = value;
  });
}

function updateMetric(name, value, caption) {
  const metric = document.querySelector(`[data-metric="${name}"]`);
  if (!metric) return;

  const valeur = metric.querySelector(".kpi-value");
  const legende = metric.querySelector(".kpi-sub");

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

  // ⚠️ L'administrateur n'a pas de tableau de bord a lui : il consulte
  // celui d'un client, choisi depuis le back-office. Arrive ici sans
  // client selectionne — typiquement au retour d'une connexion Google,
  // dont l'adresse de retour est figee et ne peut pas dependre de
  // l'email —, on l'envoie ou il voulait aller.
  if (data.reason === "admin_select_client") {
    window.location.replace("./admin.html");
    return false;
  }

  // La connexion Google renvoie TOUJOURS ici, meme a la toute premiere
  // creation de compte (l'adresse de retour OAuth est figee, elle ne peut
  // pas dependre de savoir a l'avance si le compte existe deja) — contrairement
  // a l'inscription par email/mot de passe, qui passe par bienvenue.html avant
  // d'arriver la (voir inscription() dans auth.js). Un compte tout juste cree
  // se reconnait a `created_at` et `last_sign_in_at` quasi identiques ; sur un
  // compte existant, last_sign_in_at est recent mais created_at est ancien.
  // Le sessionStorage garantit un seul passage par onglet, et sert aussi de
  // garde-fou pour l'inscription email/mot de passe : bienvenue.html y pose
  // le meme drapeau avant de rediriger ici, pour ne pas montrer l'ecran deux
  // fois quand on clique "Aller a mon tableau de bord".
  const utilisateur = data.session?.user;
  if (utilisateur?.created_at && utilisateur?.last_sign_in_at) {
    const ecartMs = new Date(utilisateur.last_sign_in_at) - new Date(utilisateur.created_at);
    const compteTouTNeuf = ecartMs >= 0 && ecartMs < 120_000;
    let dejaVu = true;
    try {
      dejaVu = sessionStorage.getItem("vn:bienvenue-vue") === "1";
    } catch {
      // Navigation privee : sessionStorage peut lever. On considere alors
      // l'ecran comme deja vu plutot que de risquer une boucle infinie.
    }
    if (compteTouTNeuf && !dejaVu) {
      try {
        sessionStorage.setItem("vn:bienvenue-vue", "1");
      } catch {
        // Idem : l'echec de memorisation ne doit pas bloquer la redirection.
      }
      window.location.replace("./bienvenue.html");
      return false;
    }
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

/**
 * Reach, activite, repartition par format, top clients.
 *
 * Meme grammaire visuelle que simulateur.html (graphique, flux, barres de
 * repartition, classement) : Julien voulait "pareil que le simulateur, sauf
 * que les donnees viennent apres". Toutes les fonctions ci-dessous lisent
 * dashboardState.submissions, les vraies soumissions de l'etablissement --
 * aucune ne genere de valeur inventee. Etat honnete si rien n'existe encore.
 *
 * Limite assumee : submissions n'a qu'un customer_id (uuid), aucune table
 * ne relie un client a un pseudo ou un compte Instagram reel. "Top clients"
 * affiche donc un identifiant anonymise, jamais un faux @handle.
 */

const AVATAR_PAIRS = [
  ["#333333", "#1a1a1a"],
  ["#292929", "#141414"],
  ["#2b2b2b", "#161616"],
  ["#363636", "#1c1c1c"],
  ["#2e2e2e", "#171717"],
  ["#303030", "#181818"],
];

const LABEL_PLATEFORME = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
};

function hashCode(value) {
  let hash = 0;
  for (const car of String(value)) hash = (hash * 31 + car.charCodeAt(0)) | 0;
  return hash;
}

function shortCustomerLabel(customerId) {
  if (!customerId) return "Client anonyme";
  return `Client ${String(customerId).replace(/-/g, "").slice(-4).toUpperCase()}`;
}

function avatarInitials(label) {
  const car = label.match(/[A-Z0-9]/g) || [];
  return car.slice(-2).join("") || "??";
}

function avatarPairFor(seed) {
  return AVATAR_PAIRS[Math.abs(hashCode(seed)) % AVATAR_PAIRS.length];
}

function labelPlateforme(platform) {
  return LABEL_PLATEFORME[String(platform || "").toLowerCase()] || "Autre";
}

/* Chemin lisse facon Catmull-Rom -> bezier cubique, repris tel quel de
   simulateur.html : une courbe douce plutot que des segments droits. */
function smoothLine(points) {
  if (points.length < 2) return points.length ? `M ${points[0][0]} ${points[0][1]}` : "";
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${p2[0]} ${p2[1]}`;
  }
  return d;
}

function getReachSeries(stats, nbJours = 7) {
  // Cle en date UTC pure des deux cotes (aujourd'hui inclus, calcule sans
  // passer par un minuit LOCAL) : submitted_at vient de Postgres deja en
  // UTC, et le slice(0,10) direct sur sa chaine ISO donne sa date UTC. Une
  // premiere version calait "aujourd'hui" sur minuit local puis relisait sa
  // date via toISOString() -- en UTC+1/+2 (Belgique), minuit local tombe la
  // veille en UTC, ce qui decalait tout le graphique d'un jour. Limite
  // assumee : un jour = un jour calendaire UTC, pas la nuit d'ouverture du
  // club (qui peut deborder sur le lendemain matin, geree ailleurs par
  // lib/scheduling) -- une simplification correcte pour une vue sur 7 jours.
  const dates = [];
  for (let i = nbJours - 1; i >= 0; i--) {
    dates.push(new Date(Date.now() - i * 86_400_000));
  }

  const vuesParJour = new Map(dates.map((jour) => [jour.toISOString().slice(0, 10), 0]));

  for (const submission of stats.validated) {
    const cle = String(submission.submitted_at || "").slice(0, 10);
    if (vuesParJour.has(cle)) {
      vuesParJour.set(cle, vuesParJour.get(cle) + Number(submission.views_count || 0));
    }
  }

  // Le libelle du jour est recalcule depuis la MEME cle UTC (et non depuis
  // l'instant `jour`, interprete en heure locale) : entre 00h et 2h du
  // matin en Belgique -- les heures de pointe d'un club -- le jour local a
  // deja change mais le jour UTC pas encore, ce qui aurait affiche le
  // mauvais nom de jour au-dessus de la bonne valeur.
  return {
    labels: dates.map((jour) => {
      const cle = jour.toISOString().slice(0, 10);
      return new Date(`${cle}T00:00:00Z`)
        .toLocaleDateString("fr-FR", { weekday: "short", timeZone: "UTC" })
        .replace(".", "")
        .toUpperCase();
    }),
    values: dates.map((jour) => vuesParJour.get(jour.toISOString().slice(0, 10)) || 0),
  };
}

function renderReachChart(stats) {
  const plotContainer = document.querySelector("[data-reach-chart]");
  const xAxis = document.querySelector("[data-reach-chart-x]");
  if (!plotContainer) return;

  const { labels, values } = getReachSeries(stats, 7);
  plotContainer.innerHTML = "";
  if (xAxis) xAxis.innerHTML = "";

  const total = values.reduce((somme, v) => somme + v, 0);
  if (!total) {
    plotContainer.innerHTML =
      '<p class="chart-empty">Aucune vue validée sur les 7 derniers jours. Le graphique se remplit dès la première publication validée.</p>';
    return;
  }

  const max = Math.max(...values, 1);

  [0, 0.5, 1].forEach((fraction) => {
    const gridline = document.createElement("div");
    gridline.className = "gridline";
    gridline.style.bottom = `${fraction * 100}%`;
    gridline.innerHTML = `<span class="gl">${formatNumber(Math.round(max * fraction))}</span>`;
    plotContainer.appendChild(gridline);
  });

  const points = values.map((value, index) => {
    const x = values.length > 1 ? (index / (values.length - 1)) * 1000 : 500;
    const y = 260 - (value / max) * 260;
    return [Math.round(x), Math.round(y)];
  });
  const lignePath = smoothLine(points);
  const dernier = points[points.length - 1];
  const airePath = `${lignePath} L ${dernier[0]} 260 L ${points[0][0]} 260 Z`;

  const plot = document.createElement("div");
  plot.className = "c-plot";
  plot.innerHTML = `
    <svg class="c-svg" viewBox="0 0 1000 260" preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id="reachGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ff6363" stop-opacity=".18"/>
        <stop offset="1" stop-color="#ff6363" stop-opacity="0"/>
      </linearGradient></defs>
      <path class="c-area" fill="url(#reachGrad)" d="${airePath}"/>
      <path class="c-line" d="${lignePath}"/>
    </svg>
  `;
  points.forEach(([x, y], index) => {
    const dot = document.createElement("div");
    dot.className = `c-dot${index === points.length - 1 ? " live" : ""}`;
    dot.style.left = `${values.length > 1 ? (index / (values.length - 1)) * 100 : 50}%`;
    dot.style.bottom = `${((260 - y) / 260) * 100}%`;
    dot.title = `${labels[index]} : ${formatNumber(values[index])} vues`;
    plot.appendChild(dot);
  });
  plotContainer.appendChild(plot);

  if (xAxis) {
    labels.forEach((label, index) => {
      const tick = document.createElement("span");
      if (index === labels.length - 1) tick.classList.add("live");
      tick.innerHTML = `<b class="xval">${formatNumber(values[index])}</b>${escapeHtml(label)}`;
      xAxis.appendChild(tick);
    });
  }
}

function renderActivityFeed(stats) {
  const container = document.querySelector("[data-activity-feed]");
  if (!container) return;

  const recentes = [...stats.submissions]
    .sort((a, b) => new Date(b.submitted_at || 0) - new Date(a.submitted_at || 0))
    .slice(0, 6);

  if (!recentes.length) {
    container.innerHTML = '<p class="chart-empty">Aucun contenu depose pour l\'instant.</p>';
    return;
  }

  const STATUT_TAG = {
    validated: { texte: "VALIDÉ", warm: false },
    pending: { texte: "EN ATTENTE", warm: false },
    review: { texte: "À REVOIR", warm: true },
    rejected: { texte: "REJETÉ", warm: true },
  };

  container.innerHTML = recentes
    .map((submission) => {
      const label = shortCustomerLabel(submission.customer_id);
      const [a, b] = avatarPairFor(submission.customer_id || submission.id);
      const tag = STATUT_TAG[submission.status] || { texte: submission.status || "—", warm: false };
      const heure = submission.submitted_at
        ? new Date(submission.submitted_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
        : "—";
      const points = submission.status === "validated" ? `+${formatNumber(submission.points_awarded || 0)}` : "—";

      return `
        <div class="feed-item">
          <div class="fi-ava" style="--a:${a};--b:${b}">${escapeHtml(avatarInitials(label))}</div>
          <div class="fi-main">
            <div class="fi-top">
              <span class="fi-handle">${escapeHtml(label)}</span>
              <span class="fi-tag${tag.warm ? " warm" : ""}">${escapeHtml(tag.texte)}</span>
            </div>
            <div class="fi-sub">${escapeHtml(labelPlateforme(submission.platform))} · ${escapeHtml(formatNumber(submission.views_count || 0))} vues</div>
          </div>
          <div class="fi-right">
            <span class="fi-pts${submission.status !== "validated" ? " neg" : ""}">${escapeHtml(points)}</span>
            <span class="fi-time">${escapeHtml(heure)}</span>
          </div>
        </div>`;
    })
    .join("");
}

// Onglet "Contenu" : l'historique COMPLET (pas les 6 derniers comme
// "Activité récente") -- Julien voulait voir tout ce qu'un club a genere
// depuis son inscription. Meme rendu de ligne (feed-item) que l'activite
// recente, filtrable par statut. Le filtre se retient d'un rendu a
// l'autre (contenuFiltreActif) pour ne pas revenir a "Tout" a chaque
// rafraichissement des donnees.
let contenuFiltreActif = "all";

function renderContenu(stats) {
  const container = document.querySelector("[data-contenu-liste]");
  const totalLabel = document.querySelector("[data-contenu-total]");
  if (!container) return;

  const submissions = [...stats.submissions].sort(
    (a, b) => new Date(b.submitted_at || 0) - new Date(a.submitted_at || 0),
  );

  if (totalLabel) {
    totalLabel.textContent = submissions.length
      ? `${formatNumber(submissions.length)} contenu${submissions.length > 1 ? "s" : ""} déposé${submissions.length > 1 ? "s" : ""} au total.`
      : "Aucun contenu déposé pour l'instant.";
  }

  const visibles =
    contenuFiltreActif === "all" ? submissions : submissions.filter((s) => s.status === contenuFiltreActif);

  if (!visibles.length) {
    container.innerHTML = '<p class="chart-empty">Aucun contenu pour ce filtre.</p>';
    return;
  }

  const STATUT_TAG = {
    validated: { texte: "VALIDÉ", warm: false },
    pending: { texte: "EN ATTENTE", warm: false },
    review: { texte: "À REVOIR", warm: true },
    rejected: { texte: "REJETÉ", warm: true },
  };

  container.innerHTML = visibles
    .map((submission) => {
      const label = shortCustomerLabel(submission.customer_id);
      const [a, b] = avatarPairFor(submission.customer_id || submission.id);
      const tag = STATUT_TAG[submission.status] || { texte: submission.status || "—", warm: false };
      const date = submission.submitted_at
        ? new Date(submission.submitted_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
        : "—";
      const points = submission.status === "validated" ? `+${formatNumber(submission.points_awarded || 0)}` : "—";

      return `
        <div class="feed-item">
          <div class="fi-ava" style="--a:${a};--b:${b}">${escapeHtml(avatarInitials(label))}</div>
          <div class="fi-main">
            <div class="fi-top">
              <span class="fi-handle">${escapeHtml(label)}</span>
              <span class="fi-tag${tag.warm ? " warm" : ""}">${escapeHtml(tag.texte)}</span>
            </div>
            <div class="fi-sub">${escapeHtml(labelPlateforme(submission.platform))} · ${escapeHtml(formatNumber(submission.views_count || 0))} vues</div>
          </div>
          <div class="fi-right">
            <span class="fi-pts${submission.status !== "validated" ? " neg" : ""}">${escapeHtml(points)}</span>
            <span class="fi-time">${escapeHtml(date)}</span>
          </div>
        </div>`;
    })
    .join("");
}

document.querySelectorAll("[data-contenu-filtre]").forEach((bouton) => {
  bouton.addEventListener("click", () => {
    contenuFiltreActif = bouton.dataset.contenuFiltre;
    document
      .querySelectorAll("[data-contenu-filtre]")
      .forEach((b) => b.classList.toggle("is-active", b === bouton));
    renderContenu(getDashboardStats(dashboardState));
  });
});

function renderFormatSplit(stats) {
  const container = document.querySelector("[data-format-split]");
  if (!container) return;

  const totalVues = stats.validated.reduce((somme, s) => somme + Number(s.views_count || 0), 0);
  if (!totalVues) {
    container.innerHTML = '<p class="chart-empty">Aucune vue validée pour l\'instant.</p>';
    return;
  }

  const vuesParFormat = new Map();
  for (const submission of stats.validated) {
    const cle = labelPlateforme(submission.platform);
    vuesParFormat.set(cle, (vuesParFormat.get(cle) || 0) + Number(submission.views_count || 0));
  }

  const lignes = [...vuesParFormat.entries()].sort((a, b) => b[1] - a[1]);

  container.innerHTML = lignes
    .map(([nom, vues]) => {
      const pourcentage = Math.round((vues / totalVues) * 100);
      return `
        <div class="fmt-row">
          <span class="fmt-name">${escapeHtml(nom)}</span>
          <span class="fmt-track"><i style="width:${pourcentage}%"></i></span>
          <span class="fmt-val"><b>${pourcentage} %</b><small>${escapeHtml(formatNumber(vues))} vues</small></span>
        </div>`;
    })
    .join("");
}

function renderTopAmbassadors(stats) {
  const container = document.querySelector("[data-top-ambassadors]");
  if (!container) return;

  const parClient = new Map();
  for (const submission of stats.validated) {
    if (!submission.customer_id) continue;
    const entree = parClient.get(submission.customer_id) || { vues: 0, points: 0, contenus: 0, plateformes: new Set() };
    entree.vues += Number(submission.views_count || 0);
    entree.points += Number(submission.points_awarded || 0);
    entree.contenus += 1;
    entree.plateformes.add(labelPlateforme(submission.platform));
    parClient.set(submission.customer_id, entree);
  }

  const classement = [...parClient.entries()].sort((a, b) => b[1].points - a[1].points).slice(0, 5);

  if (!classement.length) {
    container.innerHTML = '<p class="chart-empty">Aucun client identifié pour l\'instant.</p>';
    return;
  }

  const maxPoints = classement[0][1].points || 1;

  container.innerHTML = classement
    .map(([customerId, entree], index) => {
      const label = shortCustomerLabel(customerId);
      const [a, b] = avatarPairFor(customerId);
      const rang = String(index + 1).padStart(2, "0");
      const largeur = Math.round((entree.points / maxPoints) * 100);

      return `
        <div class="amb-row">
          <span class="amb-rank">${rang}</span>
          <span class="fi-ava" style="--a:${a};--b:${b}">${escapeHtml(avatarInitials(label))}</span>
          <span class="amb-handle">
            <span class="h">${escapeHtml(label)}</span>
            <span class="t">${escapeHtml([...entree.plateformes].join(", ").toUpperCase())} · ${entree.contenus} contenu${entree.contenus > 1 ? "s" : ""}</span>
          </span>
          <span class="amb-views">${escapeHtml(formatNumber(entree.vues))} vues</span>
          <span class="amb-pts">${escapeHtml(formatNumber(entree.points))} pts</span>
          <span class="amb-bar"><i style="width:${largeur}%"></i></span>
        </div>`;
    })
    .join("");
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
  renderDemarrage(stats);
  renderReachChart(stats);
  renderActivityFeed(stats);
  renderFormatSplit(stats);
  renderTopAmbassadors(stats);
  renderContenu(stats);
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

/**
 * Encart de demarrage.
 *
 * Un tableau de bord entierement a zero est un etat legitime — c'est celui
 * de tout club le jour de son arrivee — mais il ne dit pas quoi faire. Tant
 * que rien n'a ete collecte, on met la premiere action utile en tete de
 * page ; des le premier scan, l'encart disparait de lui-meme.
 */
function renderDemarrage(stats) {
  const encart = document.querySelector("[data-demarrage]");
  if (!encart) return;
  encart.hidden = Boolean(stats.scanCount || stats.receivedCount || stats.reach);
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
          <label>
            <span>Famille</span>
            <select data-reward-category="${index}" data-reward-id="${escapeHtml(reward.id)}" data-reward-added="${reward.added ? "true" : "false"}">
              ${REWARD_CATEGORIES.map(
                (cat) => `<option value="${cat.value}" ${reward.category === cat.value ? "selected" : ""}>${cat.label}</option>`,
              ).join("")}
            </select>
          </label>
          <button type="button" class="reward-remove-button" data-reward-remove="${index}" data-reward-id="${escapeHtml(reward.id)}" data-reward-added="${reward.added ? "true" : "false"}" aria-label="Retirer cette récompense de la boutique">
            Retirer
          </button>
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
      const categoryInput = document.querySelector(`[data-reward-category="${index}"]`);
      return {
        id: input.dataset.rewardId,
        title: input.value || "Récompense",
        points_required: Number(thresholdInput?.value || 0),
        max_redemptions: parseRewardLimit(limitInput?.value),
        category: categoryInput?.value || "bar",
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
  // Un <select> n'emet pas d'evenement "input" au fil de la frappe : "change"
  // seul suffit, il se declenche des que l'utilisateur choisit une option.
  document.querySelectorAll("[data-reward-category]").forEach((select) => {
    select.addEventListener("change", () => persistReward(select));
  });
  document.querySelectorAll("[data-reward-remove]").forEach((button) => {
    button.addEventListener("click", () => retirerRecompense(button));
  });
}

// Il n'existait aucun moyen de retirer une recompense de la boutique une
// fois ajoutee -- seulement en ajouter ou en modifier les champs. Signale
// par Julien ("modifier leur boutique de recompense"). Desactivation
// (active=false), jamais une vraie suppression : une recompense deja
// echangee garde son historique (reward_redemptions la reference encore),
// et rewards.active est deja le champ que getActiveRewards() filtre a la
// lecture -- aucune nouvelle colonne necessaire.
async function retirerRecompense(button) {
  const rewardId = button.dataset.rewardId;
  const estLocale = button.dataset.rewardAdded === "true" || isLocalRewardId(rewardId);

  if (estLocale) {
    // Jamais enregistree en base (juste ajoutee a l'ecran, pas encore
    // sauvegardee) : rien a faire cote serveur, on l'enleve simplement
    // de la liste locale.
    localAddedRewards = localAddedRewards.filter((reward) => reward.id !== rewardId);
    renderRewardEditor(dashboardState);
    return;
  }

  if (!rewardId || dashboardState.source !== "supabase" || !supabase) return;
  if (!window.confirm("Retirer cette récompense de la boutique ? Les clubbeurs ne pourront plus l'échanger.")) return;

  const { error } = await supabase.from("rewards").update({ active: false }).eq("id", rewardId);
  if (error) {
    setDataStatus(`Erreur retrait récompense : ${error.message}`, "error");
    return;
  }

  dashboardState = {
    ...dashboardState,
    rewards: (dashboardState.rewards || []).map((reward) =>
      reward.id === rewardId ? { ...reward, active: false } : reward,
    ),
  };
  setDataStatus("Récompense retirée de la boutique.", "connected");
  renderRewardEditor(dashboardState);
}

async function persistReward(input) {
  if (dashboardState.source !== "supabase" || !supabase) return;

  const rewardId = input.dataset.rewardId;
  const index = input.dataset.rewardName || input.dataset.rewardThreshold || input.dataset.rewardLimit || input.dataset.rewardCategory;
  const nameInput = document.querySelector(`[data-reward-name="${index}"]`);
  const thresholdInput = document.querySelector(`[data-reward-threshold="${index}"]`);
  const limitInput = document.querySelector(`[data-reward-limit="${index}"]`);
  const categoryInput = document.querySelector(`[data-reward-category="${index}"]`);

  if (!nameInput || !thresholdInput || !limitInput) return;

  const payload = {
    title: nameInput.value || "Récompense",
    points_required: Number(thresholdInput.value || 0),
    max_redemptions: parseRewardLimit(limitInput.value),
    category: categoryInput?.value || "bar",
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
      .select("id, title, points_required, max_redemptions, category, active, created_at")
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

/* ==========================================================
   INSTAGRAM

   Bouton de connexion OAuth (Facebook Login for Business) pour que
   le gerant voie le nombre de mentions en story recues. Comme le
   reste du dashboard, jamais de vraie-fausse donnee sur une session
   demo : la section reste neutre tant qu'il n'y a pas un vrai
   establishment rattache a un vrai compte connecte.
   ========================================================== */

function instagramBannerCopy(statut) {
  return (
    {
      connecte: ["Compte Instagram connecté.", "connected"],
      refuse: ["Connexion annulée : rien n'a été modifié.", "warning"],
      aucun_compte_pro: [
        "Aucun compte Instagram professionnel trouvé sur la Page Facebook liée. Passe le compte du club en mode Business ou Creator, relie-le à une Page, puis réessaie.",
        "error",
      ],
      session_expiree: ["La demande de connexion a expiré. Relance-la.", "warning"],
      erreur: ["La connexion Instagram a échoué. Réessaie dans un instant.", "error"],
    }[statut] || null
  );
}

// Facebook redirige vers app.html#instagram?instagram=<statut> : on lit ce
// statut une seule fois, puis on nettoie l'URL pour qu'un simple
// rafraichissement ne rejoue pas le message.
function consumeInstagramRedirectFeedback() {
  if (!instagramBanner) return;

  const params = new URLSearchParams(window.location.search);
  const statut = params.get("instagram");
  if (!statut) return;

  params.delete("instagram");
  const query = params.toString();
  history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);

  const copie = instagramBannerCopy(statut);
  if (!copie) return;
  instagramBanner.textContent = copie[0];
  instagramBanner.dataset.state = copie[1];
  instagramBanner.hidden = false;
}

async function chargerStatutInstagram(session) {
  const reponse = await fetch("/api/instagram?action=status", {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  const corps = await reponse.json().catch(() => null);
  if (!reponse.ok) throw new Error(corps?.error || `HTTP ${reponse.status}`);
  return corps;
}

function renderInstagramConnecte(statut, session) {
  const expireLe = statut.jetonExpireLe
    ? new Date(statut.jetonExpireLe).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })
    : null;
  const mentions = Number(statut.mentions || 0);

  // Abonnes gagnes depuis la connexion (releve quotidien, voir
  // api/instagram.js action=collecter-abonnes) -- absent (null) tant que
  // le cron n'a pas encore tourne une fois pour ce club, jamais affiche
  // comme "0" dans ce cas pour ne pas laisser croire a une stagnation.
  const gainAbonnes =
    statut.abonnesGagnes === null || statut.abonnesGagnes === undefined
      ? ""
      : `<p class="instagram-stat"><strong>${statut.abonnesGagnes >= 0 ? "+" : ""}${numberFormatter.format(statut.abonnesGagnes)}</strong> abonné${Math.abs(statut.abonnesGagnes) > 1 ? "s" : ""} Instagram depuis que ce club est sur ViralNight${
          statut.abonnesActuels !== null && statut.abonnesActuels !== undefined
            ? ` (${numberFormatter.format(statut.abonnesActuels)} aujourd'hui)`
            : ""
        }.</p>`;

  instagramSubtitle.textContent = `Connecté à @${statut.username}`;
  instagramBody.innerHTML = `
    <p class="instagram-stat"><strong>${numberFormatter.format(mentions)}</strong> mention${mentions > 1 ? "s" : ""} reçue${mentions > 1 ? "s" : ""} en story depuis la connexion.</p>
    ${gainAbonnes}
    ${
      statut.webhookActif
        ? ""
        : `<p class="instagram-warning">La réception automatique des mentions n'est pas encore active côté Meta : les nouvelles mentions ne remonteront pas tant que ce n'est pas résolu.</p>`
    }
    ${expireLe ? `<p class="instagram-meta">Connexion à renouveler avant le ${expireLe}.</p>` : ""}
    <button type="button" class="button button-secondary" data-instagram-disconnect>Déconnecter</button>
  `;

  instagramBody.querySelector("[data-instagram-disconnect]")?.addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;
    try {
      await fetch("/api/instagram?action=disconnect", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
    } catch (error) {
      console.error("[instagram] déconnexion", error);
    } finally {
      renderInstagramSection(dashboardState);
    }
  });
}

function renderInstagramDeconnecte(session) {
  instagramSubtitle.textContent = "Pas encore connecté";
  instagramBody.innerHTML = `
    <p>Voyez combien de personnes vous mentionnent en story, directement depuis Instagram.</p>
    <p class="instagram-meta">Le compte Instagram du club doit être en mode Business ou Creator, et relié à une Page Facebook.</p>
    <button type="button" class="button button-primary" data-instagram-connect>Connecter mon compte Instagram</button>
  `;

  instagramBody.querySelector("[data-instagram-connect]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = "Redirection…";
    try {
      const reponse = await fetch("/api/instagram?action=connect", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const corps = await reponse.json().catch(() => null);
      if (!reponse.ok || !corps?.url) throw new Error(corps?.error || "URL de connexion manquante.");
      window.location.href = corps.url;
    } catch (error) {
      console.error("[instagram] connexion", error);
      instagramSubtitle.textContent = "Connexion impossible pour le moment.";
      button.disabled = false;
      button.textContent = "Connecter mon compte Instagram";
    }
  });
}

async function renderInstagramSection(data) {
  if (!instagramBody || !instagramSubtitle) return;

  consumeInstagramRedirectFeedback();

  if (data.source !== "supabase" || !data.session || !data.establishment?.id) {
    instagramSubtitle.textContent = "Connecte-toi avec un compte de club pour lier Instagram.";
    instagramBody.innerHTML = "";
    return;
  }

  instagramSubtitle.textContent = "Vérification en cours…";
  instagramBody.innerHTML = "";

  try {
    const statut = await chargerStatutInstagram(data.session);
    if (statut.connecte) renderInstagramConnecte(statut, data.session);
    else renderInstagramDeconnecte(data.session);
  } catch (error) {
    console.error("[instagram] statut", error);
    instagramSubtitle.textContent = "Statut Instagram indisponible pour le moment.";
  }
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
  renderInstagramSection(data);
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
    category: "bar",
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
