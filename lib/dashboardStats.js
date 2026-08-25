// Calcul des statistiques d'un club a partir des donnees brutes de
// fetchDashboardData() (dashboardData.js) -- extrait de app.js pour etre
// partage avec owner-preview.html, plutot que duplique.

export function getValidatedSubmissions(submissions) {
  return submissions.filter((submission) => submission.status === "validated");
}

export function getActiveRewards(rewards) {
  return rewards.filter((reward) => reward.active !== false);
}

export function getUniqueCustomerCount(items) {
  return new Set(items.map((item) => item.customer_id).filter(Boolean)).size;
}

export function getDashboardStats(data) {
  const submissions = data.submissions || [];
  const validated = getValidatedSubmissions(submissions);
  const activeRewards = getActiveRewards(data.rewards || []);
  const redemptions = data.rewardRedemptions || [];
  const reach = validated.reduce((sum, submission) => sum + Number(submission.views_count || 0), 0);
  const points = validated.reduce((sum, submission) => sum + Number(submission.points_awarded || 0), 0);
  // Les scans viennent de la table qr_scans. Aucune estimation : afficher un chiffre
  // invente comme s'il etait mesure induit le gerant en erreur sur sa frequentation.
  const qrScans = data.qrScans || [];

  return {
    submissions,
    validated,
    activeRewards,
    redemptions,
    receivedCount: submissions.length,
    validatedCount: validated.length,
    pendingCount: submissions.filter((submission) => submission.status === "pending").length,
    rejectedCount: submissions.filter((submission) => submission.status === "rejected").length,
    rewardedCustomers: getUniqueCustomerCount(redemptions),
    activeCustomers: getUniqueCustomerCount(submissions),
    reach,
    points,
    scanCount: qrScans.length,
    uniqueScanners: getUniqueCustomerCount(qrScans),
  };
}
