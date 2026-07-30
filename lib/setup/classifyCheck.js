// Interpretation d'une erreur PostgREST lors de la verification d'installation.
//
// Le piege a eviter : traiter "je n'ai pas pu verifier" comme "c'est installe".
// Une coupure reseau afficherait alors toutes les verifications au vert et laisserait
// croire que la base est prete alors qu'elle est vide. On distingue donc trois etats,
// et l'indetermination n'est jamais confondue avec un succes.

/** Codes PostgREST/Postgres signalant que l'objet n'existe pas. */
const MISSING_CODES = new Set(["42P01", "42703", "42883", "PGRST202", "PGRST204", "PGRST205"]);

export function isMissingError(error) {
  if (!error) return false;
  if (MISSING_CODES.has(error.code)) return true;
  return /could not find|does not exist|schema cache/i.test(error.message || "");
}

/** Erreur de transport : elle ne dit rien sur l'existence de l'objet. */
export function isUnreachableError(error) {
  if (!error) return false;
  return /failed to fetch|networkerror|load failed|timeout|timed out|aborted|econnrefused|enotfound/i.test(
    error.message || "",
  );
}

/**
 * @param {{code?: string, message?: string} | null | undefined} error
 * @returns {"ok" | "missing" | "unknown"}
 */
export function classifyCheck(error) {
  if (!error) return "ok";
  if (isUnreachableError(error)) return "unknown";
  if (isMissingError(error)) return "missing";
  // Erreur de permission ou de politique RLS : l'objet a repondu, donc il existe.
  return "ok";
}
