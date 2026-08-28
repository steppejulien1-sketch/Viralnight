import { createClient } from "@supabase/supabase-js";

const ADMIN_EMAIL = "viralnight001@gmail.com";
const SOCIAL_PLATFORMS = ["instagram", "tiktok", "facebook", "linkedin", "youtube"];

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

function cleanText(value) {
  return String(value || "").trim();
}

function normalizeUrl(value) {
  const raw = cleanText(value);
  if (!raw) return "";

  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function normalizeSpace(value) {
  return cleanText(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#039;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function parseNumber(value) {
  const raw = cleanText(value).replace(/\s/g, "");
  const compact = /^\d{1,3}([.,]\d{3})+$/.test(raw) ? raw.replace(/[.,]/g, "") : raw.replace(/[^\d]/g, "");
  const number = Number(compact);
  return Number.isFinite(number) ? number : 0;
}

async function fetchHtml(url, maxLength = 900000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6500);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 NoctifyQualification/1.0",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    if (!response.ok) return "";

    const text = await response.text();
    return text.slice(0, maxLength);
  } catch {
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

async function verifyAdmin(request) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return { error: "Supabase admin env vars missing", status: 500 };
  }

  const token = (request.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return { error: "Missing admin session", status: 401 };

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data, error } = await supabase.auth.getUser(token);
  const email = data?.user?.email?.toLowerCase();

  if (error || email !== ADMIN_EMAIL) {
    return { error: "Unauthorized admin", status: 403 };
  }

  return { ok: true };
}

function findContact(html, payload) {
  const text = normalizeSpace(html);
  const email = cleanText(payload.email) || (text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "");
  const phone =
    cleanText(payload.phone) ||
    (text.match(/(?:\+|00)?\d[\d\s().-]{7,}\d/)?.[0] || "")
      .replace(/\s+/g, " ")
      .trim();

  return { email, phone };
}

function isSocialUrl(platform, url) {
  try {
    const { hostname, pathname } = new URL(url);
    const host = hostname.replace(/^www\./, "");
    const path = pathname.toLowerCase();

    if (platform === "instagram") return host.endsWith("instagram.com") && !/^\/(p|reel|stories|explore|tags)\//.test(path);
    if (platform === "tiktok") return host.endsWith("tiktok.com") && path.startsWith("/@");
    if (platform === "facebook") return host.endsWith("facebook.com") && !path.includes("/sharer");
    if (platform === "linkedin") return host.endsWith("linkedin.com") && path.includes("/company/");
    if (platform === "youtube") return host.endsWith("youtube.com") || host.endsWith("youtu.be");
    return false;
  } catch {
    return false;
  }
}

function extractSocials(html, baseUrl, manualSocials = {}) {
  const socials = {};

  for (const platform of SOCIAL_PLATFORMS) {
    const manualUrl = normalizeUrl(manualSocials[platform]);
    if (manualUrl && isSocialUrl(platform, manualUrl)) {
      socials[platform] = {
        url: manualUrl,
        confidence: "moyenne",
        followers: null,
      };
    }
  }

  if (!html || !baseUrl) return socials;

  const matches = [...html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)];

  for (const match of matches) {
    let absoluteUrl = "";
    try {
      absoluteUrl = new URL(match[1], baseUrl).href;
    } catch {
      continue;
    }

    for (const platform of SOCIAL_PLATFORMS) {
      if (!socials[platform] && isSocialUrl(platform, absoluteUrl)) {
        socials[platform] = {
          url: absoluteUrl,
          confidence: "élevée",
          followers: null,
        };
      }
    }
  }

  return socials;
}

function extractInternalPageUrls(html, siteUrl) {
  if (!html || !siteUrl) return [];

  const urls = new Set();
  const origin = new URL(siteUrl).origin;
  const interestingPath = /(contact|booking|reserve|reservation|event|events|venue|about|private|corporate|faq)/i;

  for (const match of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
    try {
      const url = new URL(match[1], siteUrl);
      if (url.origin === origin && interestingPath.test(url.pathname)) urls.add(url.href);
    } catch {
      continue;
    }
  }

  return [...urls].slice(0, 5);
}

function parseFollowers(text) {
  const match = text.match(/(\d[\d\s.,]{1,12})\s*(k|m|millions?|thousand|followers|abonn[ée]s|fans)/i);
  if (!match) return null;

  const base = parseNumber(match[1]);
  if (!base) return null;

  const suffix = match[2].toLowerCase();
  if (suffix === "k" || suffix === "thousand") return base * 1000;
  if (suffix === "m" || suffix.startsWith("million")) return base * 1000000;
  return base;
}

function detectContentTypes(text) {
  const lower = text.toLowerCase();
  const types = [];

  if (/\bstor(?:y|ies)\b/.test(lower)) types.push("stories");
  if (/\breels?\b/.test(lower)) types.push("Reels");
  if (/\btiktoks?\b/.test(lower)) types.push("TikToks");
  if (/\baftermovies?\b/.test(lower)) types.push("aftermovies");
  if (/\b(events?|événements?|soirées?)\b/.test(lower)) types.push("événements");
  if (/\bphotos?\b/.test(lower)) types.push("photos simples");

  return [...new Set(types)];
}

async function enrichSocialSignals(socials) {
  const contentTypes = [];

  await Promise.all(
    Object.values(socials).map(async (social) => {
      const html = await fetchHtml(social.url, 260000);
      if (!html) return;

      const text = normalizeSpace(html);
      social.followers = parseFollowers(text);
      contentTypes.push(...detectContentTypes(text));
    }),
  );

  return [...new Set(contentTypes)];
}

function findCapacity(pages) {
  const patterns = [
    {
      regex: /(capacit(?:é|e)|capacity)[^.\n]{0,90}?(\d[\d\s.,]{1,8})\s*(personnes|pers|people|guests|clients|places)?/i,
      index: 2,
      confidence: "élevée",
    },
    {
      regex: /(?:jusqu['’]?\s?à|up to|maximum)[^.\n]{0,70}?(\d[\d\s.,]{1,8})\s*(personnes|pers|people|guests|clients|places)/i,
      index: 1,
      confidence: "moyenne",
    },
    {
      regex: /(\d[\d\s.,]{1,8})\s*(personnes|pers|people|guests|clients|places)[^.\n]{0,70}?(capacit|capacity|event|club|venue)/i,
      index: 1,
      confidence: "moyenne",
    },
  ];

  for (const page of pages) {
    const text = normalizeSpace(page.html);

    for (const pattern of patterns) {
      const match = text.match(pattern.regex);
      const capacity = parseNumber(match?.[pattern.index]);

      if (capacity >= 50 && capacity <= 10000) {
        return {
          capacity_max: capacity,
          capacity_type: "officielle",
          capacity_source: page.url,
          capacity_confidence: pattern.confidence,
        };
      }
    }
  }

  return {
    capacity_max: null,
    capacity_type: "inconnue",
    capacity_source: "",
    capacity_confidence: "",
  };
}

function sizeFromCapacity(capacity) {
  if (!capacity) return "";
  if (capacity < 300) return "petit";
  if (capacity <= 800) return "moyen";
  if (capacity <= 1500) return "grand";
  return "très grand";
}

function estimateSizeFromText(text) {
  const lower = text.toLowerCase();

  if (/(mega club|warehouse|arena|très grand|very large|plusieurs salles|multi-room|festival)/.test(lower)) return "très grand";
  if (/(grand club|large venue|big room|main room|dancefloor principal)/.test(lower)) return "grand";
  if (/(club|dancefloor|vip|terrasse|rooftop|events?|événements?)/.test(lower)) return "moyen";
  if (/(bar|lounge|intimiste|intimate|cocktail)/.test(lower)) return "petit";
  return "inconnue";
}

function socialActivity(socials, contentTypes) {
  const socialCount = Object.keys(socials).length;
  const maxFollowers = Math.max(0, ...Object.values(socials).map((social) => Number(social.followers || 0)));
  const hasVideoSignals = contentTypes.some((type) => ["Reels", "TikToks", "aftermovies", "événements"].includes(type));

  if (socialCount >= 2 && (hasVideoSignals || maxFollowers >= 10000)) return "élevé";
  if (socialCount >= 1) return "moyen";
  return "faible";
}

function prospectScore(prospect) {
  let score = 0;

  if (prospect.email) score += 20;
  if (prospect.socials?.instagram?.url) score += 15;
  if (prospect.socials?.tiktok?.url) score += 10;
  if (prospect.capacity_type === "officielle" && prospect.capacity_max) score += 15;
  if (["moyen", "grand", "très grand"].includes(prospect.size_category)) score += 15;
  if (prospect.social_activity === "élevé") score += 15;
  if (prospect.site) score += 10;

  return Math.min(score, 100);
}

function prospectStatus(score) {
  if (score >= 75) return "Prioritaire";
  if (score >= 50) return "À contacter";
  return "À enrichir";
}

function prospectMessage(prospect) {
  if (prospect.score >= 75) {
    return `${prospect.club} semble déjà actif en ligne : Noctify peut transformer cette visibilité en retours clients mesurables.`;
  }

  if (prospect.socials?.instagram?.url || prospect.socials?.tiktok?.url) {
    return `${prospect.club} a déjà une base sociale exploitable : proposez une activation stories/Reels avec récompenses.`;
  }

  return `${prospect.club} mérite un premier contact simple : présenter Noctify comme un moyen d'obtenir plus de contenu client sans charge opérationnelle.`;
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    return json(response, { error: "Method not allowed" }, 405);
  }

  const admin = await verifyAdmin(request);
  if (!admin.ok) return json(response, { error: admin.error }, admin.status);

  let payload;
  try {
    payload = await readBody(request);
  } catch {
    return json(response, { error: "Invalid JSON body" }, 400);
  }

  const club = cleanText(payload.club);
  const site = normalizeUrl(payload.site);

  if (!club) {
    return json(response, { error: "Club name is required" }, 400);
  }

  const html = site ? await fetchHtml(site) : "";
  const internalUrls = site ? extractInternalPageUrls(html, site) : [];
  const internalPages = await Promise.all(
    internalUrls.map(async (url) => ({
      url,
      html: await fetchHtml(url, 500000),
    })),
  );
  const pages = [{ url: site, html }, ...internalPages].filter((page) => page.url && page.html);
  const combinedHtml = pages.map((page) => page.html).join(" ");
  const text = normalizeSpace(combinedHtml);
  const contact = findContact(combinedHtml, payload);
  const socials = extractSocials(combinedHtml, site, payload.socials || {});
  const socialContentTypes = await enrichSocialSignals(socials);
  const siteContentTypes = detectContentTypes(text);
  const contentTypes = [...new Set([...siteContentTypes, ...socialContentTypes])];
  const capacity = findCapacity(pages);
  const sizeCategory = sizeFromCapacity(capacity.capacity_max) || estimateSizeFromText(text);

  if (!capacity.capacity_max && sizeCategory !== "inconnue") {
    capacity.capacity_type = "estimée";
    capacity.capacity_source = site;
    capacity.capacity_confidence = "faible";
  }

  const prospect = {
    club,
    city: cleanText(payload.city),
    address: cleanText(payload.address),
    site,
    email: contact.email,
    phone: contact.phone,
    socials,
    capacity_max: capacity.capacity_max,
    capacity_type: capacity.capacity_type,
    capacity_source: capacity.capacity_source,
    capacity_confidence: capacity.capacity_confidence,
    size_category: sizeCategory || "inconnue",
    content_types: contentTypes,
    social_activity: socialActivity(socials, contentTypes),
    scanned_at: new Date().toISOString(),
  };

  prospect.score = prospectScore(prospect);
  prospect.status = prospectStatus(prospect.score);
  prospect.message = prospectMessage(prospect);

  return json(response, { prospect });
}
