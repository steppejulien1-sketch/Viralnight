// Compare les migrations du depot a ce qui existe VRAIMENT en base.
//
// ⚠️ Pourquoi cet outil existe : deux migrations dormaient dans le depot
// sans avoir jamais ete appliquees (`establishment_point_rule_items`, et
// la colonne `rewards.max_redemptions`). Le code les interroge, l'erreur
// est avalee, et une fonctionnalite visible a l'ecran ne peut rien
// enregistrer. On ne veut plus decouvrir ca une par une, par hasard.
//
// Il ne verifie pas tout : seulement les `create table` et les
// `add column`, qui sont les divergences qui cassent silencieusement.

const fs = require("fs");
const path = require("path");
const V = require("./lib_b2b.cjs");

const DOSSIER = path.join(__dirname, "..", "supabase", "migrations");

const tables = new Set(
  V.sql("select table_name from information_schema.tables where table_schema='public'").map((r) => r.table_name)
);
const colonnes = new Set(
  V.sql("select table_name || '.' || column_name as c from information_schema.columns where table_schema='public'").map((r) => r.c)
);

const manquantes = [];

for (const f of fs.readdirSync(DOSSIER).filter((f) => f.endsWith(".sql") && /^\d/.test(f)).sort()) {
  const sql = fs.readFileSync(path.join(DOSSIER, f), "utf8");

  for (const m of sql.matchAll(/create table if not exists public\.([a-z_]+)/gi)) {
    if (!tables.has(m[1])) manquantes.push([f, `table ${m[1]}`]);
  }
  for (const m of sql.matchAll(/alter table public\.([a-z_]+)\s+add column if not exists ([a-z_]+)/gi)) {
    if (!colonnes.has(`${m[1]}.${m[2]}`)) manquantes.push([f, `colonne ${m[1]}.${m[2]}`, m[1], m[2]]);
  }
}

// ⚠️ Une colonne ajoutee PUIS supprimee par une migration ulterieure est
// absente de la base a juste titre : ce n'est pas une divergence. Sans ce
// filtre, l'outil signalait `demo_requests.establishment_type`, ajoute en
// 202607010001 et retire en 202607010004.
// ⚠️ Un `alter table` peut enchainer DIX `drop column` separes par des
// virgules : chercher la table juste avant chaque drop ne marche pas. On
// suit la derniere table nommee, et on rattache les drops a celle-la.
const supprimees = new Set();
for (const f of fs.readdirSync(DOSSIER).filter((f) => f.endsWith(".sql"))) {
  const sql = fs.readFileSync(path.join(DOSSIER, f), "utf8");
  let table = null;
  for (const ligne of sql.split(/\r?\n/)) {
    const alt = /alter table (?:if exists )?public\.([a-z_]+)/i.exec(ligne);
    if (alt) table = alt[1];
    const drop = /drop column if exists ([a-z_]+)/i.exec(ligne);
    if (drop && table) supprimees.add(`${table}.${drop[1]}`);
  }
}
for (let i = manquantes.length - 1; i >= 0; i--) {
  const [, , table, col] = manquantes[i];
  if (table && supprimees.has(`${table}.${col}`)) manquantes.splice(i, 1);
}

console.log(`${tables.size} tables en base, ${colonnes.size} colonnes.\n`);
if (!manquantes.length) {
  console.log("✅ Aucune divergence : tout ce que les migrations creent existe en base.");
} else {
  console.log(`⚠ ${manquantes.length} objet(s) declares dans le depot mais ABSENTS de la base :`);
  for (const [f, quoi] of manquantes) console.log(`   ${quoi.padEnd(48)} ${f}`);
}
