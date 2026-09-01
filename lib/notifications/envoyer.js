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
