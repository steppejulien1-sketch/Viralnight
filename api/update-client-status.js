import { createClient } from "@supabase/supabase-js";

const ADMIN_EMAIL = "viralnight001@gmail.com";
const ALLOWED_STATUSES = new Set(["actif", "essai", "suspendu"]);

function json(response, body, status = 200) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
}

async function readBody(request) {
  if (request.body && typeof request.body === "object") return request.body;
  if (typeof request.body === "string") return request.body ? JSON.parse(request.body) : {};

  let rawBody = "";
  for await (const chunk of request) {
    rawBody += chunk;
  }
  return rawBody ? JSON.parse(rawBody) : {};
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
    payload = await readBody(request);
  } catch {
    return json(response, { error: "Invalid JSON body" }, 400);
  }

  const ownerEmail = String(payload.owner_email || "").trim().toLowerCase();
  const subscriptionStatus = String(payload.subscription_status || "").trim();

  if (!ownerEmail) {
    return json(response, { error: "Client email is required" }, 400);
  }

  if (!ALLOWED_STATUSES.has(subscriptionStatus)) {
    return json(response, { error: "Invalid subscription status" }, 400);
  }

  const ownerResult = await supabase
    .from("establishment_owners")
    .select("email, establishment_id")
    .ilike("email", ownerEmail)
    .maybeSingle();

  if (ownerResult.error) {
    return json(response, { error: ownerResult.error.message }, 500);
  }

  if (!ownerResult.data?.establishment_id) {
    return json(response, { error: "Client not found" }, 404);
  }

  const updateResult = await supabase
    .from("establishments")
    .update({ subscription_status: subscriptionStatus })
    .eq("id", ownerResult.data.establishment_id)
    .select("id, name, subscription_status")
    .single();

  if (updateResult.error) {
    return json(response, { error: updateResult.error.message }, 500);
  }

  return json(response, {
    ok: true,
    owner_email: ownerEmail,
    establishment_id: updateResult.data.id,
    establishment_name: updateResult.data.name,
    subscription_status: updateResult.data.subscription_status,
  });
}
