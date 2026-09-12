// PROFIL ET AMIS, AVEC UN VRAI COMPTE.
//
//   node outils/clubbeur_connecte.cjs
//   VN_URL=http://127.0.0.1:5173 node outils/clubbeur_connecte.cjs
//
// Sortie : outils/pages-clubbeur/09-profil-connecte.{png,jpg}
//                                10-amis-connecte.{png,jpg}
//
// POURQUOI CET OUTIL EXISTE. `appli_clubbeur.cjs` photographie l'appli
// SANS session : Story, Amis et Profil n'y montrent que leur porte
// ("Connecte-toi pour..."). Julien, 09/09/2026 : "connecte-toi un peu
// parce que tu ne peux pas voir le profil ni les amis, et j'aimerais
// bien que tu puisses ameliorer ce point-la". Sans compte, ces deux
// ecrans ne peuvent ni etre juges ni etre corriges.
//
// ⚠️ A LANCER APRES `appli_clubbeur.cjs`, JAMAIS AVANT.
// Cet outil-la fait un `fs.rmSync` du dossier pages-clubbeur/ au
// demarrage : lance dans le mauvais ordre, il efface les deux captures
// produites ici, et la planche s'arrete sur un fichier manquant
// (09-profil-connecte.jpg). Paye le 11/09/2026.
//
// ⚠️ IL CREE UN VRAI COMPTE DANS LA VRAIE BASE CLUBBEUR, ET LE SUPPRIME.
// La suppression est dans un `finally` : elle passe meme si la capture
// echoue. En cas de plantage du process (Ctrl+C), le compte reste --
// son email est en `e2e-apercu-<horodatage>@viralnight.test`, ce qui le
// rend reconnaissable. NE JAMAIS nettoyer par motif d'email sans lister
// avant : un `delete like 'test-%'` a deja emporte un compte sans
// rapport (06/09/2026).
//
// ⚠️ AUCUN TRIGGER SUR auth.users DANS CETTE BASE. Creer le compte par
// l'API admin ne cree PAS la ligne `public.users` -- c'est l'appli qui
// la pose a l'inscription, avec un `handle` obligatoire. Sans elle, le
// profil se charge a moitie et la clef etrangere de `point_grants`
// refuse tout. On la pose donc a la main, juste apres.

const fs = require("fs");
const puppeteer = require("puppeteer-core");
const V = require("../../06-pwa-clubbeurs/outils/lib_vn.cjs");

const PROD = "https://viralnight-koif.vercel.app";
const SITE = process.env.VN_URL || PROD;
const DOSSIER = `${__dirname}/pages-clubbeur`;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// iPhone 14, comme appli_clubbeur.cjs : c'est la taille pour laquelle
// --u a ete calibre.
const LARGEUR = 390;
const HAUTEUR = 844;

(async () => {
  let compte = null;
  let navigateur = null;

  try {
    console.log("\nCompte jetable…");
    // ⚠️ Supabase COUPE la query string du redirect_to : inutile de
    // demander ?app=1 ici, on renavigue apres.
    compte = await V.compteJetable("apercu", `${SITE}/app-preview.html`);
    console.log(`  ${compte.email}`);

    // La ligne applicative, celle que l'API admin ne cree pas.
    const handle = "julien_" + compte.uid.slice(0, 4);
    /* ⚠️ `profile_proof_path` EST POSE EXPRES. L'ecran "Relie ton compte
       Instagram" (#vue-ig) prend la main juste apres la creation du
       compte et ne se retire que quand cette colonne est remplie. C'est
       voulu dans le produit -- mais il recouvre Profil ET Amis, donc
       sans ca cet outil ne photographie que lui, deux fois.
       On pose un chemin bidon : aucune capture n'est televersee, et le
       compte est supprime a la fin. */
    V.sql(
      `insert into public.users (id, handle, email, profile_proof_path)
       values ('${compte.uid}', '${handle}', '${compte.email}', 'apercu/aucune')
       on conflict (id) do nothing;`
    );
    console.log(`  @${handle}`);

    /* LE NOM EN HAUT DU PROFIL. L'adresse jetable (e2e-apercu-...) ne
       contient aucun prenom : nomAffiche() rendrait null, et la capture
       montrerait le pseudo au lieu du nom en capitales. On pose un nom la
       ou Google et Apple posent le leur -- et ou Reglages range le nom
       corrige : user_metadata.full_name. Nom invente. A faire AVANT la
       connexion : la session emporte les metadonnees du moment. */
    const [stNom] = await V.admin(`/auth/v1/admin/users/${compte.uid}`, "PUT", {
      user_metadata: { full_name: "Camille Durand" },
    });
    console.log(`  nom pose (HTTP ${stNom})`);

    navigateur = await puppeteer.launch({
      executablePath: V.CHROME,
      headless: "new",
      args: ["--force-color-profile=srgb", "--hide-scrollbars"],
    });
    const page = await navigateur.newPage();
    const cadrer = (dsf) =>
      page.setViewport({ width: LARGEUR, height: HAUTEUR, deviceScaleFactor: dsf, isMobile: true, hasTouch: true });
    await cadrer(2);

    async function prendre(nom, titre) {
      await page.screenshot({ path: `${DOSSIER}/${nom}.png` });
      await cadrer(1);
      await page.screenshot({ path: `${DOSSIER}/${nom}.jpg`, type: "jpeg", quality: 78 });
      await cadrer(2);
      console.log(`  ${nom}  ${titre}`);
    }

    console.log("\nConnexion par lien magique…");
    await page.goto(compte.lien, { waitUntil: "networkidle2" });
    await pause(3500);

    await page.goto(`${SITE}/app-preview.html?app=1&cb=${Date.now()}`, { waitUntil: "networkidle2" });
    await pause(4000);

    // L'accueil ne se pose plus une fois la session lue, mais il peut
    // encore etre la le temps du premier rendu.
    await page.evaluate(() => document.querySelector("#vue-accueil")?.classList.add("masque"));
    await pause(1200);

    const connecte = await page.evaluate(async () => {
      const s = await window.__sbClubbeur?.auth?.getSession?.();
      return !!s?.data?.session;
    }).catch(() => null);
    console.log(`  session lue par l'appli : ${connecte === null ? "inconnu" : connecte}`);

    console.log("\nLes deux ecrans");
    await page.evaluate(() => document.querySelector("#tab-profil").click());
    await pause(3000);
    await prendre("09-profil-connecte", "Profil — avec un compte");

    // Le bas du profil : les parametres en blocs facon DUSK (Partager,
    // Aide, Compte). Hors champ sur la premiere capture.
    await page.evaluate(() => {
      const vue = document.querySelector("#vue-profil");
      vue.scrollTop = vue.scrollHeight;
    });
    await pause(600);
    await prendre("09b-profil-parametres", "Profil — les parametres");
    await page.evaluate(() => { document.querySelector("#vue-profil").scrollTop = 0; });

    await page.evaluate(() => document.querySelector("#tab-amis").click());
    await pause(3000);
    await prendre("10-amis-connecte", "Amis — avec un compte");

    // Ce que les deux ecrans affichent VRAIMENT, pour pouvoir juger sans
    // ouvrir l'image : une capture ne dit pas si un bloc est vide parce
    // qu'il n'y a rien ou parce qu'il a echoue.
    const texte = await page.evaluate(() => ({
      profil: document.querySelector("#vue-profil")?.innerText.replace(/\n{2,}/g, "\n").trim().slice(0, 600),
      amis: document.querySelector("#vue-amis")?.innerText.replace(/\n{2,}/g, "\n").trim().slice(0, 600),
    }));
    fs.writeFileSync(`${DOSSIER}/connecte.json`, JSON.stringify(texte, null, 1));
    console.log("\n--- PROFIL ---\n" + texte.profil);
    console.log("\n--- AMIS ---\n" + texte.amis);
  } finally {
    if (navigateur) await navigateur.close();
    if (compte) {
      await V.supprimerCompte(compte.uid);
      console.log(`\ncompte jetable supprime (${compte.email})`);
    }
  }
})().catch((e) => {
  console.error("\nECHEC:", e.message);
  process.exit(1);
});
