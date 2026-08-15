// PONT RETOUR — cote B2B.
//
// Depuis le 2026-08-15 la validation des contenus est centralisee ici :
// le back-office valide, et c'est cette route qui va crediter le
// clubbeur dans la base de la PWA (un autre projet Supabase).
//
// ⚠️ POURQUOI UNE ROUTE SERVEUR ET PAS UN APPEL DEPUIS admin.js.
// Le pont est protege par un secret partage entre les deux serveurs. Un
// secret pose dans du JavaScript de navigateur n'est pas un secret : il
// suffit d'ouvrir les outils de developpement pour le lire, et il
// deviendrait un distributeur de points ouvert a tous.
//
// ⚠️ L'identifiant de la story n'est PAS lu dans le corps de la requete.
// Il est relu en base a partir de l'id de la soumission. Sinon un admin
// — ou quiconque volerait sa session — pourrait faire crediter n'importe
// quelle story en la nommant lui-meme. Meme principe que
// requireEstablishment : ce qui autorise ne vient jamais du client.
//
// VARIABLES : PWA_FUNCTIONS_URL, PWA_BRIDGE_SECRET

import { createClient } from "@supabase/supabase-js";

const ADMIN_EMAIL = "viralnight001@gmail.com";

function json(response, body, status = 200) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
}

async function readBody(request) {
  if (request.body && typeof request.body === "object") return request.body;
  if (typeof request.body === "string") return request.body ? JSON.parse(request.body) : {};
  let raw = "";
  for await (const chunk of request) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

export default async function handler(request, response) {
  if (request.method !== "POST") return json(response, { error: "Method not allowed" }, 405);

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const pwaUrl = process.env.PWA_FUNCTIONS_URL;
  const secret = process.env.PWA_BRIDGE_SECRET;

  if (!supabaseUrl || !serviceRoleKey) {
    return json(response, { error: "Configuration serveur incomplete" }, 500);
  }

  const token = (request.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return json(response, { error: "Session admin requise" }, 401);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: qui, error: erreurAuth } = await supabase.auth.getUser(token);
  if (erreurAuth || qui?.user?.email?.toLowerCase() !== ADMIN_EMAIL) {
    return json(response, { error: "Acces reserve a l'administrateur" }, 403);
  }

  const body = await readBody(request).catch(() => ({}));
  const submissionId = String(body.submissionId || "").trim();
  if (!submissionId) return json(response, { error: "submissionId requis" }, 400);

  const approve = body.approve === false ? false : true;
  const points = Number.isFinite(Number(body.points)) ? Math.round(Number(body.points)) : null;
  const views = Number.isFinite(Number(body.views)) ? Math.round(Number(body.views)) : null;

  const { data: contenu, error: erreurLecture } = await supabase
    .from("submissions")
    .select("id, external_story_id")
    .eq("id", submissionId)
    .maybeSingle();

  if (erreurLecture) return json(response, { error: erreurLecture.message }, 500);
  if (!contenu) return json(response, { error: "Contenu introuvable" }, 404);

  // Cas parfaitement normal : un contenu saisi a la main, ou anterieur au
  // pont, n'a pas d'origine cote PWA. Il n'y a personne a crediter, et ce
  // n'est pas une erreur.
  if (!contenu.external_story_id) {
    return json(response, { ok: true, skipped: "sans_origine_pwa" });
  }

  if (!pwaUrl || !secret) {
    return json(response, { error: "Pont vers la PWA non configure" }, 503);
  }

  let reponse;
  try {
    reponse = await fetch(`${pwaUrl.replace(/\/$/, "")}/credit-story`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-vn-secret": secret },
      body: JSON.stringify({
        story_id: contenu.external_story_id,
        approve,
        points,
        views,
      }),
    });
  } catch (e) {
    return json(response, { error: "Pont injoignable", detail: String(e) }, 502);
  }

  const sortie = await reponse.json().catch(() => ({}));

  // Le clubbeur a deja ete credite : ce n'est pas une panne, c'est le
  // verrou anti-double-credit qui fait son travail.
  if (reponse.status === 409) return json(response, { ok: true, skipped: "deja_credite" });

  if (!reponse.ok) {
    return json(response, { error: "Credit refuse par la PWA", detail: sortie?.detail || sortie?.error }, 502);
  }

  return json(response, { ok: true, awarded: sortie.awarded ?? 0, unlocks_at: sortie.unlocks_at ?? null });
}
