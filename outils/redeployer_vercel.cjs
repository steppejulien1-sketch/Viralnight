// Redeploie la production du B2B, pour que les variables d'environnement
// nouvellement posees prennent effet.
//
// ⚠️ PIEGES DE L'API VERCEL, deja payes :
//  - `forceNew` va en PARAMETRE D'URL, pas dans le corps du POST
//    (sinon HTTP 400 « should NOT have additional property ») ;
//  - il faut reprendre le `gitSource` du dernier deploiement de
//    PRODUCTION et le remettre dans le corps, sinon Vercel ne sait pas
//    quoi construire.

const fs = require("fs");

const PROJET = "prj_Q603DdOhiicfqtc1lWRnknT1K4FO";
const TEAM = "team_iSigYpkRP2kyMqt9Ph2iZyyu";
const jeton = fs.readFileSync("C:/Users/stepp/token-vercel.txt", "utf8").trim();

const api = async (chemin, options = {}) => {
  const sep = chemin.includes("?") ? "&" : "?";
  const r = await fetch(`https://api.vercel.com${chemin}${sep}teamId=${TEAM}`, {
    ...options,
    headers: { Authorization: `Bearer ${jeton}`, "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const t = await r.text();
  return [r.status, t ? JSON.parse(t) : null];
};

(async () => {
  const [, liste] = await api(`/v6/deployments?projectId=${PROJET}&target=production&limit=1`);
  const dernier = liste?.deployments?.[0];
  if (!dernier) throw new Error("aucun deploiement de production trouve");
  console.log("dernier deploiement :", dernier.uid, new Date(dernier.created).toISOString());

  const [, detail] = await api(`/v13/deployments/${dernier.uid}`);
  if (!detail?.gitSource) throw new Error("gitSource absent du deploiement de reference");

  const [st, out] = await api(`/v13/deployments?forceNew=1`, {
    method: "POST",
    body: JSON.stringify({
      name: detail.name,
      project: PROJET,
      target: "production",
      gitSource: detail.gitSource,
    }),
  });

  if (st >= 400) throw new Error(`creation du deploiement : ${st} ${JSON.stringify(out).slice(0, 300)}`);
  console.log("nouveau deploiement :", out.id, "->", out.readyState || out.status);
})().catch((e) => { console.error("ECHEC:", e.message); process.exit(1); });
