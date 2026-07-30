import { runRules } from "./engine.js";
import { rewardRules } from "./rewardRules.js";
import { djRules } from "./djRules.js";
import { timingRules } from "./timingRules.js";
import { trendRules } from "./trendRules.js";
import { customerRules } from "./customerRules.js";

const allRules = [...rewardRules, ...djRules, ...timingRules, ...trendRules, ...customerRules];

/**
 * @param {object} analysisContext - sortie de lib/analytics/index.js runFullAnalysis()
 * @returns {import("./engine.js").Recommendation[]}
 */
export function generateRecommendations(analysisContext) {
  return runRules(allRules, analysisContext);
}
