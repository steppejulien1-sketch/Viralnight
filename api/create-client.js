import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const ADMIN_EMAIL = "viralnight001@gmail.com";

const defaultRewards = [
  { title: "Vestiaire offert", points_required: 40, max_redemptions: 50 },
  { title: "Boisson soft", points_required: 60, max_redemptions: 100 },
  { title: "Shot offert", points_required: 80, max_redemptions: 50 },
  { title: "Boisson premium", points_required: 110, max_redemptions: 25 },
  { title: "Acces VIP", points_required: 220, max_redemptions: 5 },
];

function json(response, body, status = 200) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
}

function getSiteUrl(request) {
  const host = request.headers.host;
  return process.env.SITE_URL || `https://${host}`;
}

function randomPassword() {
  return `${randomUUID()}Aa1!`;
}

async function findUserByEmail(supabase, email) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;

    const user = data?.users?.find((item) => item.email?.toLowerCase() === email);
    if (user) return user;
    if (!data?.users || data.users.length < 1000) return null;
  }

  return null;
}

/**
 * Cree l'etablissement, le rattachement, le bareme par defaut et les
 * recompenses par defaut. Partage entre le chemin admin (creation pour un
 * tiers) et le chemin libre-service (creation pour soi-meme) : les deux
 * doivent finir avec exactement le meme etat, un club qui marche des la
 * premiere connexion, pas une coquille vide a completer plus tard.
 */
async function provisionnerEtablissement(supabase, { name, city, phone, category, subscriptionStatus, ownerId, ownerEmail }) {
  const establishmentResult = await supabase
    .from("establishments")
    .insert({
      name,
      city: city || null,
      phone: phone || null,
      category,
      subscription_status: subscriptionStatus,
    })
    .select("id, name")
    .single();

  if (establishmentResult.error) {
    return { error: establishmentResult.error.message };
  }

  const establishmentId = establishmentResult.data.id;

  const ownerResult = await supabase.from("establishment_owners").insert({
    id: ownerId,
    email: ownerEmail,
    establishment_id: establishmentId,
    role: "owner",
  });

  if (ownerResult.error) {
    return { error: ownerResult.error.message };
  }

  await supabase.from("establishment_point_rules").insert({
    establishment_id: establishmentId,
    validated_publication: 0,
    video_views_per_thousand: 25,
    validated_story: 0,
    story_views_per_thousand: 80,
    viral_bonus: 90,
    club_mention: 0,
    qr_checkin: 15,
    monthly_ambassador: 350,
  });

  // ⚠️ L'ERREUR EST LUE. Sans ce controle, cette insertion a echoue en
  // silence pendant des mois : `max_redemptions` n'existait pas en base
  // (migration 202607030002 jamais appliquee), Postgres rejetait la
  // ligne, et le nouveau client etait cree avec ZERO recompense — sans
  // que personne ne le sache. C'est exactement ce qui est arrive au
  // Mirage. Un `await` sans lecture de l'erreur, c'est un echec qu'on
  // s'interdit de voir.
  const { error: erreurRecompenses } = await supabase.from("rewards").insert(
    defaultRewards.map((reward) => ({
      ...reward,
      establishment_id: establishmentId,
      active: true,
    })),
  );

  if (erreurRecompenses) {
    console.error("[api/create-client] recompenses par defaut non creees :", erreurRecompenses.message);
  }

  return { establishmentId };
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    return json(response, { error: "Method not allowed" }, 405);
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return json(response, { error: "Supabase admin env vars missing" }, 500);
  }

  const authHeader = request.headers.authorization || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");

  if (!token) {
    return json(response, { error: "Missing session" }, 401);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data: callerData, error: callerError } = await supabase.auth.getUser(token);
  const caller = callerData?.user;

  if (callerError || !caller) {
    return json(response, { error: "Invalid session" }, 401);
  }

  let payload;
  try {
    payload = typeof request.body === "string" ? JSON.parse(request.body) : request.body;
  } catch {
    return json(response, { error: "Invalid JSON body" }, 400);
  }
  payload ||= {};

  const isAdmin = caller.email?.toLowerCase() === ADMIN_EMAIL;

  // ---------------- Libre-service : l'appelant cree SON PROPRE club ----------------
  //
  // Un compte cree via l'inscription (email/mot de passe ou Google) n'avait
  // jusqu'ici aucun club derriere : le nom saisi a l'inscription partait
  // dans user_metadata et n'etait jamais lu nulle part. Résultat, un
  // "gerant" qui vient de creer son compte tombe sur un dashboard verrouille
  // ("Aucun etablissement lie a ce compte") — repere par Julien via une
  // connexion Google. Ce chemin cree l'etablissement au nom de l'appelant
  // LUI-MEME : ownerId/ownerEmail viennent du jeton verifie ci-dessus,
  // jamais du corps de la requete, pour qu'on ne puisse pas s'attribuer le
  // club de quelqu'un d'autre en passant un autre id.
  if (!isAdmin) {
    const dejaProprietaire = await supabase
      .from("establishment_owners")
      .select("establishment_id")
      .eq("id", caller.id)
      .maybeSingle();

    if (dejaProprietaire.error) {
      return json(response, { error: dejaProprietaire.error.message }, 500);
    }

    // Idempotent : si l'ecran d'accueil appelle deux fois (double clic,
    // retour arriere), on renvoie le club existant plutot que d'en creer un
    // second pour la meme personne.
    if (dejaProprietaire.data?.establishment_id) {
      return json(response, {
        establishment_id: dejaProprietaire.data.establishment_id,
        already_existed: true,
      });
    }

    const establishmentName = String(payload.establishment_name || "").trim();
    const city = String(payload.city || "").trim();

    if (!establishmentName) {
      return json(response, { error: "Le nom du club est requis." }, 400);
    }

    const resultat = await provisionnerEtablissement(supabase, {
      name: establishmentName,
      city,
      phone: "",
      category: "club",
      subscriptionStatus: "essai",
      ownerId: caller.id,
      ownerEmail: caller.email.toLowerCase(),
    });

    if (resultat.error) {
      return json(response, { error: resultat.error }, 500);
    }

    return json(response, { establishment_id: resultat.establishmentId, already_existed: false });
  }

  // ---------------- Admin : cree un club pour un tiers ----------------

  const establishmentName = String(payload.establishment_name || "").trim();
  const ownerEmail = String(payload.owner_email || "").trim().toLowerCase();
  const city = String(payload.city || "").trim();
  const phone = String(payload.phone || "").trim();
  const category = String(payload.category || "club").trim();
  const allowedStatuses = new Set(["actif", "essai", "suspendu"]);
  const subscriptionStatus = allowedStatuses.has(payload.subscription_status) ? payload.subscription_status : "essai";

  if (!establishmentName || !ownerEmail) {
    return json(response, { error: "Club name and email are required" }, 400);
  }

  const existingOwner = await supabase
    .from("establishment_owners")
    .select("email, establishment_id")
    .ilike("email", ownerEmail)
    .maybeSingle();

  if (existingOwner.data) {
    return json(response, { error: "Client already exists" }, 409);
  }

  if (existingOwner.error) {
    return json(response, { error: existingOwner.error.message }, 500);
  }

  let authUser = await findUserByEmail(supabase, ownerEmail);

  if (!authUser) {
    const created = await supabase.auth.admin.createUser({
      email: ownerEmail,
      password: randomPassword(),
      email_confirm: true,
      user_metadata: {
        establishment_name: establishmentName,
      },
    });

    if (created.error) {
      return json(response, { error: created.error.message }, 500);
    }

    authUser = created.data.user;
  }

  const resultat = await provisionnerEtablissement(supabase, {
    name: establishmentName,
    city,
    phone,
    category,
    subscriptionStatus,
    ownerId: authUser.id,
    ownerEmail,
  });

  if (resultat.error) {
    return json(response, { error: resultat.error }, 500);
  }

  const establishmentId = resultat.establishmentId;

  const resetResult = await supabase.auth.resetPasswordForEmail(ownerEmail, {
    redirectTo: `${getSiteUrl(request)}/app.html`,
  });

  if (resetResult.error) {
    return json(response, {
      establishment_id: establishmentId,
      owner_email: ownerEmail,
      password_email_sent: false,
      warning: resetResult.error.message,
    });
  }

  return json(response, {
    establishment_id: establishmentId,
    owner_email: ownerEmail,
    password_email_sent: true,
  });
}
