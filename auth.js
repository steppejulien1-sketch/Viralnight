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

/** Compte disposant du back-office complet. Doit rester aligne avec admin.js. */
const ADMIN_EMAIL = "viralnight001@gmail.com";

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
  name: document.getElementById("name"),
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
  if (brut.includes("rate limit") || brut.includes("too many")) return "Trop de tentatives. Patientez une minute.";
  if (brut.includes("failed to fetch")) return "Connexion impossible. Vérifiez votre accès internet.";

  return error?.message || "Une erreur est survenue.";
}

function motDePasseValide(valeur) {
  return valeur.length >= 8 && /\d/.test(valeur);
}

async function connexion(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  window.location.href = destination(email);
}

async function inscription(email, password, club, nom) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Ces informations servent a creer l'establishment cote admin,
      // sans redemander au gerant ce qu'il a deja saisi.
      data: { club_name: club, full_name: nom },
      emailRedirectTo: new URL("./connexion.html", window.location.href).href,
    },
  });

  if (error) throw error;

  // Sans session, Supabase attend une confirmation par email.
  if (!data.session) {
    message(
      `Compte créé. Ouvrez l'email envoyé à ${email} pour confirmer votre adresse, puis connectez-vous.`,
      "success",
    );
    els.form.reset();
    return;
  }

  window.location.href = destination(email);
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
      await inscription(email, password, els.club.value.trim(), els.name.value.trim());
    } else {
      await connexion(email, password);
    }
  } catch (error) {
    message(messageErreur(error), "error");
  } finally {
    occupe(false);
  }
}

async function google() {
  message(null);

  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      // Le compte admin est redirige au meme endroit que les autres : la page
      // app.html renverra vers l'admin si l'email correspond.
      options: { redirectTo: new URL("./app.html", window.location.href).href },
    });
    if (error) throw error;
  } catch (error) {
    message(
      `Connexion Google indisponible : ${messageErreur(error)} Utilisez plutôt votre email.`,
      "error",
    );
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
