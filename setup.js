// Page d'installation : execute les verifications depuis le navigateur du gerant.
//
// Elle existe parce que la base n'est joignable que depuis SA machine : le script SQL
// doit etre lance par lui dans Supabase. Cette page reduit l'operation a un
// copier-coller, puis controle objectivement ce qui est reellement en place.

import { isSupabaseConfigured, supabase } from "./supabaseClient.js";
import setupSql from "./supabase/migrations/SETUP_COMPLET.sql?raw";
import verificationSql from "./supabase/migrations/VERIFICATION.sql?raw";
import { classifyCheck, isUnreachableError } from "./lib/setup/classifyCheck.js";

const els = {
  projectRef: document.getElementById("project-ref"),
  summary: document.getElementById("summary"),
  checks: document.getElementById("checks"),
  recheck: document.getElementById("recheck"),
  openEditor: document.getElementById("open-editor"),
  copySql: document.getElementById("copy-sql"),
  sqlMeta: document.getElementById("sql-meta"),
  sqlLines: document.getElementById("sql-lines"),
  sqlPreview: document.getElementById("sql-preview"),
  sqlBlock: document.getElementById("sql-block"),
  copyTest: document.getElementById("copy-test"),
  testMeta: document.getElementById("test-meta"),
  testLines: document.getElementById("test-lines"),
  testPreview: document.getElementById("test-preview"),
};

/**
 * Ce que le script doit avoir installe.
 * Chaque entree est verifiable individuellement, pour dire precisement ce qui manque
 * plutot qu'un simple "ca ne marche pas".
 */
const CHECKS = [
  { kind: "table", name: "events", label: "Table des soirées" },
  { kind: "table", name: "qr_scans", label: "Scans QR" },
  { kind: "table", name: "event_metrics", label: "Cache des métriques" },
  { kind: "table", name: "establishment_schedule", label: "Réglages d'ouverture" },
  { kind: "table", name: "establishment_opening_hours", label: "Horaires jour par jour" },
  { kind: "column", table: "establishments", name: "public_code", label: "Code public (QR code)" },
  { kind: "column", table: "submissions", name: "event_id", label: "Publications rattachées aux soirées" },
  { kind: "column", table: "submissions", name: "declared_views", label: "Vues déclarées par le client" },
  { kind: "column", table: "submissions", name: "source", label: "Origine de la publication" },
  { kind: "rpc", name: "establishment_by_public_code", args: { p_code: "AAAAAAAA" }, label: "Résolution du QR code" },
];

/**
 * Codes d'erreur PostgREST signalant une absence reelle.
 * Toute autre erreur (RLS, permission) prouve au contraire que l'objet existe.
 */
async function runCheck(check) {
  try {
    if (check.kind === "rpc") {
      const { error } = await supabase.rpc(check.name, check.args);
      return { ...check, status: classifyCheck(error), error };
    }

    // limit(0) : on teste l'existence sans jamais lire de donnees.
    const table = check.kind === "column" ? check.table : check.name;
    const column = check.kind === "column" ? check.name : "*";
    const { error } = await supabase.from(table).select(column).limit(0);

    return { ...check, status: classifyCheck(error), error };
  } catch (error) {
    return { ...check, status: isUnreachableError(error) ? "unknown" : "missing", error };
  }
}

const MARKS = { ok: "✓", missing: "✕", unknown: "?" };

function renderChecks(results) {
  els.checks.innerHTML = results
    .map(
      (result) => `
      <li class="su-check is-${result.status}">
        <span class="su-check-mark" aria-hidden="true">${MARKS[result.status]}</span>
        <span class="su-check-label">${result.label}</span>
        <span class="su-check-name">${result.kind === "column" ? `${result.table}.${result.name}` : result.name}</span>
      </li>`,
    )
    .join("");
}

function renderSummary(results, fatalError) {
  els.sqlBlock.classList.remove("is-done");

  if (fatalError) {
    els.summary.className = "su-summary is-error";
    els.summary.textContent = fatalError;
    return;
  }

  const unknown = results.filter((result) => result.status === "unknown").length;
  const missing = results.filter((result) => result.status === "missing").length;

  // L'indetermination prime sur tout le reste : mieux vaut dire "je ne sais pas"
  // que d'afficher un faux vert.
  if (unknown) {
    els.summary.className = "su-summary is-error";
    els.summary.textContent =
      unknown === results.length
        ? "Supabase est injoignable : impossible de vérifier quoi que ce soit. Vérifie ta connexion, puis reviens."
        : `${unknown} vérification(s) n'ont pas abouti (connexion instable). Relance la vérification.`;
    return;
  }

  if (!missing) {
    els.summary.className = "su-summary is-ok";
    els.summary.textContent = "Tout est installé. La collecte est prête : affiche ton QR code et lance ta prochaine soirée.";
    els.sqlBlock.classList.add("is-done");
    return;
  }

  els.summary.className = "su-summary is-missing";
  els.summary.textContent =
    missing === results.length
      ? "Rien n'est encore installé. Exécute le script ci-dessous, puis reviens vérifier."
      : `${missing} élément(s) sur ${results.length} manquent encore. Réexécute le script ci-dessous : il est rejouable.`;
}

async function verify() {
  els.recheck.disabled = true;
  els.summary.className = "su-summary";
  els.summary.textContent = "Vérification en cours…";
  els.checks.innerHTML = "";

  if (!isSupabaseConfigured) {
    renderSummary([], "Les variables VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY ne sont pas configurées.");
    els.recheck.disabled = false;
    return;
  }

  try {
    const results = await Promise.all(CHECKS.map(runCheck));
    renderChecks(results);
    renderSummary(results, null);
  } catch (error) {
    renderSummary([], `Vérification impossible : ${error.message}`);
  } finally {
    els.recheck.disabled = false;
  }
}

/** Le lien vers l'editeur SQL est deduit de l'URL du projet. */
function setupEditorLink() {
  const url = import.meta.env.VITE_SUPABASE_URL || "";
  const ref = url.match(/https:\/\/([a-z0-9]+)\.supabase\.co/i)?.[1];

  if (!ref) {
    els.openEditor.href = "https://supabase.com/dashboard";
    els.projectRef.textContent = "";
    return;
  }

  els.openEditor.href = `https://supabase.com/dashboard/project/${ref}/sql/new`;
  els.projectRef.textContent = `projet ${ref}`;
}

/**
 * Copie un script dans le presse-papiers.
 * En cas de refus du navigateur, on selectionne le texte pour un Ctrl+C manuel
 * plutot que de laisser l'utilisateur sans solution.
 */
async function copyScript(text, button, previewNode, defaultLabel) {
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = "Copié";
    setTimeout(() => (button.textContent = defaultLabel), 2500);
  } catch {
    previewNode.closest("details").open = true;
    const range = document.createRange();
    range.selectNodeContents(previewNode);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    button.textContent = "Copie manuelle (Ctrl+C)";
  }
}

/** Affiche la taille et le contenu d'un script dans son bloc. */
function fillScript(sql, { metaNode, linesNode, previewNode }) {
  const lines = sql.split("\n").length;
  linesNode.textContent = lines;
  metaNode.textContent = `${lines} lignes · ${(sql.length / 1024).toFixed(0)} Ko`;
  previewNode.textContent = sql;
}

function init() {
  fillScript(setupSql, { metaNode: els.sqlMeta, linesNode: els.sqlLines, previewNode: els.sqlPreview });
  fillScript(verificationSql, { metaNode: els.testMeta, linesNode: els.testLines, previewNode: els.testPreview });

  setupEditorLink();
  els.recheck.addEventListener("click", verify);
  els.copySql.addEventListener("click", () =>
    copyScript(setupSql, els.copySql, els.sqlPreview, "Copier le script"),
  );
  els.copyTest.addEventListener("click", () =>
    copyScript(verificationSql, els.copyTest, els.testPreview, "Copier le test"),
  );

  verify();
}

init();
