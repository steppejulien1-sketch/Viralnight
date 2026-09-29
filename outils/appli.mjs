/* Lance une commande pour l'une des deux applis natives (29/09/2026).

     node outils/appli.mjs gerant  vite build --config vite.config.mobile.js
     node outils/appli.mjs clubbeur cap sync ios

   Pose NOCTIFY_APPLI puis passe la main a la commande, sous Windows comme
   sur le Mac (pas de `NOCTIFY_APPLI=... cmd`, que cmd.exe ne comprend pas).
   capacitor.config.js et vite.config.mobile.js lisent cette variable. */
import { spawnSync } from "node:child_process";

const [appli, ...commande] = process.argv.slice(2);
if (!["clubbeur", "gerant"].includes(appli) || !commande.length) {
  console.error("Usage : node outils/appli.mjs <clubbeur|gerant> <commande...>");
  process.exit(2);
}
const res = spawnSync("npx", commande, {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, NOCTIFY_APPLI: appli },
});
process.exit(res.status ?? 1);
