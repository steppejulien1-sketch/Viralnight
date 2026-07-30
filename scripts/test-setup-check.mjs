// Tests de l'interpretation des erreurs de verification.
// L'enjeu : ne JAMAIS afficher "installe" quand on n'a pas pu verifier.

import { classifyCheck, isMissingError, isUnreachableError } from "../lib/setup/classifyCheck.js";

let passed = 0, failed = 0;
const check = (label, cond, detail = "") => {
  if (cond) { passed++; console.log(`  OK   ${label}`); }
  else { failed++; console.log(`  FAIL ${label}${detail ? `\n       ${detail}` : ""}`); }
};

console.log("\nObjet present");
check("aucune erreur -> ok", classifyCheck(null) === "ok");
check("erreur RLS -> ok (l'objet a repondu)", classifyCheck({ code: "42501", message: "permission denied" }) === "ok");
check("ligne absente -> ok", classifyCheck({ code: "PGRST116", message: "no rows" }) === "ok");

console.log("\nObjet absent");
check("table inexistante -> missing", classifyCheck({ code: "42P01", message: 'relation "events" does not exist' }) === "missing");
check("colonne inexistante -> missing", classifyCheck({ code: "42703", message: "column does not exist" }) === "missing");
check("fonction inexistante -> missing", classifyCheck({ code: "42883", message: "function does not exist" }) === "missing");
check("cache de schema PostgREST -> missing", classifyCheck({ code: "PGRST205", message: "Could not find the table" }) === "missing");
check("message sans code -> missing", classifyCheck({ message: "Could not find the table 'qr_scans' in the schema cache" }) === "missing");

console.log("\nVerification impossible (le cas dangereux)");
for (const message of ["Failed to fetch", "NetworkError when attempting to fetch", "Load failed", "request timed out", "The operation was aborted", "getaddrinfo ENOTFOUND db.supabase.co", "connect ECONNREFUSED"]) {
  check(`"${message}" -> unknown`, classifyCheck({ message }) === "unknown", `obtenu: ${classifyCheck({ message })}`);
}
check("une panne reseau n'est jamais 'ok'", classifyCheck({ message: "Failed to fetch" }) !== "ok");
check("une panne reseau n'est jamais 'missing'", classifyCheck({ message: "Failed to fetch" }) !== "missing");

console.log("\nPredicats");
check("isMissingError sur null", isMissingError(null) === false);
check("isUnreachableError sur null", isUnreachableError(null) === false);
check("reseau prime sur code manquant", classifyCheck({ code: "42P01", message: "Failed to fetch" }) === "unknown");

console.log(`\n${passed} test(s) OK, ${failed} echec(s).`);
if (failed > 0) process.exit(1);
