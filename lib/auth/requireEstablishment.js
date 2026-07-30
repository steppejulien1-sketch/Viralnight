import { getSupabaseAdmin } from "../db/supabaseAdmin.js";

/**
 * Verifie la session de l'appelant et retourne l'establishment auquel il est rattache.
 *
 * IMPORTANT : les routes API utilisent la cle service_role, qui contourne RLS.
 * L'establishment_id ne doit donc JAMAIS etre lu depuis la requete du client :
 * il est toujours rededuit du jeton de session. Sinon il suffirait de deviner
 * un UUID pour lire les donnees d'un autre etablissement.
 *
 * @param {import("node:http").IncomingMessage} request
 * @returns {Promise<{supabase: object, establishmentId: string, userId: string} | {error: string, status: number}>}
 */
export async function requireEstablishment(request) {
  const token = (request.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return { error: "Session requise.", status: 401 };

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (error) {
    console.error("[auth] Supabase admin indisponible", error);
    return { error: "Configuration serveur incomplete.", status: 500 };
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return { error: "Session invalide.", status: 401 };

  const { data: owner, error: ownerError } = await supabase
    .from("establishment_owners")
    .select("establishment_id")
    .eq("id", data.user.id)
    .maybeSingle();

  if (ownerError || !owner?.establishment_id) {
    return { error: "Aucun etablissement lie a ce compte.", status: 403 };
  }

  return { supabase, establishmentId: owner.establishment_id, userId: data.user.id };
}
