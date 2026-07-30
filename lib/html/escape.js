/**
 * Echappe une valeur avant injection dans du HTML.
 *
 * Necessaire partout ou l'on construit du balisage par template : les titres de
 * recompenses, noms de DJ et noms de soirees sont saisis par les clients, et les textes
 * de recommandations peuvent venir du LLM. Aucune de ces sources n'est fiable.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
