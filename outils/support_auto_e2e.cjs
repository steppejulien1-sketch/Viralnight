// LA REPONSE AUTOMATIQUE DU SUPPORT, EN VRAI (prod par defaut).
//
//   node outils/support_auto_e2e.cjs
//
// Un compte jetable avec de vraies donnees (scan, story en attente, bon non
// utilise), une conversation de plusieurs messages postes comme le fait
// l'appli, et la reponse relue en base apres chaque message. Les comptes de
// test (@viralnight.test) n'envoient ni e-mail ni notification a Julien.
// Tout est supprime a la fin.

const V = require("../../06-pwa-clubbeurs/outils/lib_vn.cjs");
const SITE = process.env.VN_URL || "https://viralnight-koif.vercel.app";

const CONVERSATION = [
  "[Points] slt jai pa eu mes pts de ma story",
  "et c'est quand ?",
  "ou est mon bon ? et aussi c'est quoi le cadeau du jour",
  "combien il me manque pour le coupe file",
  "je dois tag qui dans ma story",
  "le barman a refusé mon cocktail",
  "merci",
];

(async () => {
  const c = await V.compteJetable("supportauto");
  const uid = c.uid;
  try {
    V.sql(`insert into public.users (id, handle, email, profile_proof_path) values ('${uid}', 'auto_${uid.slice(0, 6)}', '${c.email}', 'e2e/x');
      insert into public.welcome_bonuses (user_id, amount) values ('${uid}', 50);
      insert into public.point_grants (user_id, club_id, amount, unlocks_at, released, source)
        select '${uid}', id, 400, now(), false, 'scan' from public.clubs where slug = 'mirage-brussels';
      select public.release_due_points('${uid}');
      insert into public.story_events (user_id, club_id, kind, mentioned_at, base_points)
        select '${uid}', id, 'story', now() - interval '3 hours', 100 from public.clubs where slug = 'mirage-brussels';
      insert into public.redemptions (user_id, reward_id, qr_code, used)
        select '${uid}', id, 'VN-E2ETEST', false from public.rewards where title = 'Un cocktail offert' limit 1;`);
    const [, l] = await V.admin("/auth/v1/admin/generate_link", "POST", { type: "magiclink", email: c.email });
    const v = await (await fetch(`${V.BASE}/auth/v1/verify`, { method: "POST", headers: { apikey: V.ANON, "Content-Type": "application/json" }, body: JSON.stringify({ type: "email", email: c.email, token: l.email_otp }) })).json();

    for (const message of CONVERSATION) {
      await fetch(`${V.BASE}/rest/v1/support_messages`, {
        method: "POST",
        headers: { apikey: V.ANON, Authorization: "Bearer " + v.access_token, "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: uid, auteur: "client", message }),
      });
      const t0 = Date.now();
      const r = await fetch(`${SITE}/api/credit-clubbeur?action=support-nouveau`, { method: "POST", headers: { Authorization: "Bearer " + v.access_token, "Content-Type": "application/json" }, body: "{}" });
      const corps = await r.json();
      const [derniere] = V.sql(`select auteur, message from public.support_messages where user_id='${uid}' order by created_at desc limit 1`);
      console.log(`\nCLIENT : ${message}\n  -> ${derniere.auteur === "ia" ? derniere.message : "(pas de reponse : " + JSON.stringify(corps.ia) + ")"}  [${Date.now() - t0} ms]`);
    }
  } catch (e) {
    console.error("ERREUR", e.message);
  } finally {
    V.sql(`delete from public.support_messages where user_id='${uid}'; delete from public.redemptions where user_id='${uid}'; delete from public.story_events where user_id='${uid}'; delete from public.welcome_bonuses where user_id='${uid}';`);
    await V.supprimerCompte(uid);
  }
})();
