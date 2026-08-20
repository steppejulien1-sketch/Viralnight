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
    return json(response, { error: "Missing admin session" }, 401);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data: adminData, error: adminError } = await supabase.auth.getUser(token);
  const adminEmail = adminData?.user?.email?.toLowerCase();

  if (adminError || adminEmail !== ADMIN_EMAIL) {
    return json(response, { error: "Unauthorized admin" }, 403);
  }

  let payload;
  try {
    payload = typeof request.body === "string" ? JSON.parse(request.body) : request.body;
  } catch {
    return json(response, { error: "Invalid JSON body" }, 400);
  }
  payload ||= {};

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

  const establishmentResult = await supabase
    .from("establishments")
    .insert({
      name: establishmentName,
      city: city || null,
      phone: phone || null,
      category,
      subscription_status: subscriptionStatus,
    })
    .select("id, name")
    .single();

  if (establishmentResult.error) {
    return json(response, { error: establishmentResult.error.message }, 500);
  }

  const establishmentId = establishmentResult.data.id;

  const ownerResult = await supabase.from("establishment_owners").insert({
    id: authUser.id,
    email: ownerEmail,
    establishment_id: establishmentId,
    role: "owner",
  });

  if (ownerResult.error) {
    return json(response, { error: ownerResult.error.message }, 500);
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
