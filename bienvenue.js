// Decide lequel des deux etats de bienvenue.html afficher : le compte a-t-il
// deja un club (establishment_owners) ou faut-il d'abord demander son nom ?
//
// Necessaire pour la connexion Google : elle ne passe jamais par le
// formulaire d'inscription (email/mot de passe) qui, lui, collecte le nom
// du club et cree l'etablissement immediatement (voir inscription() dans
// auth.js). Un compte Google tout juste cree n'a donc aucun club derriere
// tant qu'il n'est pas passe ici.

import { supabase, isSupabaseConfigured } from "./supabaseClient.js";
import { invitationCourante, oublierInvitation } from "./invitationClub.js";

const setupCard = document.querySelector("[data-bv-setup]");
const stepsCard = document.querySelector("[data-bv-steps]");
const setupForm = document.querySelector("[data-bv-setup-form]");
const setupStatus = document.querySelector("[data-bv-setup-status]");

function afficherEtapes() {
  if (setupCard) setupCard.hidden = true;
  if (stepsCard) stepsCard.hidden = false;
}

function afficherFormulaireClub() {
  if (stepsCard) stepsCard.hidden = true;
  if (setupCard) setupCard.hidden = false;
}

async function init() {
  if (!isSupabaseConfigured || !supabase) {
    afficherEtapes();
    return;
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    window.location.replace("./connexion.html");
    return;
  }

  const { data, error } = await supabase
    .from("establishment_owners")
    .select("establishment_id")
    .eq("id", session.user.id)
    .maybeSingle();

  // En cas d'erreur reseau/RLS inattendue, on montre quand meme les etapes
  // plutot que de bloquer l'arrivee sur un ecran vide : le pire cas est un
  // gerant qui doit completer le nom de son club plus tard depuis l'admin,
  // pas un gerant coince devant une page qui ne repond pas.
  if (error || data?.establishment_id) {
    afficherEtapes();
    return;
  }

  afficherFormulaireClub();

  setupForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const nom = document.querySelector("[data-bv-setup-name]")?.value.trim();
    const ville = document.querySelector("[data-bv-setup-city]")?.value.trim();

    if (!nom) {
      if (setupStatus) setupStatus.textContent = "Le nom du club est requis.";
      return;
    }

    const bouton = setupForm.querySelector('button[type="submit"]');
    if (bouton) bouton.disabled = true;
    if (setupStatus) setupStatus.textContent = "Création de votre espace…";

    try {
      const reponse = await fetch("/api/create-client", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ establishment_name: nom, city: ville || "", invitation: invitationCourante() }),
      });
      const resultat = await reponse.json().catch(() => ({}));

      if (!reponse.ok) throw new Error(resultat?.error || "Erreur inconnue.");

      oublierInvitation();
      afficherEtapes();
    } catch (erreur) {
      console.error("[bienvenue] creation du club", erreur);
      // Le VRAI message du serveur : depuis l'invitation, il dit
      // pourquoi -- lien absent, expire, emis pour une autre adresse.
      // "Reessayez dans un instant" enverrait le gerant recliquer sans
      // fin sur un lien qui ne marchera jamais.
      if (setupStatus) {
        setupStatus.textContent =
          erreur?.message || "Impossible de créer votre espace pour l'instant. Réessayez dans un instant.";
      }
      if (bouton) bouton.disabled = false;
    }
  });
}

init();
