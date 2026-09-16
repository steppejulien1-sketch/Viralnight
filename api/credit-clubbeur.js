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
// VARIABLES : PWA_FUNCTIONS_URL, PWA_BRIDGE_SECRET,
//             SUPABASE_CLUBBEUR_URL, SUPABASE_CLUBBEUR_SERVICE_ROLE_KEY

import { createClient } from "@supabase/supabase-js";
import { notifierStory, notifierCadeauDuJour, pousserA } from "../lib/notifications/envoyer.js";
import { libelleMotifDepart, MOTIFS_DEPART } from "../lib/notifications/push.js";
import { joursEntre, seuilAutoValidation } from "../lib/admin/pilotage.js";
import { deciderStory } from "../lib/admin/deciderContenu.js";
import { getSupabaseAdmin } from "../lib/db/supabaseAdmin.js";
import { timingSafeEqual } from "node:crypto";
import { envoyerEmail } from "../lib/notifications/email.js";
import { getSupabaseClubbeurAdmin } from "../lib/db/supabaseClubbeurAdmin.js";
import { requireEstablishment } from "../lib/auth/requireEstablishment.js";
import { doitRepondre, repondre, messageEnregistre } from "../lib/support/reponseAuto.js";

const ADMIN_EMAIL = "steppejulien1@gmail.com";

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
    // La photo de couverture deposee dans le parcours d'installation.
    // Sans cette ligne, elle restait cote gerant : le club apparaissait
    // sur la carte des clubbeurs avec un rond vide alors que le gerant
    // avait bel et bien mis une photo -- et rien ne le disait.
    logo_url: etab.logo_url || null,
    b2b_public_code: etab.public_code,
    // Les deux cles de jointure sont posees d'un coup. b2b_public_code
    // sert a la synchro de boutique, establishment_id au credit
    // automatique des mentions (clubbeur_pont_points_automatiques.sql).
    // En remplir une seule laisserait l'autre chemin muet -- c'est
    // exactement ce qui s'etait passe.
    establishment_id: establishmentId,
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
    .select("public_code, name, city, slug, ig_handle, primary_color, logo_url")
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

  /* La photo suit a CHAQUE synchro, pas seulement a la creation du club.
     Le gerant peut la changer des mois apres son installation : si elle
     n'etait copiee qu'a l'ouverture, la carte des clubbeurs garderait
     pour toujours celle du premier jour (ou aucune). */
  if (!clubOuvert) {
    await clubbeur
      .from("clubs")
      .update({ logo_url: etab.logo_url || null })
      .eq("id", club.id);
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

/* ?action=notifier-cadeau — le rappel du matin.
   Programme dans vercel.json, protege par CRON_SECRET comme les deux
   taches Instagram : jamais appelable par un club ni un clubbeur.

   ⚠️ SUR HOBBY, L'HEURE EST APPROXIMATIVE A ±59 MINUTES (limite
   documentee par Vercel). Le cron est donc pose a 9 h UTC et non 8 h :
   a 8 h UTC, un declenchement tardif en hiver tomberait encore avant
   10 h a Paris, quand jour_cadeau() n'a pas encore bascule -- on
   annoncerait un cadeau qui n'existe pas. A 9 h UTC, la fenetre reelle
   est 10 h-10 h 59 en hiver et 11 h-11 h 59 en ete : jamais trop tot. */
async function actionNotifierCadeau(request, response) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return json(response, { error: "CRON_SECRET absent de ce serveur : aucune tache planifiee ne peut s'executer." }, 401);
  }
  if (request.headers.authorization !== `Bearer ${secret}`) {
    return json(response, { error: "Non autorise." }, 401);
  }

  try {
    const bilan = await notifierCadeauDuJour();
    return json(response, { ok: true, ...bilan });
  } catch (erreur) {
    // Une tache de fond qui echoue ne doit pas rester silencieuse : le
    // cron se contente d'un code HTTP, les logs portent le detail.
    console.error("[credit-clubbeur:notifier-cadeau]", erreur);
    return json(response, { error: "Envoi impossible." }, 500);
  }
}

/* ?action=auto-valider — la validation automatique a 24 h (14/09/2026).
   Julien : « que ca se valide automatiquement au bout de vingt-quatre
   heures ». Appelee chaque heure par pg_cron dans la base clubbeur (migration
   0047), pas par Vercel : sur Hobby, un cron Vercel ne tourne qu'une fois par
   jour et une story aurait pu attendre 47 h.

   Authentifiee par l'en-tete x-noctify-auto (secret AUTO_VALIDATION_SECRET,
   le meme que dans Vault), ou par CRON_SECRET si un jour Vercel l'appelle.
   Comparaison a temps constant. Ne valide QUE ce qui attend depuis plus de
   24 h sans avoir ete refuse : l'appeler plus souvent n'avance rien. */
function secretEgal(fourni, attendu) {
  const a = Buffer.from(String(fourni || ""));
  const b = Buffer.from(String(attendu || ""));
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

async function actionAutoValider(request, response) {
  const autorise =
    (process.env.AUTO_VALIDATION_SECRET && secretEgal(request.headers["x-noctify-auto"], process.env.AUTO_VALIDATION_SECRET)) ||
    (process.env.CRON_SECRET && secretEgal(request.headers.authorization, `Bearer ${process.env.CRON_SECRET}`));
  if (!autorise) return json(response, { error: "Non autorise." }, 401);

  let clubbeur;
  let gerants;
  try {
    clubbeur = getSupabaseClubbeurAdmin();
    gerants = getSupabaseAdmin();
  } catch {
    return json(response, { error: "Configuration serveur incomplete" }, 500);
  }

  // 40 par passage, par paquets de 5 : large pour l'heure, et loin du
  // delai maximal d'une fonction Vercel. Le reste passe l'heure suivante.
  const { data: aValider, error } = await clubbeur
    .from("story_events")
    .select("id")
    .eq("verified", false)
    .is("review_status", null)
    .lte("mentioned_at", seuilAutoValidation())
    .order("mentioned_at")
    .limit(40);
  if (error) return json(response, { error: error.message }, 500);

  const bilan = { examines: aValider.length, valides: 0, points: 0, notifies: 0, deja: 0, erreurs: 0 };
  for (let i = 0; i < aValider.length; i += 5) {
    const resultats = await Promise.all(
      aValider.slice(i, i + 5).map((s) => deciderStory({ clubbeur, gerants, storyId: s.id, approve: true, auto: true }))
    );
    for (const r of resultats) {
      if (r.ok) {
        bilan.valides += 1;
        bilan.points += r.points;
        bilan.notifies += r.notifie;
      } else if (r.code === "deja") {
        bilan.deja += 1;
      } else {
        bilan.erreurs += 1;
        console.error("[auto-valider]", r.message);
      }
    }
  }
  return json(response, { ok: true, ...bilan });
}

/* Les origines de la coquille mobile. Une appli Capacitor ne s'execute pas
   sur notre domaine : iOS sert la page depuis capacitor://localhost et
   Android depuis https://localhost. Sans en-tete CORS, le navigateur
   embarque refuse la reponse avant meme que le code la voie.

   Liste blanche plutot que "*" : cette route efface des comptes. Ce n'est
   pas le CORS qui autorise l'appel — c'est le jeton de session, verifie
   plus bas — mais autant ne pas l'offrir a n'importe quelle page web. */
const ORIGINES_APPLI = new Set([
  "capacitor://localhost",
  "ionic://localhost",
  "http://localhost",
  "https://localhost",
  "https://viralnight-koif.vercel.app",
]);

function poserCors(request, response) {
  const origine = request.headers.origin;
  if (!origine || !ORIGINES_APPLI.has(origine)) return;
  response.setHeader("Access-Control-Allow-Origin", origine);
  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  response.setHeader("Access-Control-Max-Age", "86400");
}

/* ================= LE SUPPORT PREVIENT (13/09/2026) =================
   Julien : "creer un vrai systeme, que je recoive quelque chose quand
   quelqu'un contacte le support". Le message est ecrit par l'appli dans
   support_messages (RLS : chacun ses lignes) ; l'appli appelle ensuite
   cette action, qui previent.

   ?action=support-nouveau : un clubbeur vient d'ecrire -> e-mail a
     NOTIFICATION_EMAIL (Resend, comme les demandes de demo) + notification
     sur les telephones de l'admin.
   ?action=support-reponse : l'admin vient de repondre -> notification au
     clubbeur.

   ⚠️ RIEN NE VIENT DU CORPS DE LA REQUETE, SAUF LE DESTINATAIRE D'UNE
   REPONSE. Qui ecrit est relu du jeton ; CE qu'il a ecrit est relu en base
   (le dernier message, de moins de deux minutes). Sans ca, n'importe qui
   pourrait envoyer a Julien un e-mail au texte de son choix. Et une reponse
   n'est notifiee que si le demandeur EST l'admin et qu'un message admin
   vient bien d'etre pose dans ce fil.

   ⚠️ PAS DE RAFALE. Trois messages en une minute ne font qu'un e-mail et
   une notification : on ne previent que pour le premier message d'une
   serie de dix minutes. */
const ADMIN_SUPPORT_EMAIL = "julien.steppe123@gmail.com"; // = ADMIN_EMAIL_CLUBBEUR dans app-preview.html
const FENETRE_FRAICHE_MS = 2 * 60 * 1000;
const FENETRE_RAFALE_MS = 10 * 60 * 1000;

function echapper(texte) {
  return String(texte || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

async function idAdminSupport(clubbeur) {
  const { data, error } = await clubbeur.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) return null;
  const admin = (data?.users || []).find((u) => (u.email || "").toLowerCase() === ADMIN_SUPPORT_EMAIL);
  return admin ? admin.id : null;
}

// Le lien du tableau de bord : c'est la que Julien repond desormais.
const LIEN_PILOTAGE = "https://viralnight-koif.vercel.app/pilotage.html";

async function mailSupport({ pseudo, email, message, ia }) {
  const qui = pseudo ? `@${pseudo}` : email || "un clubbeur";
  // L'etat de la reponse automatique dans le sujet : Julien sait d'un coup
  // d'oeil s'il doit intervenir.
  const etat = ia?.texte ? (ia.transmettre ? " — à traiter" : " — répondu automatiquement") : "";
  const blocIa = ia?.texte
    ? `<p><strong>Réponse automatique${ia.transmettre ? " (transmis à toi)" : ""} :</strong></p><p style="white-space:pre-wrap;color:#535964">${echapper(ia.texte)}</p>`
    : "";
  return envoyerEmail({
    type: "support",
    sujet: `Support Noctify : message de ${qui}${etat}`,
    html: `<h2>Nouveau message au support</h2>
      <p><strong>De :</strong> ${echapper(qui)}${email ? " (" + echapper(email) + ")" : ""}</p>
      <p style="white-space:pre-wrap">${echapper(message)}</p>
      ${blocIa}
      <p><a href="${LIEN_PILOTAGE}#support">Répondre depuis le tableau de bord</a></p>`,
    texte: `Nouveau message au support\nDe : ${qui}${email ? " (" + email + ")" : ""}\n\n${message}\n\n${ia?.texte ? "Réponse automatique : " + ia.texte + "\n\n" : ""}Répondre depuis le tableau de bord : ${LIEN_PILOTAGE}#support`,
  });
}

/* La reponse automatique (lib/support/reponseAuto.js) : GRATUITE, sans IA
   payante (Julien, 16/09/2026). On lit le compte, on reconnait le sujet, on
   repond avec ses vraies donnees -- ou on transmet. Ne leve jamais : un
   souci ici ne doit ni faire echouer la requete ni empecher de prevenir
   Julien. */
async function repondreAutomatiquement(clubbeur, userId, derniers) {
  try {
    const decision = doitRepondre(derniers);
    if (!decision.repondre) return { erreur: decision.raison };
    const [profil, stories, gains, bons, cadeaux, parrainages] = await Promise.all([
      clubbeur.from("users").select("handle, points_balance, lifetime_points, created_at").eq("id", userId).maybeSingle(),
      clubbeur.from("story_events").select("mentioned_at, review_status, awarded_points, clubs(name)").eq("user_id", userId).order("mentioned_at", { ascending: false }).limit(3),
      clubbeur.from("point_grants").select("created_at, amount, source, released, unlocks_at, clubs(name)").eq("user_id", userId).order("created_at", { ascending: false }).limit(10),
      clubbeur.from("redemptions").select("redeemed_at, used, rewards(title)").eq("user_id", userId).order("redeemed_at", { ascending: false }).limit(5),
      clubbeur.from("daily_gifts").select("gift_date, amount, jour").eq("user_id", userId).order("gift_date", { ascending: false }).limit(2),
      clubbeur.from("parrainages").select("id", { count: "exact", head: true }).eq("parrain_id", userId),
    ]);
    const compte = {
      profil: profil.data,
      stories: (stories.data || []).map((x) => ({ ...x, club: x.clubs?.name })),
      gains: (gains.data || []).map((x) => ({ ...x, club: x.clubs?.name })),
      bons: (bons.data || []).map((x) => ({ ...x, titre: x.rewards?.title })),
      cadeaux: cadeaux.data || [],
      parrainages: parrainages.count || 0,
    };
    const reponse = repondre(derniers[0].message, compte);
    const { error } = await clubbeur.from("support_messages").insert({ user_id: userId, auteur: "ia", message: messageEnregistre(reponse) });
    if (error) {
      console.error("[support-auto] enregistrement", error.message);
      return { erreur: "enregistrement" };
    }
    return reponse;
  } catch (e) {
    console.error("[support-auto]", e.message);
    return { erreur: "inattendue" };
  }
}

async function actionSupport(request, response, sens) {
  poserCors(request, response);
  const token = (request.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return json(response, { error: "Session requise" }, 401);

  let clubbeur;
  try {
    clubbeur = getSupabaseClubbeurAdmin();
  } catch (e) {
    return json(response, { error: "Configuration serveur incomplete" }, 500);
  }

  const { data: qui, error: erreurAuth } = await clubbeur.auth.getUser(token);
  const moi = qui?.user;
  if (erreurAuth || !moi?.id) return json(response, { error: "Session invalide" }, 401);

  if (sens === "nouveau") {
    const { data: derniers } = await clubbeur
      .from("support_messages")
      .select("message, created_at, auteur")
      .eq("user_id", moi.id)
      .order("created_at", { ascending: false })
      .limit(12);
    const dernier = derniers?.[0];
    const age = dernier ? Date.now() - new Date(dernier.created_at).getTime() : Infinity;
    if (!dernier || dernier.auteur !== "client" || age > FENETRE_FRAICHE_MS) {
      return json(response, { ok: true, prevenu: false, raison: "aucun_message_frais" });
    }

    // D'abord la reponse au client : c'est lui qui attend, l'ecran ouvert.
    const ia = await repondreAutomatiquement(clubbeur, moi.id, derniers);
    const reponseIa = ia.texte ? { repondu: true, transmis: ia.transmettre } : { repondu: false, raison: ia.erreur };

    const rafale = (derniers || []).slice(1).some((m) =>
      m.auteur === "client" &&
      new Date(dernier.created_at).getTime() - new Date(m.created_at).getTime() < FENETRE_RAFALE_MS
    );
    if (rafale) return json(response, { ok: true, prevenu: false, raison: "rafale", ia: reponseIa });

    const { data: profil } = await clubbeur.from("users").select("handle").eq("id", moi.id).maybeSingle();
    const pseudo = profil?.handle || "";

    // Les comptes de test (e2e-...@viralnight.test) n'ecrivent pas a Julien.
    const compteDeTest = /@viralnight\.test$/i.test(moi.email || "");
    let mail = false;
    if (!compteDeTest) {
      try {
        mail = await mailSupport({ pseudo, email: moi.email, message: dernier.message, ia });
      } catch (e) {
        console.error("[support] e-mail impossible", e.message);
      }
    }
    const adminId = compteDeTest ? null : await idAdminSupport(clubbeur);
    const push = adminId
      ? await pousserA(adminId, { type: "support_nouveau", pseudo, extrait: dernier.message })
      : { envoyees: 0, raison: compteDeTest ? "compte_de_test" : "admin_introuvable" };
    return json(response, { ok: true, prevenu: !compteDeTest, mail, push: push.envoyees || 0, ia: reponseIa });
  }

  // sens === "reponse"
  if ((moi.email || "").toLowerCase() !== ADMIN_SUPPORT_EMAIL) {
    return json(response, { error: "Reserve a l'admin" }, 403);
  }
  let corps = {};
  try {
    corps = await readBody(request);
  } catch {}
  const cible = String(corps.userId || "");
  if (!/^[0-9a-f-]{36}$/i.test(cible)) return json(response, { error: "Destinataire invalide" }, 400);
  const { data: reponses } = await clubbeur
    .from("support_messages")
    .select("created_at")
    .eq("user_id", cible)
    .eq("auteur", "admin")
    .order("created_at", { ascending: false })
    .limit(1);
  const fraiche = reponses?.[0] && Date.now() - new Date(reponses[0].created_at).getTime() <= FENETRE_FRAICHE_MS;
  if (!fraiche) return json(response, { ok: true, prevenu: false, raison: "aucune_reponse_fraiche" });
  const push = await pousserA(cible, { type: "support_reponse" });
  return json(response, { ok: true, prevenu: true, push: push.envoyees || 0 });
}

/* ?action=parrainage — un nouvel inscrit arrive par le lien d'un ami.

   Julien, 15/09/2026 : « le parrainage a l'air douteux, j'ai essaye et je
   n'ai pas recu de points ». Les points arrivaient (claim_referral, appele
   par l'appli), mais sans rien pour le dire. La reclamation passe donc ici :
   on credite (claim_referral_pour, migration clubbeur 0051, qui refuse les
   comptes anciens, les doublons et soi-meme), PUIS on previent le parrain.

   Le filleul vient du jeton de session, jamais du corps : sinon n'importe
   qui ferait parrainer le compte d'un autre. L'appli retombe sur la RPC
   claim_referral si cette route ne repond pas (memes regles, pas de push). */
async function actionParrainage(request, response) {
  poserCors(request, response);
  const token = (request.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return json(response, { error: "Session requise" }, 401);

  let clubbeur;
  try {
    clubbeur = getSupabaseClubbeurAdmin();
  } catch (e) {
    return json(response, { error: "Configuration serveur incomplete" }, 500);
  }
  const { data: qui, error: erreurAuth } = await clubbeur.auth.getUser(token);
  const filleul = qui?.user?.id;
  if (erreurAuth || !filleul) return json(response, { error: "Session invalide" }, 401);

  let corps = {};
  try {
    corps = await readBody(request);
  } catch {}
  const code = String(corps?.code || "").trim().toLowerCase().slice(0, 40);
  if (!code) return json(response, { ok: false, raison: "code_manquant" });

  const { data, error } = await clubbeur.rpc("claim_referral_pour", { p_filleul: filleul, p_code: code });
  if (error) {
    // deja_parraine, compte_ancien, introuvable, soi_meme : des refus normaux.
    const raison = /deja_parraine|compte_ancien|introuvable|soi_meme|code_manquant/.exec(error.message || "");
    if (raison) return json(response, { ok: false, raison: raison[0] });
    console.error("[parrainage]", error.message);
    return json(response, { error: "Parrainage impossible" }, 500);
  }
  const ligne = Array.isArray(data) ? data[0] : data;
  if (!ligne?.referrer_id) return json(response, { ok: false, raison: "introuvable" });

  const { data: profil } = await clubbeur.from("users").select("handle").eq("id", filleul).maybeSingle();
  const notif = await pousserA(ligne.referrer_id, { type: "parrainage", pseudo: profil?.handle || "", points: ligne.awarded });
  return json(response, { ok: true, awarded: ligne.awarded, parrain: ligne.referrer_handle, notifications: notif });
}

/* ?action=supprimer-compte — le clubbeur efface son propre compte.

   ⚠️ EXIGENCE APP STORE, PAS UN CONFORT. Depuis le 30 juin 2022, la regle
   5.1.1(v) impose qu'une appli permettant de creer un compte permette d'en
   demander la suppression DEPUIS L'APPLI. Un lien mailto — ce qu'on avait —
   est explicitement insuffisant et fait rejeter la soumission. Google Play
   demande la meme chose, plus un chemin equivalent sur le web.

   ⚠️ L'IDENTIFIANT NE VIENT PAS DU CORPS DE LA REQUETE. Il est relu depuis
   le jeton de session, cote base clubbeur. Meme principe que
   requireEstablishment : ce qui autorise ne vient jamais du client. Sinon
   n'importe qui pourrait supprimer le compte d'un autre en postant son
   UUID.

   Greffe ici plutot que dans un nouveau fichier : le plan Hobby plafonne a
   12 fonctions serverless et api/ y est deja (voir CLAUDE.md).

   La suppression de l'utilisateur Auth fait tomber ses lignes par cascade
   (les tables clubbeur referencent auth.users avec ON DELETE CASCADE). Les
   points et l'historique partent donc avec — c'est ce que les CGU
   annoncent, et ce que le RGPD appelle le droit a l'effacement. */
async function actionSupprimerCompte(request, response) {
  poserCors(request, response);

  const token = (request.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return json(response, { error: "Session requise" }, 401);

  let clubbeur;
  try {
    clubbeur = getSupabaseClubbeurAdmin();
  } catch (e) {
    return json(response, { error: "Configuration serveur incomplete" }, 500);
  }

  // Le jeton est verifie par la base elle-meme : un jeton expire, revoque
  // ou fabrique ne rend aucun utilisateur.
  const { data: qui, error: erreurAuth } = await clubbeur.auth.getUser(token);
  const userId = qui?.user?.id;
  if (erreurAuth || !userId) return json(response, { error: "Session invalide" }, 401);

  let corps = {};
  try {
    corps = await readBody(request);
  } catch {}
  const motif = String(corps?.motif || "");
  const precision = motif === "autre" ? String(corps?.precision || "").trim().slice(0, 500) : "";

  // ⚠️ AVANT deleteUser : la cascade emporte le profil, les points et les
  // stories. Apres, il n'y a plus rien a raconter a Julien.
  const profil = await profilDuDepart(clubbeur, userId, qui.user);

  /* ⚠️ LE SEUL LIEN QUI NE CASCADE PAS : users.referred_by (0032, sans
     ON DELETE). Quiconque avait parraine un ami ne pouvait PAS supprimer
     son compte -- la base refusait, et la feuille affichait « n'a pas
     abouti ». Trouve le 13/09/2026 en listant les cles etrangeres. On
     detache les filleuls avant : leurs points deja gagnes ne bougent pas.
     Contrepartie acceptee : un filleul detache pourrait saisir un second
     code de parrainage (claim_referral ne regarde que referred_by). */
  const { error: erreurFilleuls } = await clubbeur.from("users").update({ referred_by: null }).eq("referred_by", userId);
  if (erreurFilleuls) console.error("[supprimer-compte] filleuls non detaches", erreurFilleuls.message);

  const { error } = await clubbeur.auth.admin.deleteUser(userId);
  if (error) {
    console.error("[supprimer-compte] echec", error.message);
    return json(response, { error: "La suppression a echoue" }, 500);
  }

  // Le compte est parti : un e-mail ou une notification qui echoue ne doit
  // pas faire croire au clubbeur que sa suppression a rate. Mais on attend
  // l'envoi avant de repondre : une fonction Vercel peut etre gelee des que
  // la reponse est partie.
  //
  // La raison est aussi gardee pour le tableau de bord (migration 0045),
  // SANS rien qui identifie la personne : ni id, ni pseudo, ni e-mail.
  try {
    const { error: erreurDepart } = await clubbeur.from("departs").insert({
      motif: Object.prototype.hasOwnProperty.call(MOTIFS_DEPART, motif) ? motif : "inconnu",
      commentaire: precision || null,
      anciennete_jours: joursEntre(profil.inscrit),
      points_perdus: typeof profil.solde === "number" ? profil.solde : null,
      points_gagnes: typeof profil.gagnes === "number" ? profil.gagnes : null,
      stories: profil.stories,
      etablissements: profil.etablissements.length,
      amis_invites: profil.filleuls,
      venu_par_ami: profil.parraine,
    });
    if (erreurDepart) console.error("[supprimer-compte] depart non garde", erreurDepart.message);
  } catch (e) {
    console.error("[supprimer-compte] depart non garde", e.message);
  }

  let mail = false;
  try {
    mail = await mailDepart({ ...profil, motif, precision });
  } catch (e) {
    console.error("[supprimer-compte] e-mail impossible", e.message);
  }
  let push = 0;
  try {
    const adminId = await idAdminSupport(clubbeur);
    if (adminId && adminId !== userId) {
      push = (await pousserA(adminId, { type: "compte_supprime", pseudo: profil.pseudo, motif })).envoyees || 0;
    }
  } catch (e) {
    console.error("[supprimer-compte] notification impossible", e.message);
  }

  return json(response, { ok: true, mail, push });
}

/* Ce que Julien recoit quand quelqu'un part (13/09/2026 : « que ca m'envoie
   la data du client, ce que les gens choisissent »). Rien de plus que ce
   que l'appli montrait deja au clubbeur lui-meme. Chaque lecture est
   facultative : un profil incomplet ne bloque jamais la suppression. */
async function profilDuDepart(clubbeur, userId, utilisateurAuth) {
  const profil = {
    pseudo: "",
    email: utilisateurAuth?.email || "",
    inscrit: utilisateurAuth?.created_at || null,
    solde: null,
    gagnes: null,
    parraine: false,
    filleuls: null,
    stories: null,
    etablissements: [],
    dernierPassage: null,
  };
  try {
    const [u, s, g, f] = await Promise.all([
      clubbeur.from("users").select("handle, email, created_at, points_balance, lifetime_points, referred_by").eq("id", userId).maybeSingle(),
      clubbeur.from("story_events").select("id", { count: "exact", head: true }).eq("user_id", userId),
      clubbeur.from("point_grants").select("created_at, clubs(name)").eq("user_id", userId).order("created_at", { ascending: false }).limit(200),
      clubbeur.from("users").select("id", { count: "exact", head: true }).eq("referred_by", userId),
    ]);
    if (typeof f.count === "number") profil.filleuls = f.count;
    if (u.data) {
      profil.pseudo = u.data.handle || "";
      profil.email = profil.email || u.data.email || "";
      profil.inscrit = u.data.created_at || profil.inscrit;
      profil.solde = u.data.points_balance;
      profil.gagnes = u.data.lifetime_points;
      profil.parraine = !!u.data.referred_by;
    }
    if (typeof s.count === "number") profil.stories = s.count;
    const lignes = g.data || [];
    profil.dernierPassage = lignes[0]?.created_at || null;
    profil.etablissements = [...new Set(lignes.map((l) => l.clubs?.name).filter(Boolean))];
  } catch (e) {
    console.error("[supprimer-compte] profil incomplet", e.message);
  }
  return profil;
}

function dateFr(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });
}

async function mailDepart(p) {
  const qui = p.pseudo ? `@${p.pseudo}` : p.email || "un clubbeur";
  const raison = libelleMotifDepart(p.motif);
  const nombre = (n) => (typeof n === "number" ? n.toLocaleString("fr-FR") : "—");
  const lignes = [
    ["Raison", raison],
    ...(p.precision ? [["En quelques mots", p.precision]] : []),
    ["Pseudo", p.pseudo ? `@${p.pseudo}` : "—"],
    ["E-mail", p.email || "—"],
    ["Inscrit le", dateFr(p.inscrit)],
    ["Venu par un ami", p.parraine ? "Oui" : "Non"],
    ["Amis invités", nombre(p.filleuls)],
    ["Points perdus", nombre(p.solde)],
    ["Points gagnés au total", nombre(p.gagnes)],
    ["Stories envoyées", nombre(p.stories)],
    ["Établissements", p.etablissements.length ? p.etablissements.join(", ") : "Aucun"],
    ["Dernier gain de points", dateFr(p.dernierPassage)],
  ];
  return envoyerEmail({
    type: "compte_supprime",
    sujet: `Compte supprimé : ${raison} (${qui})`,
    html: `<h2>Un clubbeur a supprimé son compte</h2>
      <table cellpadding="6" style="border-collapse:collapse;font-size:14px">
      ${lignes.map(([k, v]) => `<tr><td style="color:#6a6d73;vertical-align:top">${echapper(k)}</td><td style="white-space:pre-wrap"><strong>${echapper(v)}</strong></td></tr>`).join("")}
      </table>
      <p style="color:#6a6d73">Le compte et ses données sont déjà effacés : ce message est la seule trace.</p>`,
    texte: `Un clubbeur a supprimé son compte\n\n${lignes.map(([k, v]) => `${k} : ${v}`).join("\n")}\n\nLe compte et ses données sont déjà effacés : ce message est la seule trace.`,
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
  const action = new URL(request.url, "http://localhost").searchParams.get("action");

  /* ⚠️ AVANT le controle de methode : les crons de Vercel appellent en
     GET, pas en POST. Et greffe ICI plutot que dans un nouveau fichier :
     le plan Hobby plafonne a 12 fonctions serverless et api/ y est deja
     -- une treizieme ferait echouer tous les deploiements. */
  if (action === "notifier-cadeau") return actionNotifierCadeau(request, response);
  if (action === "auto-valider") return actionAutoValider(request, response);

  /* Le prevol arrive en OPTIONS : il doit passer avant le controle de
     methode, sinon le navigateur recoit un 405 et abandonne l'appel reel. */
  if ((action === "supprimer-compte" || action === "support-nouveau" || action === "support-reponse" || action === "parrainage") && request.method === "OPTIONS") {
    poserCors(request, response);
    response.statusCode = 204;
    return response.end();
  }

  if (request.method !== "POST") return json(response, { error: "Method not allowed" }, 405);
  if (action === "sync-boutique") return actionSyncBoutique(request, response);

  /* AVANT le controle d'administrateur qui suit : celui-ci n'est pas une
     action d'admin. C'est le clubbeur lui-meme qui efface son compte, et il
     s'authentifie avec SA session, cote base clubbeur. */
  if (action === "supprimer-compte") return actionSupprimerCompte(request, response);
  // Le support : le clubbeur ou l'admin, chacun avec SA session (voir actionSupport).
  if (action === "support-nouveau") return actionSupport(request, response, "nouveau");
  if (action === "parrainage") return actionParrainage(request, response);
  if (action === "support-reponse") return actionSupport(request, response, "reponse");

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
