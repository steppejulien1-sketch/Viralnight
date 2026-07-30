import { resolve } from "node:path";
import { defineConfig } from "vite";
import { apiPlugin } from "./vite-plugin-api.js";

export default defineConfig({
  // Rend les fonctions api/ appelables en local, comme sur Vercel.
  plugins: [apiPlugin()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        app: resolve(__dirname, "app.html"),
        admin: resolve(__dirname, "admin.html"),
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
      },
    },
  },
});
