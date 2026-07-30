// Outils communs aux routes de collecte publiques (api/track-*.js).
//
// Ces routes sont appelees par les clients du club, qui ne sont pas authentifies.
// Elles doivent donc etre strictes sur ce qu'elles acceptent : un endpoint public
// ecrivant en base avec la cle service_role est une cible evidente.

import { getSupabaseAdmin } from "../db/supabaseAdmin.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PUBLIC_CODE_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/;

/** Fenetre et plafond du limiteur de debit, par identifiant d'appelant. */
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20;

// Limiteur en memoire. En serverless, chaque instance a son propre compteur : cela
// n'arrete pas une attaque distribuee, mais suffit contre un script naif ou un
// rafraichissement en boucle. La vraie protection reste l'index unique en base.
const hits = new Map();

export function json(response, body, status = 200) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
}

export async function readBody(request) {
  if (request.body && typeof request.body === "object") return request.body;
  if (typeof request.body === "string") return request.body ? JSON.parse(request.body) : {};

  let raw = "";
  for await (const chunk of request) {
    raw += chunk;
    // Un corps demesure est refuse avant d'etre parse.
    if (raw.length > 10_000) throw new Error("Corps de requete trop volumineux.");
  }
  return raw ? JSON.parse(raw) : {};
}

function callerKey(request) {
  const forwarded = request.headers["x-forwarded-for"];
  const ip = Array.isArray(forwarded) ? forwarded[0] : String(forwarded || "").split(",")[0].trim();
  return ip || request.socket?.remoteAddress || "inconnu";
}

/** @returns {boolean} true si l'appelant a depasse le quota. */
export function isRateLimited(request) {
  const key = callerKey(request);
  const now = Date.now();
  const previous = hits.get(key);

  if (!previous || now - previous.start > RATE_LIMIT_WINDOW_MS) {
    hits.set(key, { start: now, count: 1 });

    // Purge opportuniste : sans cela la Map grossirait indefiniment sur une
    // instance de longue duree.
    if (hits.size > 5000) {
      for (const [entryKey, entry] of hits) {
        if (now - entry.start > RATE_LIMIT_WINDOW_MS) hits.delete(entryKey);
      }
    }
    return false;
  }

  previous.count += 1;
  return previous.count > RATE_LIMIT_MAX;
}

export function isValidCustomerId(value) {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function isValidPublicCode(value) {
  return typeof value === "string" && PUBLIC_CODE_PATTERN.test(value.trim().toUpperCase());
}

/**
 * Resout l'etablissement a partir du code public du QR.
 * Passe par une fonction SQL dediee, qui ne renvoie que l'id et le nom.
 *
 * @returns {Promise<{id: string, name: string} | null>}
 */
export async function resolveEstablishment(supabase, publicCode) {
  const { data, error } = await supabase.rpc("establishment_by_public_code", {
    p_code: publicCode.trim().toUpperCase(),
  });

  if (error) throw error;
  return data?.[0] || null;
}

/**
 * Prepare une requete publique : methode, quota, corps, validations, etablissement.
 *
 * @param {import("node:http").IncomingMessage} request
 * @param {object} [options]
 * @param {(body: object) => {error: string, status: number} | null} [options.validate]
 *   Validation supplementaire, executee AVANT tout acces a la base : une requete
 *   malformee ne doit jamais declencher de requete SQL.
 * @returns {Promise<{error: string, status: number} | {supabase, establishment, body}>}
 */
export async function preparePublicRequest(request, { validate } = {}) {
  if (request.method !== "POST") {
    return { error: "Methode non supportee.", status: 405 };
  }

  if (isRateLimited(request)) {
    return { error: "Trop de requetes. Patientez un instant.", status: 429 };
  }

  let body;
  try {
    body = await readBody(request);
  } catch {
    return { error: "Corps de requete invalide.", status: 400 };
  }

  if (!isValidPublicCode(body.code || "")) {
    return { error: "Code etablissement invalide.", status: 400 };
  }

  if (!isValidCustomerId(body.customerId)) {
    return { error: "Identifiant client invalide.", status: 400 };
  }

  const invalid = validate ? validate(body) : null;
  if (invalid) return invalid;

  // A partir d'ici on touche la base : les erreurs internes ne doivent jamais
  // remonter telles quelles a un visiteur non authentifie.
  try {
    const supabase = getSupabaseAdmin();
    const establishment = await resolveEstablishment(supabase, body.code);

    if (!establishment) {
      return { error: "Ce QR code ne correspond a aucun etablissement.", status: 404 };
    }

    return { supabase, establishment, body };
  } catch (error) {
    console.error("[tracking] preparation impossible", error);
    return { error: "Service momentanement indisponible.", status: 503 };
  }
}
