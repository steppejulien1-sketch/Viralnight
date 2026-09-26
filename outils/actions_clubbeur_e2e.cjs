// LES ACTIONS QUI RAPPORTENT OU COUTENT DES POINTS, DE BOUT EN BOUT.
//
//   node outils/actions_clubbeur_e2e.cjs            (prod)
//   VN_URL=http://127.0.0.1:4173 node outils/actions_clubbeur_e2e.cjs
//
// Compte jetable, vraie base clubbeur :
// 1. scan du QR par l'appareil photo (?club=<slug>) : +15 et un message ;
// 2. cadeau du jour : bouton « Récupérer » -> ligne daily_gifts ;
// 3. boutique : on lui donne de quoi payer, fiche « Cocktail », Echanger ->
//    ligne redemptions + solde debite.
// Le compte et ses lignes sont supprimes a la fin, quoi qu'il arrive.

const puppeteer = require("puppeteer-core");
const V = require("../../06-pwa-clubbeurs/outils/lib_vn.cjs");

const SITE = process.env.VN_URL || "https://viralnight-koif.vercel.app";
// « mirage-brussels » est masque depuis le 25/09/2026 : le vrai lieu est « mirage ».
const SLUG = "mirage";
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";

(async () => {
  const bilan = { erreursJs: [], requetes: [] };
  let compte = null, navigateur = null;
  try {
    compte = await V.compteJetable("actions", `${SITE}/app-preview.html`);
    const uid = compte.uid;
    V.sql(`insert into public.users (id, handle, email, profile_proof_path) values ('${uid}', 'act_${uid.slice(0, 6)}', '${compte.email}', 'e2e/aucune')
           on conflict (id) do update set handle = excluded.handle, profile_proof_path = excluded.profile_proof_path;
           insert into public.welcome_bonuses (user_id, amount) values ('${uid}', 0) on conflict do nothing;`);

    navigateur = await puppeteer.launch({ executablePath: V.CHROME, headless: "new", args: ["--hide-scrollbars"] });
    const page = await navigateur.newPage();
    await page.setUserAgent(IPHONE);
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.evaluateOnNewDocument((id) => {
      try {
        localStorage.setItem("vn_stat_installe", "1");
        localStorage.setItem("vn_parcours_fini", id);
        localStorage.setItem("vn_notif_report", String(Date.now() + 864e5)); localStorage.setItem("vn_majeur_" + id, "1");
      } catch (e) {}
    }, uid);
    page.on("pageerror", (e) => bilan.erreursJs.push(e.message));
    page.on("response", (r) => { if (r.status() >= 400 && /supabase|\/api\//.test(r.url())) bilan.requetes.push(r.status() + " " + r.url().slice(0, 140)); });

    // Session : le lien magique pose le jeton sur le domaine de prod. En
    // local, on recopie la session dans le localStorage du site teste.
    await page.goto(compte.lien, { waitUntil: "networkidle2" });
    await pause(2500);
    if (!SITE.includes("vercel.app")) {
      const cles = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter((k) => k.startsWith("sb-")).map((k) => [k, localStorage.getItem(k)])));
      await page.goto(`${SITE}/app-preview.html?app=1`, { waitUntil: "domcontentloaded" });
      await page.evaluate((c) => Object.entries(c).forEach(([k, v]) => localStorage.setItem(k, v)), cles);
    }

    // 1. Scan par l'appareil photo
    // 26/09/2026 (migration 0058) : le QR porte un jeton SIGNE et l'affiche
    // exige d'etre sur place. On demande le jeton a la base (cle service) et
    // on pose le telephone a la position du lieu.
    const lieu = V.sql(`select id, lat, lng from public.clubs where slug='${SLUG}'`)[0];
    const jeton = V.sql(`select jeton from public.qr_jeton('${lieu.id}', false)`)[0].jeton;
    await navigateur.defaultBrowserContext().overridePermissions(new URL(SITE).origin, ["geolocation"]);
    await page.setGeolocation({ latitude: Number(lieu.lat), longitude: Number(lieu.lng), accuracy: 20 });
    await page.goto(`${SITE}/app-preview.html?app=1&qr=${encodeURIComponent(jeton)}&cb=${Date.now()}`, { waitUntil: "networkidle2" });
    await pause(6000);
    bilan.scan = {
      grant: V.sql(`select count(*)::int n from public.point_grants where user_id='${uid}' and source='scan'`)[0].n,
      message: await page.evaluate(() => document.getElementById("pf-msg-bientot")?.textContent || null),
      urlGardeApp: await page.evaluate(() => location.search),
    };

    // 2. Cadeau du jour
    await page.reload({ waitUntil: "networkidle2" });
    await pause(5000);
    const texteCadeau = () => page.evaluate(() => { const c = document.getElementById("cadeau"); return c && !c.hidden ? c.className + " | " + c.textContent.replace(/\s+/g, " ").trim().slice(0, 90) : null; });
    bilan.cadeau = { avant: await texteCadeau() };
    const reponses = [];
    const ecoute = async (r) => { if (/rpc\/(daily_gift|welcome_bonus)$/.test(r.url())) { try { reponses.push(r.url().split("/").pop() + " " + (await r.text()).slice(0, 120)); } catch (e) {} } };
    page.on("response", ecoute);
    await page.evaluate(() => document.getElementById("cadeau-btn")?.click());
    await pause(1200);
    bilan.cadeau.apres = await texteCadeau();
    await pause(3000);
    page.off("response", ecoute);
    bilan.cadeau.rpc = reponses;
    bilan.cadeau.ligne = V.sql(`select count(*)::int n from public.daily_gifts where user_id='${uid}'`)[0].n;

    // 3. Boutique
    V.sql(`insert into public.point_grants (user_id, club_id, amount, unlocks_at, released, source)
           select '${uid}', id, 400, now(), false, 'cadeau' from public.clubs where slug='${SLUG}';
           select public.release_due_points('${uid}');`);
    const soldeAvant = V.sql(`select points_balance from public.users where id='${uid}'`)[0].points_balance;
    await page.reload({ waitUntil: "networkidle2" });
    await pause(5000);
    await page.evaluate(() => document.getElementById("tab-boutique")?.click());
    await pause(1500);
    // La boutique est une liste de lieux (.bar-couverture) ; un lieu ouvre sa page (#vb-sections).
    bilan.sections = await page.evaluate(() => [...document.querySelectorAll(".bar-couverture .bar-nom")].map((x) => x.textContent.trim()));
    await page.evaluate(() => [...document.querySelectorAll(".bar-couverture")].find((x) => /mira(ge|no)/i.test(x.textContent))?.click());
    await pause(2500);
    const ouvert = await page.evaluate(() => {
      const cible = [...document.querySelectorAll("#vb-sections .vb-grille > *")].find((e) => /cocktail/i.test(e.textContent || ""));
      if (!cible) return false;
      cible.click();
      return cible.textContent.trim().slice(0, 60);
    });
    await pause(1500);
    bilan.boutique = { carte: ouvert, bouton: await page.evaluate(() => document.getElementById("sh-cta")?.textContent || null) };
    await page.evaluate(() => document.getElementById("sh-cta")?.click());
    await pause(4000);
    bilan.boutique.ligne = V.sql(`select count(*)::int n from public.redemptions where user_id='${uid}'`)[0].n;
    bilan.boutique.solde = { avant: soldeAvant, apres: V.sql(`select points_balance from public.users where id='${uid}'`)[0].points_balance };
    bilan.boutique.ecran = await page.evaluate(() => document.querySelector(".bon-ticket, .sheet-ok")?.textContent?.trim().slice(0, 80) || document.getElementById("pf-msg-bientot")?.textContent || null);
  } catch (e) {
    bilan.plantage = e.message;
  } finally {
    if (navigateur) await navigateur.close();
    if (compte) {
      try { V.sql(`delete from public.redemptions where user_id='${compte.uid}'; delete from public.daily_gifts where user_id='${compte.uid}'; delete from public.welcome_bonuses where user_id='${compte.uid}';`); } catch (e) {}
      await V.supprimerCompte(compte.uid);
    }
    console.log(JSON.stringify(bilan, null, 1));
  }
})();
