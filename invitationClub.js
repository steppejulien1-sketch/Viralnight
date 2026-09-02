// L'inscription a Noctify se fait sur invitation : le lien porte
// ?invitation=<jeton>.
//
// Le jeton doit survivre a des allers-retours qui perdent la query :
// la confirmation par email, le retour de Google, le passage de
// inscription.html a bienvenue.html. On le range donc des qu'on le voit,
// et on le reporte sur les URL de retour qu'on fabrique nous-memes.
//
// Ce n'est qu'un laissez-passer, pas un secret : il ne donne acces a rien
// tant que api/create-client.js ne l'a pas verifie avec la cle
// service_role. Le verrou est la-bas, jamais ici.
//
// club-app.html porte sa propre copie de ces trois fonctions : c'est un
// fichier volontairement autonome, comme il l'est deja pour la traduction
// des erreurs Supabase.

const CLE = "noctify_invitation_club";

/** Le jeton de l'URL s'il y en a un, sinon celui garde du passage precedent. */
export function invitationCourante() {
  let depuisUrl = "";
  try {
    depuisUrl = new URL(window.location.href).searchParams.get("invitation") || "";
  } catch {
    depuisUrl = "";
  }

  if (depuisUrl) {
    try {
      localStorage.setItem(CLE, depuisUrl);
    } catch {
      // Navigation privee ou stockage refuse : le jeton ne vaudra que
      // pour cette page-ci, ce qui suffit dans la foulee du clic.
    }
    return depuisUrl;
  }

  try {
    return localStorage.getItem(CLE) || "";
  } catch {
    return "";
  }
}

/** Apres usage : le garder ferait echouer la suite sur "deja utilisee". */
export function oublierInvitation() {
  try {
    localStorage.removeItem(CLE);
  } catch {
    // Rien a nettoyer.
  }
}

/** Reporte l'invitation sur une URL de retour (confirmation email, OAuth). */
export function avecInvitation(url) {
  try {
    const cible = new URL(url, window.location.href);
    const jeton = invitationCourante();
    if (jeton) cible.searchParams.set("invitation", jeton);
    return cible.href;
  } catch {
    return String(url);
  }
}
