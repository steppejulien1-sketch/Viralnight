/* Genere une paire de cles VAPID pour les notifications push.
 *
 * VAPID, c'est ce qui prouve aux services de push (Google, Apple,
 * Mozilla) que la notification vient bien de Noctify. Sans, ils refusent
 * l'envoi. La paire se genere UNE FOIS et ne change plus.
 *
 * ⚠️ CHANGER DE CLE INVALIDE TOUS LES ABONNEMENTS EXISTANTS. Chaque
 * abonnement est lie a la cle publique qui l'a cree : si tu regeneres
 * une paire apres la mise en service, tout le monde doit reautoriser les
 * notifications, et personne ne sera prevenu que ca s'est produit.
 * Genere-la une fois, garde-la.
 *
 * ⚠️ LA CLE PRIVEE NE SE COMMIT JAMAIS. Elle vit uniquement dans les
 * variables d'environnement Vercel. Quiconque l'a peut envoyer des
 * notifications au nom de Noctify sur le telephone de tes clients.
 *
 * Usage : npm run cles:vapid
 */
const webpush = require("web-push");

const cles = webpush.generateVAPIDKeys();

console.log("");
console.log("  Paire VAPID generee.");
console.log("");
console.log("  ------------------------------------------------------------");
console.log("  1. Sur Vercel  (Settings > Environment Variables)");
console.log("  ------------------------------------------------------------");
console.log("");
console.log("  VAPID_PUBLIC_KEY   = " + cles.publicKey);
console.log("  VAPID_PRIVATE_KEY  = " + cles.privateKey);
console.log("  VAPID_SUBJECT      = mailto:viralnight001@gmail.com");
console.log("");
console.log("  Et la MEME cle publique, en VITE_ pour que l'appli la lise :");
console.log("");
console.log("  VITE_VAPID_PUBLIC_KEY = " + cles.publicKey);
console.log("");
console.log("  ------------------------------------------------------------");
console.log("  2. En local, dans .env.local (deja dans .gitignore)");
console.log("  ------------------------------------------------------------");
console.log("");
console.log("  VITE_VAPID_PUBLIC_KEY=" + cles.publicKey);
console.log("");
console.log("  ------------------------------------------------------------");
console.log("  A RETENIR");
console.log("  ------------------------------------------------------------");
console.log("");
console.log("  - La cle PUBLIQUE est publique : elle part dans le bundle,");
console.log("    c'est normal et sans risque.");
console.log("  - La cle PRIVEE ne quitte jamais Vercel. Ne la colle nulle");
console.log("    part d'autre, ne la commit pas.");
console.log("  - Ne relance PAS cet outil une fois les notifications en");
console.log("    service : tous les abonnements existants deviendraient");
console.log("    muets, sans que personne s'en apercoive.");
console.log("");
