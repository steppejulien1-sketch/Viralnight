// Les e-mails automatiques des commerces (03/10/2026).
//
// Julien : « cree un systeme qui envoie automatiquement des e-mails, eux
// n'auront plus rien a faire ». Une fois par semaine au plus, chaque client
// qui a accepte les offres d'un lieu recoit ou il en est : ses points, et la
// recompense de CE lieu qu'il peut prendre ou qui est la plus proche.
//
// Pur : pas de reseau, pas de base. L'envoi vit dans envoyerRappels.js,
// appele par le cron quotidien de api/instagram.js (?action=verifier-stories).
//
// 03/10/2026 : sans case a cocher. L'accord est donne a la creation du compte
// (CGU) ; seuls les clients VENUS dans le lieu sont concernes, et un lien de
// desabonnement en un clic est dans chaque e-mail (un « non » est garde dans
// consentements_offres et respecte pour toujours).

export const JOURS_ENTRE_RAPPELS = 7;

/** Le dernier rappel date-t-il d'assez longtemps ? */
export function peutRelancer(dernierRappelIso, maintenant = Date.now()) {
  if (!dernierRappelIso) return true;
  return Date.parse(dernierRappelIso) + JOURS_ENTRE_RAPPELS * 864e5 <= maintenant;
}

const nb = (n) => new Intl.NumberFormat("fr-BE").format(n);

/**
 * Le contenu du rappel, ou null s'il n'y a rien d'utile a dire.
 * @param {{ solde: number, recompenses: {titre: string, cout: number}[], ig?: string|null }} p
 * @returns {{ sujet: string, message: string } | null}
 */
export function messageRappel({ solde, recompenses, ig }) {
  const dispo = (recompenses || [])
    .filter((r) => r && r.titre && Number.isFinite(Number(r.cout)) && Number(r.cout) > 0)
    .map((r) => ({ titre: String(r.titre).trim(), cout: Math.round(Number(r.cout)) }))
    .sort((a, b) => a.cout - b.cout);
  if (!dispo.length) return null;
  const points = Math.max(0, Math.round(Number(solde) || 0));

  const abordables = dispo.filter((r) => r.cout <= points);
  if (abordables.length) {
    const liste = abordables.slice(-3).reverse().map((r) => `· ${r.titre} (${nb(r.cout)} points)`).join("\n");
    return {
      sujet: abordables.length > 1 ? "Tes points t'attendent" : `${abordables[0].titre} pour toi`,
      message: `Tu as ${nb(points)} points. Tu peux déjà les échanger contre :\n\n${liste}\n\nOuvre Noctify, échange tes points et montre ton bon sur place.`,
    };
  }

  const proche = dispo[0];
  const manque = proche.cout - points;
  const comment = ig
    ? `Une story qui mentionne @${ig} te rapporte 100 points.`
    : "Une story qui mentionne l'établissement te rapporte 100 points.";
  return {
    sujet: `Plus que ${nb(manque)} points pour ${proche.titre.charAt(0).toLowerCase()}${proche.titre.slice(1)}`,
    message: `Tu as ${nb(points)} points. Il t'en manque ${nb(manque)} pour : ${proche.titre}.\n\n${comment}`,
  };
}
