import { resolve } from "node:path";
import { defineConfig } from "vite";
import { apiPlugin } from "./vite-plugin-api.js";

export default defineConfig({
  // Rend les fonctions api/ appelables en local, comme sur Vercel.
  plugins: [apiPlugin()],
  // maplibre-gl demarre un Worker interne via `new URL(..., import.meta.url)` ;
  // le pre-bundling esbuild de Vite casse cette resolution d'URL, ce qui bloque
  // silencieusement le chargement du style (aucune erreur, juste une carte vide).
  optimizeDeps: { exclude: ["maplibre-gl"] },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        app: resolve(__dirname, "app.html"),
        admin: resolve(__dirname, "admin.html"),
        adminProspection: resolve(__dirname, "admin-prospection.html"),
        simulateur: resolve(__dirname, "simulateur.html"),
        viralIntelligence: resolve(__dirname, "viral-intelligence.html"),
        demo: resolve(__dirname, "demo.html"),
        chat: resolve(__dirname, "chat.html"),
        scan: resolve(__dirname, "scan.html"),
        qr: resolve(__dirname, "qr.html"),
        setup: resolve(__dirname, "setup.html"),
        live: resolve(__dirname, "live.html"),
        connexion: resolve(__dirname, "connexion.html"),
        inscription: resolve(__dirname, "inscription.html"),
        bienvenue: resolve(__dirname, "bienvenue.html"),
        mentionsLegales: resolve(__dirname, "mentions-legales.html"),
        confidentialite: resolve(__dirname, "confidentialite.html"),
        cgu: resolve(__dirname, "cgu.html"),
        cookies: resolve(__dirname, "cookies.html"),
        cartePreview: resolve(__dirname, "carte-preview.html"),
        appPreview: resolve(__dirname, "app-preview.html"),
        ownerPreview: resolve(__dirname, "owner-preview.html"),
      },
    },
  },
});
