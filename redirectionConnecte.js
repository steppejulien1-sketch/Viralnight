/* Un gerant deja connecte qui tape l'adresse du site tombe sur la page de
   vente, alors qu'il vient consulter son club. On l'envoie donc directement
   a son espace.
   ------------------------------------------------------------------------
   Trois garde-fous, parce qu'une redirection automatique sur la page
   publique est vite penible :

   - ?vitrine (ou #vitrine) la desactive. C'est ce que Julien utilise pour
     montrer la page de vente a un prospect sans se deconnecter.
   - la redirection n'a lieu qu'une fois par onglet : revenir sur la landing
     depuis le tableau de bord doit rester possible.
   - elle passe par replace(), pour ne pas coincer le bouton Retour dans une
     boucle landing -> app -> landing.

   Volontairement sans await en tete de module : la landing s'affiche
   normalement pendant la verification de session, et si Supabase n'est pas
   configure (dev local sans .env), il ne se passe simplement rien. */

import { supabase, isSupabaseConfigured } from "./supabaseClient.js";

const ADMIN_EMAIL = "viralnight001@gmail.com";
const CLE_DEJA_FAIT = "vn:redirection-connecte";

async function rediriger() {
  if (!isSupabaseConfigured || !supabase) return;

  const params = new URLSearchParams(window.location.search);
  if (params.has("vitrine") || window.location.hash === "#vitrine") return;

  try {
    if (sessionStorage.getItem(CLE_DEJA_FAIT)) return;
  } catch {
    // Navigation privee : sessionStorage peut lever. On continue sans.
  }

  const { data, error } = await supabase.auth.getSession();
  const email = data?.session?.user?.email;
  if (error || !email) return;

  try {
    sessionStorage.setItem(CLE_DEJA_FAIT, "1");
  } catch {
    // Idem : l'echec de memorisation ne doit pas empecher la redirection.
  }

  const cible = String(email).trim().toLowerCase() === ADMIN_EMAIL ? "./admin.html" : "./app.html";
  window.location.replace(cible);
}

rediriger();
