// Analyse des clients finaux sur une soiree : qui publie le plus, qui scanne le plus,
// qui est fidele (present sur plusieurs soirees recentes).

/**
 * @param {object} params
 * @param {Array<object>} params.submissions - submissions de l'event courant
 * @param {Array<object>} params.qrScans - qr_scans de l'event courant
 * @param {Array<object>} params.recentSubmissions - submissions des soirees precedentes (meme establishment)
 */
export function analyzeCustomers({ submissions, qrScans, recentSubmissions }) {
  const reachByCustomer = new Map();
  for (const s of submissions) {
    reachByCustomer.set(s.customer_id, (reachByCustomer.get(s.customer_id) || 0) + (s.views_count || 0));
  }

  const scansByCustomer = new Map();
  for (const scan of qrScans) {
    scansByCustomer.set(scan.customer_id, (scansByCustomer.get(scan.customer_id) || 0) + 1);
  }

  const appearancesByCustomer = new Map();
  for (const s of recentSubmissions) {
    appearancesByCustomer.set(s.customer_id, (appearancesByCustomer.get(s.customer_id) || 0) + 1);
  }

  const mostViral = topEntry(reachByCustomer);
  const loyalCustomers = [...appearancesByCustomer.entries()].filter(([, count]) => count >= 3);
  const uniqueScanners = scansByCustomer.size;
  const uniquePublishers = reachByCustomer.size;

  return {
    mostViralCustomerId: mostViral?.[0] || null,
    mostViralCustomerReach: mostViral?.[1] || 0,
    loyalCustomersCount: loyalCustomers.length,
    uniqueScanners,
    uniquePublishers,
    scanToPublishRatio: uniqueScanners > 0 ? uniquePublishers / uniqueScanners : 0,
  };
}

function topEntry(map) {
  let best = null;
  for (const entry of map) {
    if (!best || entry[1] > best[1]) best = entry;
  }
  return best;
}
