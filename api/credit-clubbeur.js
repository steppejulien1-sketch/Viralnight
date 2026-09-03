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
import { notifierStory } from "../lib/notifications/envoyer.js";
import { getSupabaseClubbeurAdmin } from "../lib/db/supabaseClubbeurAdmin.js";
import { requireEstablishment } from "../lib/auth/requireEstablishment.js";

const ADMIN_EMAIL = "viralnight001@gmail.com";

/* Les deux bases ne nomment pas les memes choses de la meme facon.
   Cote gerants : bar / acces / vip, du texte libre.
   Cote clubbeur : un enum reward_category (boisson, entree, vip,
   exclusif). Sans cette table, tout tomberait dans la valeur par
   defaut et la boutique clubbeur afficherait le mauvais pictogramme
   pour chaque recompense. */
const CATEGORIES = { bar: "boisson", acces: "entree", vip: "vip" };

/* Un slug lisible a partir du nom du club. Le slug est UNIQUE cote
   clubbeur : en cas de collision on suffixe par le code public, qui est
   lui-meme unique. Deux "Le Mirage" dans deux villes ne se marchent donc
   jamais dessus. */
function slugifier(nom) {
  return String(nom || "club")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "club";
}

/* Ouvre le club dans la base clubbeur.
   ------------------------------------------------------------
   Sans ca, la synchronisation refusait un club qui n'existait pas en
   face -- et la creation etait manuelle, donc jamais faite. Sur trois
   etablissements, un seul avait son pendant clubbeur.

   ⚠️ ig_handle est NOT NULL cote clubbeur, et c'est LUI qui sert a
   reconnaitre les mentions. On prend, dans l'ordre : le pseudo du
   compte Instagram reellement relie, celui saisi sur la fiche, et en
   dernier recours le slug -- qui ne correspondra a rien, mais qui
   n'empeche pas le club d'exister. La reponse dit lequel a servi pour
   que le gerant puisse corriger au lieu de se demander pourquoi rien
   ne se credite. */
async function ouvrirClubClubbeur(clubbeur, supabaseGerants, etab, establishmentId) {
  const { data: compte } = await supabaseGerants
    .from("establishment_instagram_accounts")
    .select("ig_username")
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  const handle = (compte?.ig_username || etab.ig_handle || "").replace(/^@/, "").trim();
  const base = etab.slug || slugifier(etab.name);

  const club = {
    name: etab.name || "Club",
    // NOT NULL cote clubbeur, et souvent vide cote gerant : un tiret
    // vaut mieux qu'un refus de creation.
    city: etab.city || "—",
    slug: base,
    ig_handle: handle || base,
    primary_color: etab.primary_color || "#ff6363",
    b2b_public_code: etab.public_code,
  };

  let insertion = await clubbeur.from("clubs").insert(club).select("id").single();

  // Slug deja pris : on suffixe par le code public, unique par
  // construction. Une seule reprise, pas de boucle.
  if (insertion.error && /slug/.test(insertion.error.message || "")) {
    club.slug = base + "-" + String(etab.public_code || "").toLowerCase();
    insertion = await clubbeur.from("clubs").insert(club).select("id").single();
  }

  if (insertion.error) return { error: insertion.error.message };
  return { id: insertion.data.id, handle: club.ig_handle, handleDevine: !compte?.ig_username };
}

/* ============================================================
   ?action=sync-boutique — la boutique du gerant pilote celle des
   clubbeurs.
   ------------------------------------------------------------
   Le gerant editait `rewards` cote gerants, l'appli clubbeur lisait
   `rewards` cote clubbeur, et RIEN ne circulait entre les deux. Un club
   pouvait changer ses prix toute la nuit sans que personne le voie.

   La jointure passe par le code public du club, seule cle commune et
   deja peuplee des deux cotes a l'identique :
       establishments.public_code  ==  clubs.b2b_public_code

   Greffe sur cette route plutot qu'un fichier a part : le plan Vercel
   plafonne a 12 fonctions et api/ y est deja. C'est de toute facon la
   route "pont" du projet.

   ⚠️ AUTHENTIFIE PAR requireEstablishment, pas par ADMIN_EMAIL comme le
   reste du fichier : c'est le gerant qui declenche, pas l'admin. Et
   l'establishment vient du jeton, jamais du corps -- sinon il suffirait
   de deviner un UUID pour reecrire la boutique d'un autre club.
   ============================================================ */
async function actionSyncBoutique(request, response) {
  const auth = await requireEstablishment(request);
  if (auth.error) return json(response, { error: auth.error }, auth.status);

  let clubbeur;
  try {
    clubbeur = getSupabaseClubbeurAdmin();
  } catch (erreur) {
    return json(response, { error: "Base clubbeur non configuree sur ce serveur." }, 500);
  }

  const { data: etab, error: erreurEtab } = await auth.supabase
    .from("establishments")
    .select("public_code, name, city, slug, ig_handle, primary_color")
    .eq("id", auth.establishmentId)
    .maybeSingle();

  if (erreurEtab) return json(response, { error: erreurEtab.message }, 500);
  if (!etab?.public_code) {
    return json(response, { error: "Ce club n'a pas encore de code public." }, 409);
  }

  const recherche = await clubbeur
    .from("clubs")
    .select("id")
    .eq("b2b_public_code", etab.public_code)
    .maybeSingle();

  const erreurClub = recherche.error;
  // let et non const : reassigne juste en dessous quand il faut ouvrir
  // le club. En const, l'affectation partait en TypeError a l'execution
  // -- que `node --check` ne voit pas, il ne verifie que la syntaxe.
  let club = recherche.data;

  if (erreurClub) return json(response, { error: erreurClub.message }, 500);

  // Pas de club en face : on l'ouvre. La synchronisation refusait
  // jusqu'ici, et l'ouverture manuelle n'etait jamais faite -- sur trois
  // etablissements, un seul avait son pendant clubbeur.
  let clubOuvert = null;
  if (!club?.id) {
    const cree = await ouvrirClubClubbeur(clubbeur, auth.supabase, etab, auth.establishmentId);
    if (cree.error) {
      return json(response, { error: "Ouverture du club impossible : " + cree.error }, 500);
    }
    club = { id: cree.id };
    clubOuvert = cree;
  }

  const { data: source, error: erreurSource } = await auth.supabase
    .from("rewards")
    .select("id, title, points_required, max_redemptions, category, active, image_url")
    .eq("establishment_id", auth.establishmentId);

  if (erreurSource) return json(response, { error: erreurSource.message }, 500);

  const { data: existantes, error: erreurExistantes } = await clubbeur
    .from("rewards")
    .select("id, source_reward_id, stock_limit, stock_remaining")
    .eq("club_id", club.id)
    .not("source_reward_id", "is", null);

  if (erreurExistantes) return json(response, { error: erreurExistantes.message }, 500);

  const parSource = new Map((existantes || []).map((r) => [r.source_reward_id, r]));
  let creees = 0;
  let majes = 0;

  for (const r of source || []) {
    const commun = {
      club_id: club.id,
      source_reward_id: r.id,
      title: r.title || "Récompense",
      cost_points: Math.max(0, Math.round(Number(r.points_required) || 0)),
      category: CATEGORIES[r.category] || "boisson",
      stock_limit: r.max_redemptions === null || r.max_redemptions === undefined
        ? null
        : Math.max(0, Math.round(Number(r.max_redemptions))),
      /* La photo du club traverse enfin. Sans elle, la boutique clubbeur
         affiche le pictogramme de famille -- le meme dessin de coupe
         pour tous les cocktails de tous les clubs. On n'a pas envie
         d'acheter un pictogramme.
         Null quand le club n'a rien televerse : l'appli clubbeur retombe
         alors sur choisirArt(), exactement comme avant. */
      image_url: r.image_url || null,
      active: r.active !== false,
    };

    const deja = parSource.get(r.id);

    if (!deja) {
      // A la creation seulement, le stock restant part du plafond.
      const insertion = await clubbeur
        .from("rewards")
        .insert({ ...commun, stock_remaining: commun.stock_limit });
      if (insertion.error) return json(response, { error: insertion.error.message }, 500);
      creees += 1;
      continue;
    }

    /* ⚠️ stock_remaining N'EST PAS REECRIT sur une mise a jour.
       C'est le stock deja consomme par les clubbeurs ce soir : le
       remettre au plafond a chaque enregistrement du gerant rendrait
       gratuitement disponible ce qui vient d'etre echange, et personne
       ne s'en apercevrait. Seul le PLAFOND suit le gerant.

       Un plafond qu'on baisse sous le restant est ramene au plafond :
       sinon la boutique promettrait plus de pieces qu'il n'en existe. */
    const majStock =
      commun.stock_limit !== null && deja.stock_remaining !== null && deja.stock_remaining > commun.stock_limit
        ? { stock_remaining: commun.stock_limit }
        : {};

    const maj = await clubbeur
      .from("rewards")
      .update({ ...commun, ...majStock })
      .eq("id", deja.id);
    if (maj.error) return json(response, { error: maj.error.message }, 500);
    majes += 1;
    parSource.delete(r.id);
  }

  /* Ce qui reste dans la table n'a plus de source : la recompense a ete
     supprimee cote gerant. On la desactive, jamais on ne la supprime --
     un bon deja echange la reference encore (meme raisonnement que
     retirerRecompense cote gerant). */
  let retirees = 0;
  for (const orpheline of parSource.values()) {
    const arret = await clubbeur.from("rewards").update({ active: false }).eq("id", orpheline.id);
    if (!arret.error) retirees += 1;
  }

  return json(response, {
    club: etab.name,
    creees,
    majes,
    retirees,
    // Le gerant doit savoir que son club vient d'etre ouvert, et avec
    // quel pseudo Instagram -- c'est lui qui decide si les mentions
    // seront reconnues.
    ouvert: clubOuvert ? { handle: clubOuvert.handle, devine: clubOuvert.handleDevine } : null,
  });
}

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

  const action = new URL(request.url, "http://localhost").searchParams.get("action");
  if (action === "sync-boutique") return actionSyncBoutique(request, response);

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

  const attribues = sortie.awarded ?? 0;

  // Notification push — apres le credit, jamais avant : on n'annonce que
  // ce qui est deja acquis.
  //
  // ⚠️ Le resultat n'est PAS remonte en erreur. notifierStory ne leve
  // jamais et se contente de dire combien d'appareils ont ete touches. Un
  // service de push en panne ne doit pas faire echouer cette requete :
  // l'admin verrait une erreur alors que les points sont bien credites, et
  // revaliderait -- donc rejouerait un credit deja fait. Le pire cas ici
  // est un clubbeur qui n'est pas prevenu, pas un clubbeur mal credite.
  const notif = await notifierStory({
    storyId: contenu.external_story_id,
    type: approve ? "story_validee" : "story_refusee",
    points: attribues,
  });

  return json(response, {
    ok: true,
    awarded: attribues,
    unlocks_at: sortie.unlocks_at ?? null,
    // Visible dans la reponse pour que le back-office puisse afficher
    // "prevenu" ou non, et surtout pour diagnostiquer sans deviner :
    // `raison` dit pourquoi rien n'est parti.
    notifications: notif,
  });
}
