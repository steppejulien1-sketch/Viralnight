// POSE LES CLES DES NOTIFICATIONS SUR VERCEL.
//
//   npm run cles:vercel
//
// POURQUOI. Le 12/09/2026, Julien : "quand on appuie sur le truc des
// notifs, ca ne marche pas". La paire VAPID existait bien dans .env.local
// (generee par `npm run cles:vapid`), la table push_subscriptions aussi --
// mais AUCUNE des quatre variables n'etait sur Vercel. Le build de prod
// sortait donc avec une cle publique vide, et l'interrupteur repondait
// "Les notifications ne sont pas encore configurees" a chaque tap.
//
// ⚠️ C'EST A JULIEN DE LANCER CE SCRIPT, pas a une conversation : il pousse
// la cle PRIVEE. Il lit .env.local et envoie chaque valeur a `vercel env add`
// par l'entree standard -- rien n'est affiche a l'ecran, rien ne passe par
// un copier-coller.
//
// ⚠️ NE JAMAIS REGENERER LA PAIRE une fois des abonnements enregistres : ils
// deviendraient muets sans que personne s'en apercoive (voir MOBILE.md).
//
// Apres : un nouveau deploiement est necessaire, parce que
// VITE_VAPID_PUBLIC_KEY est lue AU BUILD. N'importe quel push sur main suffit.

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const RACINE = path.join(__dirname, "..");
const NOMS = ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT", "VITE_VAPID_PUBLIC_KEY"];

const brut = fs.readFileSync(path.join(RACINE, ".env.local"), "utf8");
function lire(nom) {
  const m = brut.match(new RegExp("^" + nom + "=(.*)$", "m"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
}

const valeurs = Object.fromEntries(NOMS.map((n) => [n, lire(n)]));
const manquantes = NOMS.filter((n) => !valeurs[n]);
if (manquantes.length) {
  console.error("Absentes de .env.local : " + manquantes.join(", "));
  console.error("Lance d'abord : npm run cles:vapid");
  process.exit(1);
}
if (valeurs.VAPID_PUBLIC_KEY !== valeurs.VITE_VAPID_PUBLIC_KEY) {
  console.error("VAPID_PUBLIC_KEY et VITE_VAPID_PUBLIC_KEY different dans .env.local : rien n'est envoye.");
  process.exit(1);
}

let echecs = 0;
for (const nom of NOMS) {
  process.stdout.write(`${nom} → Vercel (production)… `);
  const r = spawnSync("npx", ["--yes", "vercel", "env", "add", nom, "production"], {
    cwd: RACINE,
    input: valeurs[nom],
    stdio: ["pipe", "pipe", "pipe"],
    shell: true,
    encoding: "utf8",
  });
  const sortie = (r.stdout || "") + (r.stderr || "");
  if (r.status === 0) {
    console.log("ok");
  } else if (/already exists/i.test(sortie)) {
    console.log("deja presente, laissee telle quelle");
  } else {
    echecs += 1;
    console.log("ECHEC");
    // La sortie de Vercel ne contient pas la valeur : on peut l'afficher.
    console.log(sortie.split("\n").slice(-6).join("\n"));
  }
}

if (echecs) process.exit(1);
console.log("\nC'est pose. Il faut maintenant un nouveau deploiement (la cle publique est lue au build).");
