import { createClient } from "@supabase/supabase-js";

// Client service_role de la base CLUBBEUR (gcopwgmqjiufemapamek), distincte
// de celle des gerants que sert supabaseAdmin.js (mrukkexghpcqtwvwwcbe).
//
// Deux projets Supabase, deux jeux de cles : le webhook Instagram recoit une
// mention cote gerants et doit crediter des points cote clubbeur. Sans ce
// second client, il n'a aucun moyen de voir la personne a crediter.
//
// Les cles vivent sur Vercel uniquement (voir CLAUDE.md, section .env.local).
// En local, les routes qui en dependent repondent "Configuration serveur
// incomplete" -- c'est normal, ce n'est pas une panne.

let cachedClient = null;

export function getSupabaseClubbeurAdmin() {
  if (cachedClient) return cachedClient;

  const supabaseUrl = process.env.SUPABASE_CLUBBEUR_URL;
  const serviceRoleKey = process.env.SUPABASE_CLUBBEUR_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Base clubbeur non configuree (SUPABASE_CLUBBEUR_URL / SUPABASE_CLUBBEUR_SERVICE_ROLE_KEY)."
    );
  }

  cachedClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return cachedClient;
}
