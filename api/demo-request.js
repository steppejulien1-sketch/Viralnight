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

/* Plafonds de longueur.
   Cette route est PUBLIQUE et non authentifiee : elle insere en base et
   envoie un email a chaque appel. Sans plafond, un champ de plusieurs
   dizaines de milliers de caracteres part en base et dans le mail. Aucun
   nom de club ne fait 120 caracteres -- on coupe au lieu de refuser,
   pour ne jamais perdre une vraie demande a cause d'un espace en trop. */
const TAILLES = { club: 120, email: 160, phone: 40 };

function getPayload(body) {
  const payload = {
    club: cleanText(body.club).slice(0, TAILLES.club),
    email: cleanText(body.email).toLowerCase().slice(0, TAILLES.email),
    phone: cleanText(body.phone).slice(0, TAILLES.phone),
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

/* Y a-t-il deja une demande de cette adresse dans les dix dernieres
   minutes ? Une lecture, pas un compteur en memoire : les fonctions
   serverless ne partagent rien entre deux appels, un compteur local ne
   protegerait donc rien.

   En cas d'echec de lecture on laisse PASSER : mieux vaut accepter une
   demande en double que d'en perdre une vraie parce que la base a
   hoquete. */
async function demandeRecente(email) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return false;

  const depuis = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const url =
    `${supabaseUrl}/rest/v1/demo_requests?select=id&limit=1` +
    `&email=eq.${encodeURIComponent(email)}&created_at=gte.${encodeURIComponent(depuis)}`;

  try {
    const reponse = await fetch(url, {
      headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
    });
    if (!reponse.ok) return false;
    const lignes = await reponse.json();
    return Array.isArray(lignes) && lignes.length > 0;
  } catch (erreur) {
    console.error("[demo-request] controle de doublon impossible:", erreur.message);
    return false;
  }
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
  const from = process.env.NOTIFICATION_FROM || "Noctify <onboarding@resend.dev>";

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
      subject: `Nouvelle demande Noctify - ${payload.club}`,
      html: `
        <h2>Nouvelle demande de démo Noctify</h2>
        <p><strong>Club :</strong> ${safeClub}</p>
        <p><strong>Email :</strong> ${safeEmail}</p>
        <p><strong>Téléphone :</strong> ${safePhone}</p>
      `,
      text: [
        "Nouvelle demande de démo Noctify",
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

    // Une meme adresse ne peut pas redemander une demo toutes les
    // secondes. Sans ce delai, la route est un distributeur : elle
    // insere en base ET envoie un email a chaque appel, ce qui suffit a
    // remplir la table, saturer la boite de reception et bruler le quota
    // Resend. Dix minutes ne genent personne de bonne foi -- quelqu'un
    // qui corrige une faute dans son numero reessaie dans la minute et
    // recoit un message clair, pas une erreur.
    const recent = await demandeRecente(payload.email);
    if (recent) {
      sendJson(response, 429, {
        ok: false,
        message: "Une demande vient déjà d'être envoyée avec cette adresse. On vous répond très vite.",
      });
      return;
    }

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
