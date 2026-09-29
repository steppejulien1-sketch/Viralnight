import { resolve } from "node:path";
import { existsSync, renameSync } from "node:fs";
import { defineConfig } from "vite";

/* Build des applis iOS/Android, separe du build du site.

   Pourquoi un second fichier plutot qu'une entree de plus dans
   vite.config.js : Capacitor embarque un dossier et ouvre son
   index.html. Il lui faut donc un dossier qui ne contienne QUE
   l'appli -- pas la landing, pas le dashboard, pas l'admin. Les
   embarquer alourdirait l'app de plusieurs Mo de pages que personne
   n'y verra jamais, et Apple regarde le poids.

   Deux applis (29/09/2026), choisies par NOCTIFY_APPLI comme dans
   capacitor.config.js :
     - clubbeur : app-preview.html -> dist-mobile/  (npm run build:mobile)
     - gerants  : club-app.html    -> dist-gerant/  (npm run build:gerant)

   dist/ reste le site, intouche.
*/
const gerant = process.env.NOCTIFY_APPLI === "gerant";
const page = gerant ? "club-app.html" : "app-preview.html";
const sortie = gerant ? "dist-gerant" : "dist-mobile";

export default defineConfig({
  // Meme raison que dans vite.config.js : le pre-bundling esbuild casse
  // la resolution du Worker interne de maplibre-gl.
  optimizeDeps: { exclude: ["maplibre-gl"] },
  build: {
    outDir: sortie,
    emptyOutDir: true,
    rollupOptions: {
      input: { app: resolve(__dirname, page) },
    },
  },
  plugins: [
    {
      // Vite nomme le fichier de sortie d'apres son chemin d'entree.
      // Capacitor, lui, n'ouvre que index.html et ne sait pas viser autre
      // chose. On renomme apres coup : les scripts et les images sont
      // references en chemins absolus (/assets/...), renommer la page ne
      // casse donc aucun lien.
      name: "noctify-entree-mobile",
      closeBundle() {
        const source = resolve(__dirname, sortie, page);
        const cible = resolve(__dirname, sortie, "index.html");
        if (existsSync(source)) renameSync(source, cible);
      },
    },
  ],
});
