import { resolve } from "node:path";
import { existsSync, renameSync } from "node:fs";
import { defineConfig } from "vite";

/* Build de l'appli iOS/Android, separe du build du site.

   Pourquoi un second fichier plutot qu'une entree de plus dans
   vite.config.js : Capacitor embarque un dossier et ouvre son
   index.html. Il lui faut donc un dossier qui ne contienne QUE
   l'appli clubbeur -- pas la landing, pas le dashboard du gerant,
   pas l'admin. Les embarquer alourdirait l'app de plusieurs Mo de
   pages qu'un clubbeur ne verra jamais, et Apple regarde le poids.

   La sortie va dans dist-mobile/, a cote de dist/ qui reste le site.

   Utilisation : npm run build:mobile
*/
export default defineConfig({
  // Meme raison que dans vite.config.js : le pre-bundling esbuild casse
  // la resolution du Worker interne de maplibre-gl.
  optimizeDeps: { exclude: ["maplibre-gl"] },
  build: {
    outDir: "dist-mobile",
    emptyOutDir: true,
    rollupOptions: {
      input: { app: resolve(__dirname, "app-preview.html") },
    },
  },
  plugins: [
    {
      // Vite nomme le fichier de sortie d'apres son chemin d'entree, donc
      // app-preview.html. Capacitor, lui, n'ouvre que index.html et ne
      // sait pas viser autre chose. On renomme apres coup : les scripts
      // et les images sont references en chemins absolus (/assets/...),
      // renommer la page ne casse donc aucun lien.
      name: "noctify-entree-mobile",
      closeBundle() {
        const source = resolve(__dirname, "dist-mobile/app-preview.html");
        const cible = resolve(__dirname, "dist-mobile/index.html");
        if (existsSync(source)) renameSync(source, cible);
      },
    },
  ],
});
