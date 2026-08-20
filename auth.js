// Connexion et inscription.
//
// Un seul module pour les deux pages : elles partagent la moitie de leur logique
// (Google, affichage du mot de passe, messages), et la seule difference est la
// presence du champ "nom du club" a l'inscription.
//
// L'inscription cree le compte Auth ; le rattachement a un establishment est ensuite
// fait cote admin. Tant qu'il n'existe pas, le dashboard le dira clairement plutot
// que d'afficher un espace vide sans explication.

import { isSupabaseConfigured, supabase } from "./supabaseClient.js";
import { injecterMascotte } from "./mascotte.js";

injecterMascotte();

/** Compte disposant du back-office complet. Doit rester aligne avec admin.js. */
const ADMIN_EMAIL = "viralnight001@gmail.com";

/** Identifiant du setInterval du compte a rebours rate limit. */
let timerRateLimit = null;

const els = {
  form: document.getElementById("form"),
  google: document.getElementById("google"),
  toggle: document.getElementById("toggle"),
  submit: document.getElementById("submit"),
  message: document.getElementById("message"),
  forgot: document.getElementById("forgot"),
  email: document.getElementById("email"),
  password: document.getElementById("password"),
  club: document.getElementById("club"),
  title: document.getElementById("title"),
  lead: document.getElementById("lead"),
  guest: document.getElementById("guest"),
  foot: document.getElementById("foot"),
  session: document.getElementById("session"),
  sessionEmail: document.getElementById("session-email"),
  sessionInitial: document.getElementById("session-initial"),
  sessionGo: document.getElementById("session-go"),
  sessionOut: document.getElementById("session-out"),
};

// La presence du champ club distingue l'inscription de la connexion.
const estInscription = Boolean(els.club);

function message(texte, ton = "info") {
  if (!texte) {
    els.message.hidden = true;
    return;
  }
  els.message.textContent = texte;
  els.message.className = `au-msg is-${ton}`;
  els.message.hidden = false;
}

function occupe(actif, libelleAttente) {
  els.submit.disabled = actif;
  els.google.disabled = actif;
  els.submit.textContent = actif
    ? libelleAttente
    : estInscription
      ? "Créer mon espace"
      : "Se connecter";
}

/**
 * Destination apres connexion.
 *
 * Si l'utilisateur a ete redirige ici depuis une page protegee, on l'y ramene :
 * il voulait aller quelque part, pas atterrir sur un accueil generique.
 * Seuls les chemins internes sont acceptes, pour eviter une redirection ouverte
 * vers un site tiers depuis un lien piege.
 */
function destination(email) {
  const suivant = new URLSearchParams(window.location.search).get("suivant");

  if (suivant && suivant.startsWith("/") && !suivant.startsWith("//")) {
    return suivant;
  }

  // ⚠️ UN CLIENT CONNECTE VA SUR SON TABLEAU DE BORD, JAMAIS SUR LA DEMO.
  // Il atterrissait jusqu'ici sur simulateur.html : une page de vente,
  // remplie de donnees simulees et estampillee « MODE DEMO ». Un gerant
  // qui se connecte a son espace n'a rien a faire dans une simulation —
  // il veut SES chiffres, meme s'ils sont a zero. Un tableau de bord vide
  // est un etat legitime ; une demo presentee comme son espace, non.
  // simulateur.html reste accessible directement : c'est un outil de
  // vente, il n'est simplement plus la destination d'une connexion.
  return String(email).trim().toLowerCase() === ADMIN_EMAIL ? "./admin.html" : "./app.html";
}

/**
 * Traduit les erreurs Supabase, qui arrivent en anglais et souvent trop techniques.
 * Un gerant de club ne doit pas lire "Invalid login credentials".
 */
function messageErreur(error) {
  const brut = String(error?.message || "").toLowerCase();

  if (brut.includes("invalid login credentials")) return "Email ou mot de passe incorrect.";
  if (brut.includes("email not confirmed")) return "Confirmez votre email avant de vous connecter : le lien est dans votre boîte mail.";
  if (brut.includes("already registered") || brut.includes("already exists")) {
    return "Un compte existe déjà avec cet email. Connectez-vous plutôt.";
  }
  if (brut.includes("password")) return "Mot de passe trop faible : 8 caractères minimum, dont un chiffre.";
  if (estErreurRateLimit(error)) return null; // gere par demarrerRebours
  if (brut.includes("failed to fetch")) return "Connexion impossible. Vérifiez votre accès internet.";

  return error?.message || "Une erreur est survenue.";
}

/** Detecte les erreurs de limite de requetes Supabase. */
function estErreurRateLimit(error) {
  const brut = String(error?.message || "").toLowerCase();
  return (
    brut.includes("rate limit") ||
    brut.includes("too many") ||
    brut.includes("security purposes") ||
    brut.includes("email rate limit")
  );
}

/**
 * Lance un compte a rebours visible sur le bouton soumettre.
 * Extrait la duree exacte du message d'erreur Supabase si disponible
 * (ex : "you can only request this after 60 seconds"), sinon 60s par defaut.
 */
function demarrerRebours(error) {
  clearInterval(timerRateLimit);

  const match = String(error?.message || "").match(/after\s+(\d+)\s+second/i);
  let secondes = match ? parseInt(match[1], 10) : 60;

  message(`Trop de tentatives. Vous pourrez réessayer dans ${secondes} seconde${secondes > 1 ? "s" : ""}.`, "error");
  els.submit.disabled = true;
  els.google.disabled = true;
  els.submit.textContent = `Réessayer dans ${secondes}s`;

  timerRateLimit = setInterval(() => {
    secondes -= 1;
    if (secondes <= 0) {
      clearInterval(timerRateLimit);
      timerRateLimit = null;
      els.submit.disabled = false;
      els.google.disabled = false;
      els.submit.textContent = estInscription ? "Créer mon espace" : "Se connecter";
      message("Vous pouvez réessayer.", "info");
    } else {
      els.submit.textContent = `Réessayer dans ${secondes}s`;
    }
  }, 1000);
}

function motDePasseValide(valeur) {
  return valeur.length >= 8 && /\d/.test(valeur);
}

async function connexion(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  window.location.href = destination(email);
}

async function inscription(email, password, club) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Le nom du club sert a creer l'establishment cote admin,
      // sans redemander au gerant ce qu'il a deja saisi.
      data: { club_name: club },
      emailRedirectTo: new URL("./connexion.html", window.location.href).href,
    },
  });

  if (error) throw error;

  // Sans session, Supabase attend une confirmation par email : pas de jeton
  // pour appeler l'API, le club sera cree plus tard. bienvenue.html detecte
  // ce cas (aucune ligne dans establishment_owners) et redemande le nom du
  // club a la premiere vraie connexion, plutot que de le perdre ici.
  if (!data.session) {
    message(
      `Compte créé. Ouvrez l'email envoyé à ${email} pour confirmer votre adresse, puis connectez-vous.`,
      "success",
    );
    els.form.reset();
    return;
  }

  // Cree l'etablissement tout de suite, avec le nom deja saisi dans ce
  // formulaire : sans cet appel, le nom de club partait dans user_metadata
  // et n'etait jamais lu nulle part — un compte cree via l'inscription
  // n'avait jusqu'ici JAMAIS de club derriere, quel que soit le chemin
  // (email ou Google). Volontairement non bloquant : si l'appel echoue
  // (reseau, etc.), on laisse quand meme passer vers bienvenue.html, qui
  // redemandera le nom du club plutot que de coincer l'inscription entiere
  // sur cet appel secondaire.
  if (club) {
    try {
      await fetch("/api/create-client", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${data.session.access_token}`,
        },
        body: JSON.stringify({ establishment_name: club }),
      });
    } catch (erreurProvisionnement) {
      console.error("[inscription] creation du club", erreurProvisionnement);
    }
  }

  // A la CREATION du compte (pas a une connexion ulterieure), un petit
  // ecran d'accueil explique la boucle avant le tableau de bord — vide
  // au premier lancement, il ne dit sinon rien du fonctionnement du
  // produit. destination() garde la main sur les cas particuliers
  // (deep-link ?suivant=, compte admin) : bienvenue.html ne remplace
  // que l'atterrissage par defaut sur app.html.
  const cible = destination(email);
  if (cible === "./app.html") {
    // Meme drapeau que la detection cote app.js (compte Google tout
    // juste cree) : sans lui, cliquer "Aller a mon tableau de bord"
    // depuis bienvenue.html declenchait une SECONDE redirection vers
    // bienvenue.html, puisque le compte reste "tout neuf" pendant les
    // deux premieres minutes.
    try {
      sessionStorage.setItem("vn:bienvenue-vue", "1");
    } catch {
      // Navigation privee : tant pis, au pire l'ecran s'affiche une fois de trop.
    }
    window.location.href = "./bienvenue.html";
    return;
  }
  window.location.href = cible;
}

async function envoyer(event) {
  event.preventDefault();
  message(null);

  const email = els.email.value.trim().toLowerCase();
  const password = els.password.value;

  if (estInscription && !motDePasseValide(password)) {
    message("Mot de passe trop court : 8 caractères minimum, dont un chiffre.", "error");
    els.password.focus();
    return;
  }

  occupe(true, estInscription ? "Création..." : "Connexion...");

  try {
    if (estInscription) {
      await inscription(email, password, els.club.value.trim());
    } else {
      await connexion(email, password);
    }
  } catch (error) {
    if (estErreurRateLimit(error)) {
      demarrerRebours(error);
      return; // occupe(false) ne doit pas s'executer : le rebours gere l'etat du bouton
    }
    message(messageErreur(error), "error");
  } finally {
    if (!timerRateLimit) occupe(false);
  }
}

async function google() {
  message(null);

  const btn = els.google;
  const htmlOriginal = btn.innerHTML;
  btn.disabled = true;
  // Change le texte sans toucher au SVG
  const textNode = [...btn.childNodes].find(n => n.nodeType === Node.TEXT_NODE);
  if (textNode) textNode.textContent = " Connexion...";

  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      // ⚠️ Google renvoie sur app.html, comme la connexion par email.
      // Une adresse de retour OAuth est figee : elle ne peut pas dependre
      // de l'email, encore inconnu au moment du depart. C'est donc
      // app.html qui renvoie l'administrateur vers son back-office —
      // exactement ce que l'ancien commentaire affirmait a tort, et qui
      // est desormais vrai (voir renderAccessGate dans app.js).
      options: { redirectTo: new URL("./app.html", window.location.href).href },
    });
    if (error) throw error;
    // Pas de restauration : la page va rediriger vers Google immediatement.
  } catch (error) {
    message(messageErreur(error) || "Connexion Google indisponible. Utilisez votre email.", "error");
    btn.innerHTML = htmlOriginal;
    btn.disabled = false;
  }
}

async function motDePasseOublie(event) {
  event.preventDefault();

  const email = els.email.value.trim().toLowerCase();
  if (!email) {
    message("Entrez d'abord votre email, puis recliquez sur « Oublié ? ».", "info");
    els.email.focus();
    return;
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: new URL("./app.html", window.location.href).href,
  });

  message(
    error
      ? messageErreur(error)
      : `Email envoyé à ${email}. Ouvrez le lien pour choisir un nouveau mot de passe.`,
    error ? "error" : "success",
  );
}

function basculerVisibilite() {
  const visible = els.password.type === "text";
  els.password.type = visible ? "password" : "text";
  els.toggle.setAttribute("aria-label", visible ? "Afficher le mot de passe" : "Masquer le mot de passe");
  els.password.focus();
}

/**
 * Session deja ouverte.
 *
 * On n'envoie plus automatiquement au dashboard : la redirection rendait ces
 * pages inatteignables (cliquer "Se connecter" depuis le site renvoyait aussitot
 * a l'espace deja ouvert) et ne laissait aucun moyen de changer de compte.
 * On affiche le compte et on laisse choisir.
 */
function afficherSession(email) {
  els.title.textContent = "Vous êtes déjà connecté";
  els.lead.textContent = "Continuez vers votre espace, ou connectez-vous avec un autre compte.";

  els.sessionEmail.textContent = email;
  els.sessionInitial.textContent = String(email).trim().charAt(0) || "?";

  els.guest.hidden = true;
  els.foot.hidden = true;
  els.session.hidden = false;

  els.sessionGo.addEventListener("click", () => {
    window.location.href = destination(email);
  });

  els.sessionOut.addEventListener("click", async () => {
    els.sessionGo.disabled = true;
    els.sessionOut.disabled = true;
    els.sessionOut.textContent = "Déconnexion...";

    const { error } = await supabase.auth.signOut();

    if (error) {
      els.sessionGo.disabled = false;
      els.sessionOut.disabled = false;
      els.sessionOut.textContent = "Utiliser un autre compte";
      message(messageErreur(error), "error");
      return;
    }

    // Rechargement plutot que reaffichage manuel : on repart d'un etat propre,
    // sans risque d'ecouteur laisse en place sur l'ancienne session.
    window.location.reload();
  });
}

async function init() {
  if (!isSupabaseConfigured || !supabase) {
    message("Supabase n'est pas configuré : la connexion est indisponible.", "error");
    els.submit.disabled = true;
    els.google.disabled = true;
    return;
  }

  const { data } = await supabase.auth.getSession();
  if (data?.session) {
    afficherSession(data.session.user.email);
    return;
  }

  els.form.addEventListener("submit", envoyer);
  els.google.addEventListener("click", google);
  els.toggle.addEventListener("click", basculerVisibilite);
  els.forgot?.addEventListener("click", motDePasseOublie);
}

init();
