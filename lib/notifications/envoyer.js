// Envoi effectif des notifications push aux clubbeurs.
//
// Le QUOI (texte, regles) vit dans push.js, qui est pur et teste. Ici on
// ne fait que du reseau : lire les abonnements, signer, poster, nettoyer.
//
// ⚠️ POURQUOI DEPUIS LE SITE B2B ET PAS DEPUIS LA PWA.
// Envoyer un push exige la cle privee VAPID. Une cle privee posee dans du
// JavaScript de navigateur n'est pas une cle privee : n'importe qui
// pourrait envoyer des notifications au nom de Noctify. Elle ne vit donc
// que sur Vercel, et l'envoi part d'ici.
//
// ⚠️ POURQUOI PAS UNE NOUVELLE FONCTION SERVERLESS.
// Le plan Vercel Hobby plafonne a 12 fonctions et api/ est deja a 12
// (voir CLAUDE.md, "Pieges connus"). L'envoi se greffe donc sur une route
// existante -- credit-clubbeur.js, qui est justement le moment ou il y a
// quelque chose a annoncer.
//
// VARIABLES : VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT,
//             SUPABASE_CLUBBEUR_URL, SUPABASE_CLUBBEUR_SERVICE_ROLE_KEY

import webpush from "web-push";
import { getSupabaseClubbeurAdmin } from "../db/supabaseClubbeurAdmin.js";
import { construireMessage, abonnementExpire, versAbonnementWebPush } from "./push.js";

let vapidPret = false;

function preparerVapid() {
  if (vapidPret) return true;
  const publique = process.env.VAPID_PUBLIC_KEY;
  const privee = process.env.VAPID_PRIVATE_KEY;
  if (!publique || !privee) return false;
  // Les services de push exigent un moyen de nous joindre en cas d'abus.
  // Une adresse qui n'existe pas fait rejeter l'envoi par certains d'entre
  // eux, d'ou le repli sur une adresse reelle du projet.
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:viralnight001@gmail.com",
    publique,
    privee
  );
  vapidPret = true;
  return true;
}

/**
 * Retrouve a qui appartient une story cote base clubbeur.
 * L'identifiant vient de submissions.external_story_id cote B2B, et
 * designe une ligne de story_events cote PWA.
 */
async function trouverDestinataire(clubbeur, storyId) {
  const { data, error } = await clubbeur
    .from("story_events")
    .select("user_id, clubs(name)")
    .eq("id", storyId)
    .maybeSingle();
  if (error || !data) return null;
  return { userId: data.user_id, club: data.clubs?.name || "" };
}

/**
 * Envoie une notification au clubbeur a l'origine d'une story.
 *
 * ⚠️ NE LEVE JAMAIS. Cette fonction est appelee APRES un credit de points
 * reussi. Si le service de push est en panne, le clubbeur a quand meme ses
 * points : faire echouer la requete pour autant transformerait un simple
 * silence en erreur affichee a l'admin, et l'inciterait a revalider --
 * donc a rejouer un credit deja fait.
 *
 * @returns {Promise<{envoyees: number, raison?: string}>}
 */
/**
 * Previent tout le monde que le cadeau du jour est disponible.
 *
 * ⚠️ N'ECRIT QU'A CEUX QUI PEUVENT VRAIMENT LE PRENDRE. daily_gift_status
 * renvoie `aucun_club` a qui n'a jamais scanne de QR : lui envoyer
 * "ton cadeau t'attend" serait un mensonge, il tomberait sur "Scanne un
 * club d'abord". On saute aussi ceux qui l'ont deja pris (le cron de
 * Vercel peut retomber a une heure ou certains sont deja passes).
 *
 * ⚠️ NE LEVE JAMAIS, comme notifierStory : c'est une tache de fond, une
 * panne du service de push ne doit pas faire echouer le cron entier ni
 * masquer les envois qui, eux, ont marche.
 *
 * @returns {Promise<{envoyees: number, ignorees: number, raison?: string}>}
 */
export async function notifierCadeauDuJour() {
  if (!preparerVapid()) return { envoyees: 0, ignorees: 0, raison: "vapid_absent" };

  let clubbeur;
  try {
    clubbeur = getSupabaseClubbeurAdmin();
  } catch {
    return { envoyees: 0, ignorees: 0, raison: "base_clubbeur_indisponible" };
  }

  const { data: abonnements, error } = await clubbeur
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth");
  if (error || !abonnements?.length) {
    return { envoyees: 0, ignorees: 0, raison: error ? "lecture_impossible" : "aucun_abonne" };
  }

  const message = construireMessage({ type: "cadeau_dispo" });
  if (!message) return { envoyees: 0, ignorees: 0, raison: "message_vide" };
  const charge = JSON.stringify(message);

  /* Un seul appel pour savoir qui a droit a quoi, plutot qu'un par
     abonnement : daily_gift_status() lit auth.uid(), donc inutilisable
     ici (on est en service_role, sans session). On regarde directement
     les deux conditions qu'elle applique. */
  const ids = [...new Set(abonnements.map((a) => a.user_id))];
  const [{ data: avecClub }, { data: dejaPris }] = await Promise.all([
    clubbeur.from("point_grants").select("user_id").in("user_id", ids),
    clubbeur.from("daily_gifts").select("user_id").in("user_id", ids)
      .gte("gift_date", new Date(Date.now() - 36e5 * 24).toISOString().slice(0, 10)),
  ]);
  const ontUnClub = new Set((avecClub || []).map((l) => l.user_id));
  const ontDejaPris = new Set((dejaPris || []).map((l) => l.user_id));

  let envoyees = 0;
  let ignorees = 0;
  const morts = [];

  for (const ligne of abonnements) {
    if (!ontUnClub.has(ligne.user_id) || ontDejaPris.has(ligne.user_id)) {
      ignorees++;
      continue;
    }
    const abonnement = versAbonnementWebPush(ligne);
    if (!abonnement) { ignorees++; continue; }
    try {
      await webpush.sendNotification(abonnement, charge);
      envoyees++;
    } catch (erreur) {
      if (abonnementExpire(erreur?.statusCode)) morts.push(ligne.id);
    }
  }

  // Les abonnements morts partent : sinon la table grossit et chaque
  // envoi paie le cout d'appeler des endpoints qui n'existent plus.
  if (morts.length) {
    await clubbeur.from("push_subscriptions").delete().in("id", morts);
  }

  return { envoyees, ignorees, supprimes: morts.length };
}

export async function notifierStory({ storyId, type, points }) {
  try {
    if (!preparerVapid()) return { envoyees: 0, raison: "vapid_absent" };

    let clubbeur;
    try {
      clubbeur = getSupabaseClubbeurAdmin();
    } catch {
      return { envoyees: 0, raison: "base_clubbeur_absente" };
    }

    const destinataire = await trouverDestinataire(clubbeur, storyId);
    if (!destinataire) return { envoyees: 0, raison: "destinataire_introuvable" };

    // On construit le message AVANT de lire les abonnements : quand il n'y
    // a rien a dire (0 point valide, par exemple), autant ne pas
    // interroger la base pour rien.
    const message = construireMessage({ type, points, club: destinataire.club });
    if (!message) return { envoyees: 0, raison: "rien_a_annoncer" };

    const { data: lignes, error } = await clubbeur
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", destinataire.userId);
    if (error || !lignes?.length) return { envoyees: 0, raison: "aucun_abonnement" };

    const charge = JSON.stringify(message);
    const perimes = [];
    let envoyees = 0;

    // allSettled et pas all : un endpoint mort ne doit pas empecher les
    // autres appareils de la meme personne de recevoir.
    await Promise.allSettled(
      lignes.map(async (ligne) => {
        const abonnement = versAbonnementWebPush(ligne);
        if (!abonnement) {
          perimes.push(ligne.endpoint);
          return;
        }
        try {
          await webpush.sendNotification(abonnement, charge);
          envoyees += 1;
        } catch (e) {
          if (abonnementExpire(e?.statusCode)) perimes.push(ligne.endpoint);
        }
      })
    );

    // Sans ce nettoyage la table ne fait que grossir, et chaque envoi paie
    // le cout d'appeler des endpoints qui n'existent plus.
    if (perimes.length) {
      await clubbeur.from("push_subscriptions").delete().in("endpoint", perimes);
    }

    return { envoyees };
  } catch (e) {
    return { envoyees: 0, raison: "erreur_inattendue" };
  }
}
