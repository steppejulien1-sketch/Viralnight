const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sendJson(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

function cleanText(value) {
  return String(value || "").trim();
}

function escapeHtml(value) {
  return cleanText(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function readJsonBody(request) {
  if (request.body && typeof request.body === "object") {
    return request.body;
  }

  if (typeof request.body === "string") {
    return request.body ? JSON.parse(request.body) : {};
  }

  let rawBody = "";

  for await (const chunk of request) {
    rawBody += chunk;
  }

  return rawBody ? JSON.parse(rawBody) : {};
}

function getPayload(body) {
  const payload = {
    club: cleanText(body.club),
    email: cleanText(body.email).toLowerCase(),
    phone: cleanText(body.phone),
  };

  if (!payload.club) {
    throw new Error("Le nom du club est obligatoire.");
  }

  if (!emailRegex.test(payload.email)) {
    throw new Error("L'adresse email est invalide.");
  }

  // La policy RLS demo_requests_public_insert exige un phone non
  // vide. On refuse ici plutot que de laisser Supabase renvoyer
  // une erreur illisible.
  if (!payload.phone) {
    throw new Error("Le numéro de téléphone est obligatoire.");
  }

  return payload;
}

async function insertDemoRequest(payload) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase n'est pas configuré côté serveur.");
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/demo_requests`, {
    method: "POST",
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(details || "Supabase a refusé l'enregistrement.");
  }
}

async function sendNotificationEmail(payload) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.NOTIFICATION_EMAIL;
  const from = process.env.NOTIFICATION_FROM || "ViralNight <onboarding@resend.dev>";

  if (!apiKey || !to) {
    return false;
  }

  const safeClub = escapeHtml(payload.club);
  const safeEmail = escapeHtml(payload.email);
  const safePhone = escapeHtml(payload.phone);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `Nouvelle demande ViralNight - ${payload.club}`,
      html: `
        <h2>Nouvelle demande de démo ViralNight</h2>
        <p><strong>Club :</strong> ${safeClub}</p>
        <p><strong>Email :</strong> ${safeEmail}</p>
        <p><strong>Téléphone :</strong> ${safePhone}</p>
      `,
      text: [
        "Nouvelle demande de démo ViralNight",
        `Club : ${payload.club}`,
        `Email : ${payload.email}`,
        `Téléphone : ${payload.phone}`,
      ].join("\n"),
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(details || "Resend n'a pas pu envoyer l'email.");
  }

  return true;
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    sendJson(response, 405, { message: "Méthode non autorisée." });
    return;
  }

  try {
    const body = await readJsonBody(request);
    const payload = getPayload(body);

    await insertDemoRequest(payload);
    let emailSent = false;

    try {
      emailSent = await sendNotificationEmail(payload);
    } catch (emailError) {
      console.error("Demo request notification failed", emailError);
    }

    sendJson(response, 200, { ok: true, emailSent });
  } catch (error) {
    sendJson(response, 400, {
      ok: false,
      message: error.message || "Impossible d'enregistrer la demande.",
    });
  }
}
