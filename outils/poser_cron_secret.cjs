// POSE CRON_SECRET SUR LE PROJET VERCEL.
//
//   node outils/poser_cron_secret.cjs
//
// ⚠️ POURQUOI CET OUTIL EXISTE. Le 07/09/2026, les trois taches
// planifiees du projet repondaient toutes ceci, tous les jours :
//
//     {"error":"CRON_SECRET absent de ce serveur : aucune tache
//      planifiee ne peut s'executer."}
//
// Donc : l'historique d'abonnes Instagram ne se remplissait jamais, les
// stories supprimees avant l'echeance n'etaient jamais detectees, et le
// rappel du cadeau du jour ne serait jamais parti. En silence -- un cron
// qui echoue ne previent personne.
//
// COMMENT VERCEL S'AUTHENTIFIE. Si la variable d'environnement
// CRON_SECRET existe sur le projet, Vercel l'envoie lui-meme dans
// l'en-tete `Authorization: Bearer <valeur>` a chaque declenchement.
// C'est le seul endroit ou la poser : il n'y a pas de second champ.
//
// ⚠️ LE SECRET N'EST JAMAIS AFFICHE NI ECRIT SUR LE DISQUE. Il est tire
// au hasard ici et pousse directement. Personne n'a besoin de le
// connaitre : ni Julien, ni moi. Seuls Vercel (qui l'envoie) et la
// fonction (qui le compare) le voient. Pour le changer, rejouer cet
// outil -- il remplace la variable existante.
//
// ⚠️ IL FAUT REDEPLOYER APRES. Une variable d'environnement n'est prise
// en compte que par les deploiements SUIVANTS. Cet outil ne redeploie
// pas : `git commit --allow-empty` puis push, ou le bouton Redeploy.

const fs = require("fs");
const crypto = require("crypto");

const PROJET = "prj_Q603DdOhiicfqtc1lWRnknT1K4FO"; // viralnight-koif
const TEAM = "team_iSigYpkRP2kyMqt9Ph2iZyyu";

const jeton = fs.readFileSync("C:/Users/stepp/token-vercel.txt", "utf8").trim();
if (!jeton.startsWith("vcp_") && !jeton.startsWith("vercel_")) {
  console.error("jeton Vercel introuvable ou invalide dans token-vercel.txt");
  process.exit(1);
}

// 48 octets en base64url : assez long pour qu'aucune attaque par
// devinette n'ait de sens, et sans caractere qui poserait probleme dans
// un en-tete HTTP.
const SECRET = crypto.randomBytes(48).toString("base64url");

const api = async (chemin, options = {}) => {
  const sep = chemin.includes("?") ? "&" : "?";
  const r = await fetch(`https://api.vercel.com${chemin}${sep}teamId=${TEAM}`, {
    ...options,
    headers: { Authorization: `Bearer ${jeton}`, "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const t = await r.text();
  return [r.status, t ? JSON.parse(t) : null];
};

(async () => {
  const [stListe, existantes] = await api(`/v9/projects/${PROJET}/env`);
  if (stListe >= 400) throw new Error("lecture des variables : " + JSON.stringify(existantes));

  const deja = (existantes.envs || []).find((e) => e.key === "CRON_SECRET");
  if (deja) {
    const [st, out] = await api(`/v9/projects/${PROJET}/env/${deja.id}`, {
      method: "PATCH",
      body: JSON.stringify({ value: SECRET, target: ["production", "preview", "development"] }),
    });
    console.log(`CRON_SECRET : remplacee (${st})`, st >= 400 ? JSON.stringify(out) : "");
  } else {
    const [st, out] = await api(`/v10/projects/${PROJET}/env`, {
      method: "POST",
      body: JSON.stringify({
        key: "CRON_SECRET",
        value: SECRET,
        type: "encrypted",
        target: ["production", "preview", "development"],
      }),
    });
    console.log(`CRON_SECRET : creee (${st})`, st >= 400 ? JSON.stringify(out) : "");
  }

  const [, apres] = await api(`/v9/projects/${PROJET}/env`);
  const ligne = (apres.envs || []).find((e) => e.key === "CRON_SECRET");
  console.log("verification :", ligne ? `presente sur ${ligne.target.join(", ")}` : "ABSENTE");
  console.log("\nIl faut maintenant REDEPLOYER : la variable n'est lue que par");
  console.log("les deploiements suivants. Un commit vide suffit.");
})().catch((e) => { console.error("ECHEC:", e.message); process.exit(1); });
