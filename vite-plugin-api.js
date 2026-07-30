import { readdirSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Sert les fonctions du dossier api/ pendant `vite dev`.
 *
 * En production, Vercel expose chaque fichier api/*.js comme une fonction serverless.
 * En local, Vite ne s'occupe que du front : sans ce plugin, tout appel a /api/... renvoie
 * l'index HTML, ce qui rend l'API impossible a tester avant deploiement.
 *
 * Les handlers recoivent les objets (request, response) natifs de Node, exactement comme
 * chez Vercel. Le module est recharge a chaque appel pour que les modifications de code
 * soient prises en compte sans redemarrer le serveur.
 */
export function apiPlugin({ apiDir = "api", envFile = ".env.local" } = {}) {
  return {
    name: "viralnight-api-dev",
    apply: "serve",

    configureServer(server) {
      const apiPath = resolve(server.config.root, apiDir);
      if (!existsSync(apiPath)) return;

      loadEnvFile(resolve(server.config.root, envFile));

      const routes = new Set(
        readdirSync(apiPath)
          .filter((file) => file.endsWith(".js"))
          .map((file) => file.replace(/\.js$/, "")),
      );

      server.middlewares.use(async (request, response, next) => {
        if (!request.url?.startsWith("/api/")) return next();

        const route = new URL(request.url, "http://localhost").pathname.replace(/^\/api\//, "");
        if (!routes.has(route)) return next();

        try {
          // Le suffixe de requete casse le cache d'ESM pour le handler lui-meme.
          //
          // Limite connue : ses imports (lib/...) restent, eux, en cache pour la duree
          // du process. Modifier un fichier de lib/ pendant `npm run dev` exige donc de
          // relancer le serveur. Node ne permet pas de vider le cache ESM, et reecrire
          // tout le graphe d'imports serait plus fragile que ce redemarrage.
          const moduleUrl = `${pathToFileURL(resolve(apiPath, `${route}.js`)).href}?t=${Date.now()}`;
          const handler = (await import(moduleUrl)).default;

          if (typeof handler !== "function") {
            throw new Error(`api/${route}.js n'exporte pas de handler par defaut.`);
          }

          await handler(request, response);
        } catch (error) {
          server.config.logger.error(`[api-dev] /api/${route} a echoue : ${error.message}`);
          if (!response.writableEnded) {
            response.statusCode = 500;
            response.setHeader("Content-Type", "application/json; charset=utf-8");
            response.end(JSON.stringify({ error: `Erreur locale : ${error.message}` }));
          }
        }
      });

      server.config.logger.info(
        `\n  api dev  ${[...routes].map((route) => `/api/${route}`).join("  ")}\n`,
      );
    },
  };
}

/**
 * Charge les variables d'environnement serveur depuis .env.local.
 * Vite n'expose au front que les cles prefixees VITE_ ; les handlers ont besoin
 * des autres (service_role, cles d'API) dans process.env.
 */
function loadEnvFile(path) {
  if (!existsSync(path)) return;

  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?$/);
    if (!match) continue;
    const [, key, rawValue = ""] = match;
    if (key in process.env) continue;
    process.env[key] = rawValue.trim().replace(/^["']|["']$/g, "");
  }
}
