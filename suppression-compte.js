/* Suppression de compte depuis le web.

   Exigence Google Play : une URL de demande de suppression accessible sans
   installer l'application. Voir l'en-tete de suppression-compte.html.

   ⚠️ CETTE PAGE PARLE A LA BASE CLUBBEUR, pas a celle des gerants. Ce sont
   deux projets Supabase distincts (voir CLAUDE.md) : supabaseClient.js vise
   celle des gerants et ne connait aucun clubbeur. D'ou le client cree ici,
   avec les memes constantes que app-preview.html -- cle anon, publique par
   nature, aucun secret.

   ⚠️ LA SUPPRESSION NE SE FAIT PAS ICI. Le navigateur n'a que la cle anon,
   qui ne peut pas effacer un utilisateur Auth. Il obtient une session par
   lien magique, puis la route serveur relit l'identifiant depuis le jeton et
   supprime. Meme chemin que le bouton de l'appli. */

import { createClient } from "@supabase/supabase-js";

const URL_SUPABASE_CLUBBEUR = "https://gcopwgmqjiufemapamek.supabase.co";
const CLE_SUPABASE_CLUBBEUR =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdjb3B3Z21xaml1ZmVtYXBhbWVrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5NDIzMDUsImV4cCI6MjEwMTUxODMwNX0.Vni3uEoA1glVVbALyh4JPI2TNZRaHc52py3NKsmEBlU";

const supabase = createClient(URL_SUPABASE_CLUBBEUR, CLE_SUPABASE_CLUBBEUR, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

const $ = (s) => document.querySelector(s);
const FORM = $("#sc-form");
const CHAMP = $("#sc-email");
const ENVOYER = $("#sc-envoyer");
const CONFIRME = $("#sc-confirme");
const CONNECTE = $("#sc-connecte");
const SUPPRIMER = $("#sc-supprimer");
const MSG = $("#sc-msg");

function message(texte, type) {
  MSG.textContent = texte;
  MSG.className = "sc-msg" + (type ? " " + type : "");
  MSG.hidden = false;
}

/* Les erreurs Supabase arrivent en anglais et trop techniques : on les
   traduit, comme messageErreur() dans auth.js. */
function traduire(erreur) {
  const brut = String(erreur?.message || erreur || "").toLowerCase();
  if (brut.includes("rate limit") || brut.includes("too many")) {
    return "Trop de tentatives. Attends une minute avant de réessayer.";
  }
  if (brut.includes("invalid") && brut.includes("email")) {
    return "Cette adresse ne semble pas valide.";
  }
  return "Ça n'a pas marché. Réessaie dans un moment.";
}

/* Un compte deja connecte (retour du lien magique) saute l'etape e-mail. */
async function etatInitial() {
  const { data } = await supabase.auth.getSession();
  const session = data?.session;
  if (!session) return;
  FORM.hidden = true;
  CONFIRME.hidden = false;
  CONNECTE.textContent = "Connecté en tant que " + (session.user.email || "toi") + ".";
}

FORM.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = CHAMP.value.trim();
  if (!email) return;

  ENVOYER.disabled = true;
  ENVOYER.textContent = "Envoi...";

  /* shouldCreateUser: false — sans ca, taper une adresse inconnue CREE un
     compte, ce qui serait absurde sur une page de suppression : on ferait
     naitre le compte qu'on vient effacer. */
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: window.location.origin + "/suppression-compte.html",
    },
  });

  ENVOYER.disabled = false;
  ENVOYER.textContent = "Recevoir le lien";

  if (error) {
    /* Une adresse inconnue renvoie une erreur. On ne le dit PAS : repondre
       "ce compte n'existe pas" transformerait la page en outil pour savoir
       qui est inscrit chez nous. Meme reponse dans les deux cas. */
    const brut = String(error.message || "").toLowerCase();
    if (brut.includes("signups not allowed") || brut.includes("not found") || brut.includes("user")) {
      message("Si un compte existe avec cette adresse, le lien vient d'y être envoyé.", "ok");
      return;
    }
    message(traduire(error), "err");
    return;
  }

  message("Si un compte existe avec cette adresse, le lien vient d'y être envoyé. Ouvre-le depuis ce téléphone.", "ok");
});

SUPPRIMER.addEventListener("click", async () => {
  if (!window.confirm(
    "Supprimer définitivement ton compte Noctify ?\n\n" +
    "Tes points, tes bons et ton historique sont effacés. On ne peut pas revenir en arrière."
  )) return;

  SUPPRIMER.disabled = true;
  SUPPRIMER.textContent = "Suppression...";

  try {
    const { data } = await supabase.auth.getSession();
    const session = data?.session;
    if (!session) throw new Error("session");

    const res = await fetch("/api/credit-clubbeur?action=supprimer-compte", {
      method: "POST",
      headers: { Authorization: "Bearer " + session.access_token },
    });
    if (!res.ok) throw new Error("api");

    await supabase.auth.signOut();
    CONFIRME.hidden = true;
    message("Ton compte a été supprimé. Il ne reste rien de toi chez nous.", "ok");
  } catch (e) {
    SUPPRIMER.disabled = false;
    SUPPRIMER.textContent = "Supprimer définitivement mon compte";
    message(
      "La suppression n'a pas abouti. Réessaie, ou écris-nous à viralnight001@gmail.com " +
      "depuis l'adresse de ton compte.",
      "err"
    );
  }
});

etatInitial();
