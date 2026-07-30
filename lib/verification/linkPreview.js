// Apercu d'une publication, pour verifier un contenu sans ouvrir l'application.
//
// Ce que chaque plateforme accepte reellement de donner publiquement :
//   - TikTok  : auteur, titre, miniature (oEmbed public, sans cle)
//   - YouTube : titre, auteur (oEmbed public) + nombre de vues REEL si une cle
//               YOUTUBE_API_KEY est configuree
//   - Instagram : plus rien depuis la fermeture de son oEmbed public
//
// Aucune plateforme ne donne les vues d'une story. C'est une limite de leurs API,
// pas un manque d'effort : seul le createur du contenu y a acces, via son compte pro.

const TIMEOUT_MS = 6000;

async function recuperer(url, options = {}) {
  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controleur.signal });
  } finally {
    clearTimeout(minuteur);
  }
}

/** Identifie la plateforme et, pour YouTube, l'identifiant de la video. */
export function analyserLien(rawUrl) {
  let parsed;
  try {
    parsed = new URL(String(rawUrl).trim());
  } catch {
    return null;
  }

  if (!["http:", "https:"].includes(parsed.protocol)) return null;

  const hote = parsed.hostname.replace(/^(www\.|m\.|vm\.|vt\.)/, "").toLowerCase();

  if (hote.endsWith("tiktok.com")) return { plateforme: "tiktok", url: parsed.toString() };

  if (hote === "youtu.be") {
    return { plateforme: "youtube", url: parsed.toString(), videoId: parsed.pathname.slice(1) };
  }

  if (hote.endsWith("youtube.com")) {
    const videoId = parsed.searchParams.get("v") || parsed.pathname.match(/\/shorts\/([\w-]+)/)?.[1] || null;
    return { plateforme: "youtube", url: parsed.toString(), videoId };
  }

  if (hote.endsWith("instagram.com")) return { plateforme: "instagram", url: parsed.toString() };

  return null;
}

async function apercuOEmbed(endpoint) {
  const reponse = await recuperer(endpoint, {
    headers: { "User-Agent": "Mozilla/5.0 ViralNightVerification/1.0" },
  });
  if (!reponse.ok) return null;

  const data = await reponse.json();
  return {
    titre: data.title || null,
    auteur: data.author_name || null,
    compteAuteur: data.author_unique_id || null,
    miniature: data.thumbnail_url || null,
  };
}

/**
 * Nombre de vues reel d'une video YouTube.
 * C'est la seule plateforme des trois a exposer publiquement ce chiffre.
 */
async function vuesYouTube(videoId, cle) {
  if (!videoId || !cle) return null;

  const url = `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${encodeURIComponent(videoId)}&key=${encodeURIComponent(cle)}`;
  const reponse = await recuperer(url);
  if (!reponse.ok) return null;

  const data = await reponse.json();
  const vues = data.items?.[0]?.statistics?.viewCount;
  return vues === undefined ? null : Number(vues);
}

/**
 * @returns {Promise<{plateforme, titre, auteur, miniature, vues, vuesAutomatiques, note}|null>}
 */
export async function apercuLien(rawUrl, { youtubeKey } = {}) {
  const lien = analyserLien(rawUrl);
  if (!lien) return null;

  const base = {
    plateforme: lien.plateforme,
    titre: null,
    auteur: null,
    compteAuteur: null,
    miniature: null,
    vues: null,
    vuesAutomatiques: false,
    note: null,
  };

  try {
    if (lien.plateforme === "tiktok") {
      const apercu = await apercuOEmbed(`https://www.tiktok.com/oembed?url=${encodeURIComponent(lien.url)}`);
      if (!apercu) return { ...base, note: "Publication introuvable ou supprimee." };
      return { ...base, ...apercu, note: "TikTok ne publie pas le nombre de vues : a saisir a la main." };
    }

    if (lien.plateforme === "youtube") {
      const [apercu, vues] = await Promise.all([
        apercuOEmbed(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(lien.url)}`),
        vuesYouTube(lien.videoId, youtubeKey),
      ]);

      if (!apercu && vues === null) return { ...base, note: "Video introuvable ou privee." };

      return {
        ...base,
        ...(apercu || {}),
        vues,
        vuesAutomatiques: vues !== null,
        note: vues !== null
          ? "Vues recuperees automatiquement depuis YouTube."
          : "Ajoute YOUTUBE_API_KEY pour recuperer les vues automatiquement.",
      };
    }

    // Instagram a ferme son oEmbed public : aucun apercu possible sans compte developpeur.
    return {
      ...base,
      note: "Instagram ne permet aucune verification automatique : ouvre le lien pour controler.",
    };
  } catch (error) {
    return { ...base, note: `Verification impossible : ${error.message}` };
  }
}
