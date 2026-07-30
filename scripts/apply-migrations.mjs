// Applique le SQL sur le projet Supabase via l'API de gestion.
//
// Pourquoi ce script plutot qu'un copier-coller dans le SQL Editor :
// il execute les deux scripts dans l'ordre, s'arrete au premier echec, et rapporte
// precisement ce qui a casse. Utile pour rejouer l'installation sans se demander
// si on a bien tout colle.
//
// Prerequis : un jeton d'acces personnel Supabase dans .env.local
//
//   SUPABASE_ACCESS_TOKEN=sbp_xxxxxxxxxxxxxxxxxxxx
//
// A creer sur https://supabase.com/dashboard/account/tokens
// Ce jeton donne un acces complet au projet : il ne doit jamais etre commit.
// (.env.local est deja dans .gitignore)
//
// Usage :
//   node scripts/apply-migrations.mjs              -> installe puis teste
//   node scripts/apply-migrations.mjs --test-only  -> lance seulement le test
//   node scripts/apply-migrations.mjs --dry-run    -> montre ce qui serait fait

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const API = "https://api.supabase.com/v1";

function chargerEnv() {
  const chemin = resolve(RACINE, ".env.local");
  if (!existsSync(chemin)) return;

  for (const ligne of readFileSync(chemin, "utf8").split("\n")) {
    if (ligne.startsWith("#")) continue;
    const separateur = ligne.indexOf("=");
    if (separateur < 1) continue;
    const cle = ligne.slice(0, separateur).trim();
    const valeur = ligne.slice(separateur + 1).trim().replace(/^["']|["']$/g, "");
    if (cle && !(cle in process.env)) process.env[cle] = valeur;
  }
}

/** La reference du projet se deduit de l'URL Supabase : inutile de la saisir deux fois. */
function referenceProjet() {
  const url = process.env.VITE_SUPABASE_URL || "";
  const trouve = url.match(/https:\/\/([a-z0-9]+)\.supabase\.co/i);
  if (!trouve) {
    throw new Error("VITE_SUPABASE_URL absente ou invalide dans .env.local : impossible de deduire le projet.");
  }
  return trouve[1];
}

function jetonAcces() {
  const jeton = process.env.SUPABASE_ACCESS_TOKEN;

  if (!jeton || jeton === "[SENSITIVE]") {
    throw new Error(
      [
        "SUPABASE_ACCESS_TOKEN manquant dans .env.local.",
        "",
        "  1. Ouvre https://supabase.com/dashboard/account/tokens",
        "  2. Genere un jeton (Generate new token)",
        "  3. Ajoute cette ligne dans .env.local :",
        "",
        "       SUPABASE_ACCESS_TOKEN=sbp_ton_jeton_ici",
        "",
        "  Ce fichier est deja ignore par git : le jeton ne partira pas sur GitHub.",
      ].join("\n"),
    );
  }

  return jeton;
}

/**
 * Execute du SQL via l'API de gestion.
 * @returns {Promise<{ok: boolean, statut: number, corps: unknown}>}
 */
async function executerSql(ref, jeton, sql) {
  const reponse = await fetch(`${API}/projects/${ref}/database/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jeton}`,
    },
    body: JSON.stringify({ query: sql }),
  });

  let corps;
  const texte = await reponse.text();
  try {
    corps = JSON.parse(texte);
  } catch {
    corps = texte;
  }

  return { ok: reponse.ok, statut: reponse.status, corps };
}

function lireScript(nom) {
  const chemin = resolve(RACINE, "supabase/migrations", nom);
  if (!existsSync(chemin)) throw new Error(`Script introuvable : ${nom}`);
  return readFileSync(chemin, "utf8");
}

function messageErreur(corps) {
  if (typeof corps === "string") return corps.slice(0, 500);
  return corps?.message || corps?.error || JSON.stringify(corps).slice(0, 500);
}

async function main() {
  chargerEnv();

  const testSeulement = process.argv.includes("--test-only");
  const simulation = process.argv.includes("--dry-run");

  const ref = referenceProjet();
  const installation = lireScript("SETUP_COMPLET.sql");
  const verification = lireScript("VERIFICATION.sql");

  console.log(`Projet Supabase : ${ref}`);
  console.log(`Installation    : ${installation.split("\n").length} lignes`);
  console.log(`Verification    : ${verification.split("\n").length} lignes`);

  if (simulation) {
    console.log("\n--dry-run : rien n'a ete execute.");
    return;
  }

  const jeton = jetonAcces();

  if (!testSeulement) {
    console.log("\n[1/2] Installation du schema...");
    const resultat = await executerSql(ref, jeton, installation);

    if (!resultat.ok) {
      console.error(`\nECHEC de l'installation (HTTP ${resultat.statut})`);
      console.error(messageErreur(resultat.corps));
      process.exit(1);
    }
    console.log("      Schema installe.");
  }

  console.log(`\n[${testSeulement ? "1/1" : "2/2"}] Test de la collecte...`);
  const test = await executerSql(ref, jeton, verification);

  if (!test.ok) {
    // Le script leve une exception explicite au premier test qui echoue :
    // le message contient donc le nom du cas fautif.
    console.error(`\nECHEC du test (HTTP ${test.statut})`);
    console.error(messageErreur(test.corps));
    process.exit(1);
  }

  console.log("      Tous les tests sont passes.");
  console.log("\nLa collecte fonctionne. Ouvre qr.html pour recuperer ton QR code.");
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exit(1);
});
