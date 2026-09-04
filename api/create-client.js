import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const ADMIN_EMAIL = "viralnight001@gmail.com";

// Les titres sont ceux du catalogue du parcours d'installation
// (club-app.html) : le gerant les retrouve deja coches, avec leur
// illustration, au lieu de trois tuiles anonymes a cote de huit
// illustrees. Ils sont aussi ceux que choisirArt() (app-preview.html)
// reconnait -- "Boisson premium" tombait sur le pictogramme generique de
// sa famille, "Cocktail offert" tombe sur le verre.
const defaultRewards = [
  { title: "Vestiaire offert", points_required: 40, max_redemptions: 50, category: "acces" },
  { title: "Shot offert", points_required: 60, max_redemptions: 100, category: "bar" },
  { title: "Pinte offerte", points_required: 90, max_redemptions: 50, category: "bar" },
  { title: "Cocktail offert", points_required: 130, max_redemptions: 25, category: "bar" },
  // Accentue : ces titres s'affichent tels quels dans la boutique du
  // clubbeur. L'ancien "Acces VIP" y arrivait sans son accent.
  { title: "Carré VIP", points_required: 450, max_redemptions: 5, category: "vip" },
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

/**
 * Cree l'etablissement, le rattachement, le bareme par defaut et les
 * recompenses par defaut. Un club doit marcher des sa premiere connexion,
 * pas etre une coquille vide a completer plus tard.
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

  const action = new URL(request.url, "http://localhost").searchParams.get("action");

  // ---------------- ?action=inviter : l'admin fabrique un lien ----------------
  //
  // Greffe sur CETTE route plutot qu'un fichier a part : le plan Vercel
  // plafonne a 12 fonctions serverless et api/ y est deja. C'est de
  // toute facon la route qui decide qui obtient un club.
  if (action === "inviter") {
    if (!isAdmin) {
      return json(response, { error: "Reserve a l'administrateur." }, 403);
    }

    const jours = Number(payload.jours) > 0 ? Math.min(Math.floor(Number(payload.jours)), 365) : 30;
    const invitation = {
      // Sans tirets : le jeton finit dans une URL qu'on lit parfois au
      // telephone. 32 caracteres hexadecimaux, indevinables.
      token: randomUUID().replace(/-/g, ""),
      email: String(payload.owner_email || "").trim().toLowerCase() || null,
      establishment_name: String(payload.establishment_name || "").trim() || null,
      city: String(payload.city || "").trim() || null,
      created_by: caller.id,
      expires_at: new Date(Date.now() + jours * 86400000).toISOString(),
    };

    const insertion = await supabase.from("club_invitations").insert(invitation);

    if (insertion.error) {
      return json(response, { error: insertion.error.message }, 500);
    }

    return json(response, {
      token: invitation.token,
      expires_at: invitation.expires_at,
      url: `${getSiteUrl(request)}/club-app.html?invitation=${invitation.token}`,
    });
  }

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

    // ---- L'INVITATION EST LE VERROU ----
    //
    // Il est ici, cote serveur, et pas dans l'appli : club-app.html
    // n'est pas la seule porte d'entree, inscription.html appelle la
    // meme route. Un verrou dans une page en laisserait une autre
    // grande ouverte. Ici, une seule verification les ferme toutes.
    const jeton = String(payload.invitation || "").trim();

    if (!jeton) {
      return json(
        response,
        { error: "L'inscription a Noctify se fait sur invitation. Demande un lien a ton contact." },
        403,
      );
    }

    const invitationLue = await supabase
      .from("club_invitations")
      .select("token, email, establishment_name, city, expires_at, used_at")
      .eq("token", jeton)
      .maybeSingle();

    if (invitationLue.error) {
      return json(response, { error: invitationLue.error.message }, 500);
    }

    const invitation = invitationLue.data;

    // Le meme message pour "n'existe pas" et pour "deja utilisee" serait
    // plus discret, mais un gerant qui reclique sur son propre lien doit
    // comprendre ce qui se passe. Le jeton etant indevinable, distinguer
    // les deux cas n'apprend rien a un curieux.
    if (!invitation) {
      return json(response, { error: "Ce lien d'invitation n'est pas valide." }, 403);
    }

    if (invitation.used_at) {
      return json(response, { error: "Ce lien d'invitation a deja servi a creer un club." }, 403);
    }

    if (invitation.expires_at && new Date(invitation.expires_at).getTime() < Date.now()) {
      return json(response, { error: "Ce lien d'invitation a expire. Demande-en un nouveau." }, 403);
    }

    if (invitation.email && invitation.email.toLowerCase() !== caller.email?.toLowerCase()) {
      return json(response, { error: "Ce lien a ete emis pour une autre adresse email." }, 403);
    }

    // Le nom peut venir de l'invitation : l'admin qui prepare le lien
    // pour un club precis n'a pas a compter sur le gerant pour le saisir.
    const establishmentName = String(payload.establishment_name || invitation.establishment_name || "").trim();
    const city = String(payload.city || invitation.city || "").trim();

    if (!establishmentName) {
      return json(response, { error: "Le nom du club est requis." }, 400);
    }

    // On BRULE le jeton avant de creer le club, par un update conditionne
    // a used_at IS NULL. Deux appels simultanes avec le meme lien : un
    // seul voit une ligne revenir, l'autre est refuse. Verifier puis
    // creer puis marquer aurait laisse passer les deux.
    const reservation = await supabase
      .from("club_invitations")
      .update({ used_at: new Date().toISOString(), used_by: caller.id })
      .eq("token", jeton)
      .is("used_at", null)
      .select("token")
      .maybeSingle();

    if (reservation.error) {
      return json(response, { error: reservation.error.message }, 500);
    }

    if (!reservation.data) {
      return json(response, { error: "Ce lien d'invitation a deja servi a creer un club." }, 403);
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
      // La creation a echoue : on rend le jeton, sinon une panne
      // passagere de Supabase consommerait definitivement l'invitation
      // d'un vrai client, sans club au bout.
      await supabase
        .from("club_invitations")
        .update({ used_at: null, used_by: null })
        .eq("token", jeton);

      return json(response, { error: resultat.error }, 500);
    }

    await supabase
      .from("club_invitations")
      .update({ establishment_id: resultat.establishmentId })
      .eq("token", jeton);

    return json(response, { establishment_id: resultat.establishmentId, already_existed: false });
  }

  // Il n'existe plus de chemin pour creer un club sans invitation.
  //
  // L'admin avait le sien : "Creer un client" fabriquait le compte ET
  // le club d'un coup, et envoyait un email de mot de passe. Julien ne
  // veut qu'une seule porte -- un lien d'invitation qu'il envoie
  // lui-meme -- et deux portes, c'est une de trop a surveiller. Pour
  // ouvrir un club a quelqu'un : ?action=inviter, puis il cree son
  // compte lui-meme avec le lien.
  return json(response, { error: "Passe par une invitation : ?action=inviter." }, 400);
}
