/* LE PONT NATIF — ce que l'appli sait faire de plus qu'un site.

   ⚠️ POURQUOI CE FICHIER EXISTE, ET PAS DES APPELS DIRECTS DANS L'APPLI.
   `app-preview.html` a deux vies : la maquette web (celle que Julien montre,
   celle qu'un clubbeur ouvre en scannant un QR a 1 h du matin) et l'appli
   installee. Le web est le canal d'acquisition -- s'il casse, le produit
   casse. Chaque fonction d'ici marche donc DANS LES DEUX CAS : au natif elle
   prend le chemin natif, au navigateur elle retombe sur ce que l'appli
   faisait deja. Aucun appel a `Capacitor` ne doit exister ailleurs.

   ⚠️ LES PLUGINS SE CHARGENT A LA DEMANDE. Un `import` statique les mettrait
   dans le bundle web, ou ils ne servent a rien : plusieurs dizaines de kilo-
   octets pour du code jamais execute, sur des reseaux de club qui rament.
   D'ou les `import()` dynamiques, tous derriere `estNatif`.

   ⚠️ LES DEUX APPLIS PASSENT PAR ICI (29/09/2026) : l'appli clubbeur
   (app-preview.html) et l'appli gerants (club-app.html). Importer ce
   fichier suffit a faire d'une page une appli dans la coquille native
   (voir demarrerCoque plus bas) ; au navigateur, l'importer ne fait rien.
*/

export const estNatif =
  typeof window !== "undefined" &&
  !!window.Capacitor &&
  typeof window.Capacitor.isNativePlatform === "function" &&
  window.Capacitor.isNativePlatform();

/* Un plugin charge une fois, garde ensuite. Si l'import echoue -- version
   absente, plateforme sans ce plugin -- on retient l'echec et on n'y revient
   pas : reessayer a chaque tap ferait ramer sans rien changer. */
const cache = new Map();
async function plugin(nom, charger) {
  if (!estNatif) return null;
  if (cache.has(nom)) return cache.get(nom);
  let mod = null;
  try {
    mod = await charger();
  } catch (e) {
    console.warn("[natif] plugin " + nom + " indisponible", e);
  }
  cache.set(nom, mod);
  return mod;
}

/* ================= LE RETOUR HAPTIQUE =================
   Le detail qui separe une appli d'une page web, et le moins cher de tous.
   Un point gagne qu'on SENT vaut trois animations.

   Trois intensites seulement. Une palette plus fine ne se distingue pas dans
   la poche, et sur Android tout finit en vibration de duree variable. */
export async function vibrer(genre) {
  const m = await plugin("haptics", () => import("@capacitor/haptics"));
  if (!m) return;
  try {
    if (genre === "succes") await m.Haptics.notification({ type: "SUCCESS" });
    else if (genre === "erreur") await m.Haptics.notification({ type: "ERROR" });
    else await m.Haptics.impact({ style: genre === "fort" ? "MEDIUM" : "LIGHT" });
  } catch (e) {
    /* Un telephone sans moteur haptique, ou l'utilisateur qui l'a coupe.
       Ce n'est pas une panne : on ne vibre pas, c'est tout. */
  }
}

/* ================= LE SCAN DU QR =================
   Le scanner natif ouvre la camera du systeme : mise au point continue,
   correction de la lumiere, decodage materiel. jsQR fait le meme travail en
   JavaScript sur des images de <video> -- honnete en plein jour, mediocre
   dans un club, qui est exactement l'endroit ou on s'en sert.

   Rend le texte du QR, ou null si l'utilisateur a ferme le scanner. En web,
   rend `undefined` : c'est le signal que l'appelant doit prendre son propre
   chemin (la boucle jsQR), et il se distingue de l'annulation. */
export async function scannerQr(consigne) {
  const m = await plugin("scanner", () => import("@capacitor/barcode-scanner"));
  if (!m) return undefined;
  try {
    const res = await m.CapacitorBarcodeScanner.scanBarcode({
      hint: m.CapacitorBarcodeScannerTypeHint.QR_CODE,
      scanInstructions: consigne || "Vise le QR code affiché dans le club",
      scanOrientation: 1, // portrait : l'affiche est verticale, le telephone aussi
    });
    return res && res.ScanResult ? res.ScanResult : null;
  } catch (e) {
    /* Fermeture par l'utilisateur ET erreur reelle passent par la meme
       exception. On ne peut pas les distinguer, et on n'en a pas besoin :
       dans les deux cas il n'y a pas de code, et on ne l'accuse de rien. */
    return null;
  }
}

/* ================= LA POSITION =================
   `navigator.geolocation` fonctionne dans la WKWebView, mais son autorisation
   est celle du "site" et non celle de l'appli : elle se redemande a chaque
   session et n'apparait pas dans les reglages iOS de Noctify. Le plugin
   demande la vraie permission systeme, celle qui se souvient.

   Meme forme de retour que getCurrentPosition pour que l'appelant n'ait pas
   a distinguer les deux mondes. */
export async function position(options) {
  const m = await plugin("geoloc", () => import("@capacitor/geolocation"));
  if (!m) return undefined;
  try {
    const p = await m.Geolocation.getCurrentPosition({
      // Le club le plus proche, pas la place de parking -- sauf pour le scan
      // du QR (26/09/2026), qui doit prouver qu'on est sur place.
      enableHighAccuracy: !!(options && options.precise),
      timeout: (options && options.timeout) || 8000,
      maximumAge: (options && options.maximumAge) || 600000,
    });
    return { coords: { latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy } };
  } catch (e) {
    return null; // refus ou echec : l'appelant garde son club par defaut
  }
}

/* Est-ce que la permission est DEJA accordee ? Sert a decider si on peut
   localiser en silence au demarrage, ou s'il faut attendre que le clubbeur
   le demande. Ne declenche jamais de fenetre de permission. */
export async function positionAutorisee() {
  const m = await plugin("geoloc", () => import("@capacitor/geolocation"));
  if (!m) return undefined;
  try {
    const e = await m.Geolocation.checkPermissions();
    return e.location === "granted" || e.coarseLocation === "granted";
  } catch (e) {
    return false;
  }
}

/* ================= LES LIENS EXTERNES =================
   Un lien vers un autre site s'ouvre HORS de l'appli (29/09/2026) : dans
   Safari, ou directement dans l'appli concernee quand elle est installee
   (Instagram, TikTok, Google Maps reconnaissent leurs liens https). Charge
   dans la webview, il remplacait l'appli par un site, sans bouton retour.

   Les liens `instagram://` et `tiktok://` continuent de passer par
   location.href : la coquille les confie deja au systeme. */
export async function ouvrirLien(url) {
  const lanceur = await plugin("launcher", () => import("@capacitor/app-launcher"));
  if (lanceur) {
    try {
      await lanceur.AppLauncher.openUrl({ url });
      return true;
    } catch (e) {}
  }
  const m = await plugin("browser", () => import("@capacitor/browser"));
  if (!m) return false;
  try {
    await m.Browser.open({ url });
    return true;
  } catch (e) {
    return false;
  }
}

/* ================= LA COQUILLE =================
   Ce qui n'a pas d'equivalent web du tout : la barre d'etat, l'ecran de
   lancement, le bouton retour d'Android, et le reveil de l'appli.

   `surRetour` : sur Android, le bouton retour materiel ferme l'appli par
   defaut, meme au milieu d'un ecran. C'est un motif de rejet cote Play et
   surtout ca enrage. L'appelant rend `true` s'il a consomme le geste
   (fermer une feuille), `false` pour laisser l'appli se mettre en veille.

   `surReprise` : quand l'appli revient au premier plan apres des minutes ou
   des heures, ses points affiches sont peut-etre perimes -- une story a pu
   etre validee entre-temps. On previent l'appelant pour qu'il rafraichisse. */
export async function preparerCoque({ surRetour, surReprise } = {}) {
  if (!estNatif) return;

  const barre = await plugin("statusbar", () => import("@capacitor/status-bar"));
  if (barre) {
    try {
      /* Le contenu de l'appli est clair : il faut donc du texte SOMBRE dans
         la barre d'etat. Style.Light nomme la couleur du FOND presume, pas
         celle du texte -- l'inverse de ce qu'on croit en le lisant.
         capacitor.config.json dit "LIGHT" pour la meme raison. */
      await barre.StatusBar.setStyle({ style: "LIGHT" });
      /* La page passe SOUS la barre d'etat (contentInset "never" dans
         capacitor.config.js) : c'est son CSS qui se decale avec
         env(safe-area-inset-top), comme dans la PWA installee. */
      await barre.StatusBar.setOverlaysWebView({ overlay: true });
    } catch (e) {}
  }

  const app = await plugin("app", () => import("@capacitor/app"));
  if (app) {
    try {
      if (typeof surRetour === "function") {
        app.App.addListener("backButton", ({ canGoBack }) => {
          if (surRetour({ canGoBack })) return;
          app.App.exitApp();
        });
      }
      if (typeof surReprise === "function") {
        app.App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) surReprise();
        });
      }
    } catch (e) {}
  }
}

/* L'ecran de lancement se retire QUAND L'APPLI EST PRETE, pas apres un delai
   fixe. Un splash qui disparait sur une minuterie laisse voir une page vide
   quand le reseau traine, ou s'attarde betement quand tout va vite.
   `launchAutoHide` reste a true dans capacitor.config.json comme filet : si
   ce code ne s'execute jamais, le splash part quand meme. */
export async function masquerSplash() {
  const m = await plugin("splash", () => import("@capacitor/splash-screen"));
  if (!m) return;
  try {
    await m.SplashScreen.hide({ fadeOutDuration: 200 });
  } catch (e) {}
}

/* ================= L'AVIS SUR L'APP STORE / LE PLAY STORE =================
   Julien, 16/09/2026 : « configure le truc de l'avis specialement pour l'App
   Store, ce sera sur ca l'appli ».

   ⚠️ JAMAIS SELON LA NOTE. Envoyer au Store seulement ceux qui ont mis 5
   etoiles est du « review gating », interdit par Apple (App Review Guidelines,
   section 3) et Google (In-App Review API) -- voir MOBILE.md, section 8. Donc :
   - dans l'appli installee, « Donner mon avis » mene TOUT LE MONDE au Store,
     sans question avant ;
   - la fenetre de note du systeme se propose seule apres un moment heureux
     (un echange reussi), au plus une fois tous les deux mois ;
   - au navigateur, rien ne change : la note reste interne a Noctify.

   APP_STORE_ID : l'identifiant numerique donne par App Store Connect a la
   creation de la fiche (« Apple ID » de l'appli, 10 chiffres). Tant qu'il est
   vide, iOS retombe sur la fenetre de note du systeme. */
export const APP_STORE_ID = "";
const PLAY_STORE_ID = "com.noctify.app"; // = appId de capacitor.config.json

function plateformeNative() {
  try {
    return window.Capacitor && typeof window.Capacitor.getPlatform === "function" ? window.Capacitor.getPlatform() : "web";
  } catch (e) {
    return "web";
  }
}

/** Le bouton « Donner mon avis » de l'appli installee. Rend false au navigateur. */
export async function ouvrirAvisStore() {
  if (!estNatif) return false;
  const plateforme = plateformeNative();
  // La page « Ecrire un avis » du Store : c'est ce qu'Apple recommande derriere
  // un bouton (la fenetre systeme, elle, peut ne rien afficher du tout).
  if (plateforme === "ios" && APP_STORE_ID) {
    window.location.href = "itms-apps://itunes.apple.com/app/id" + APP_STORE_ID + "?action=write-review";
    return true;
  }
  if (plateforme === "android") {
    window.location.href = "market://details?id=" + PLAY_STORE_ID;
    return true;
  }
  const m = await plugin("avis", () => import("@capacitor-community/in-app-review"));
  if (!m) return false;
  try {
    await m.InAppReview.requestReview();
    return true;
  } catch (e) {
    return false;
  }
}

const CLE_AVIS_AUTO = "vn_avis_store_propose";
const INTERVALLE_AVIS_AUTO_MS = 60 * 24 * 60 * 60 * 1000;

/** Apres un moment heureux : la fenetre de note du systeme, a tout le monde,
    au plus une fois tous les deux mois. Sans effet au navigateur. */
export async function proposerAvisStore() {
  if (!estNatif) return;
  try {
    const dernier = Number(localStorage.getItem(CLE_AVIS_AUTO) || 0);
    if (dernier && Date.now() - dernier < INTERVALLE_AVIS_AUTO_MS) return;
  } catch (e) {}
  const m = await plugin("avis", () => import("@capacitor-community/in-app-review"));
  if (!m) return;
  try {
    await m.InAppReview.requestReview();
    try { localStorage.setItem(CLE_AVIS_AUTO, String(Date.now())); } catch (e) {}
  } catch (e) {}
}

/* ================= LA COQUILLE, POSEE A L'IMPORT (29/09/2026) =================
   Julien : « elle doit se comporter comme une app native, pas comme un site ».
   Tout ce qui suit se pose TOUT SEUL des que la page importe ce fichier, et
   seulement dans l'appli installee : au navigateur, rien ne tourne.

   - pas de zoom (pincement, double tape, champ qui zoome au focus) ;
   - pas de rebond ni de « tirer pour rafraichir » de Safari ;
   - pas de loupe ni de menu « Copier » sur un appui long, pas de flash gris
     au toucher (le texte des champs reste selectionnable) ;
   - `/api/...` vise la prod : la page est servie par le telephone
     (capacitor://localhost), une URL relative ne menait nulle part ;
   - un lien vers un autre site sort de l'appli (ouvrirLien) ;
   - aucun service worker : Capacitor sert deja les fichiers depuis le
     telephone, un worker par-dessus ne garderait que des versions perimees ;
   - les liens de retour dans l'appli (connexions, Instagram) sont ecoutes. */

export const URL_PROD = "https://viralnight-koif.vercel.app";

function poserStyleNatif() {
  const html = document.documentElement;
  html.classList.add("natif");

  const vue = document.querySelector('meta[name="viewport"]');
  const contenu = "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover";
  if (vue) vue.setAttribute("content", contenu);

  const style = document.createElement("style");
  style.id = "style-natif";
  style.textContent = `
    html.natif, html.natif body {
      overscroll-behavior: none;
      -webkit-text-size-adjust: 100%;
      -webkit-tap-highlight-color: transparent;
      -webkit-touch-callout: none;
      -webkit-user-select: none;
      user-select: none;
      touch-action: manipulation;
    }
    html.natif input, html.natif textarea, html.natif select, html.natif [contenteditable="true"] {
      -webkit-user-select: text;
      user-select: text;
      -webkit-touch-callout: default;
    }
    html.natif img, html.natif a { -webkit-user-drag: none; }
  `;
  (document.head || html).appendChild(style);
}

function rerouterApi() {
  const fetchOrigine = window.fetch.bind(window);
  window.fetch = function (entree, options) {
    if (typeof entree === "string" && entree.startsWith("/api/")) entree = URL_PROD + entree;
    return fetchOrigine(entree, options);
  };
}

function estExterne(href) {
  try {
    const u = new URL(href, location.href);
    return (u.protocol === "http:" || u.protocol === "https:") && u.origin !== location.origin;
  } catch (e) {
    return false;
  }
}

function sortirLesLiens() {
  // Phase de capture : passe avant les gestionnaires de l'appli, qui
  // n'ont donc pas a connaitre la coquille.
  document.addEventListener(
    "click",
    (ev) => {
      if (ev.defaultPrevented) return;
      const a = ev.target && ev.target.closest ? ev.target.closest("a[href]") : null;
      if (!a || a.hasAttribute("download")) return;
      const href = a.getAttribute("href");
      if (!href || !estExterne(href)) return;
      ev.preventDefault();
      ouvrirLien(new URL(href, location.href).href);
    },
    true,
  );
  const ouvrirOrigine = window.open ? window.open.bind(window) : null;
  window.open = function (url, cible, options) {
    if (typeof url === "string" && estExterne(url)) {
      ouvrirLien(new URL(url, location.href).href);
      return null;
    }
    return ouvrirOrigine ? ouvrirOrigine(url, cible, options) : null;
  };
}

function couperServiceWorker() {
  const sw = navigator.serviceWorker;
  if (!sw) return;
  try {
    sw.getRegistrations().then((liste) => liste.forEach((r) => r.unregister())).catch(() => {});
    sw.register = () => Promise.reject(new Error("service worker inutile dans l'appli native"));
  } catch (e) {}
}

/* ================= LES LIENS DE RETOUR =================
   Chaque appli a son lien propre, = son identifiant (Info.plist) :
     com.noctify.app://...      l'appli clubbeur
     com.noctify.gerant://...   l'appli gerants
   - ://auth        fin d'une connexion Google / Apple (Supabase)
   - ://instagram   fin de la connexion Instagram d'un gerant (api/instagram.js)
   - ://diagnostic  controle de la coquille (voir diagnostic plus bas)
   - tout autre chemin : l'appli se rouvre avec la meme query et la meme ancre,
     comme l'aurait fait le lien web (ex. ?instagram=connecte). */

let clientAuth = null;
let identifiant = null;

/** L'identifiant de l'appli (com.noctify.app ou com.noctify.gerant), qui
    sert aussi de schema de retour. */
export async function identifiantAppli() {
  if (identifiant) return identifiant;
  const app = await plugin("app", () => import("@capacitor/app"));
  try {
    identifiant = app ? (await app.App.getInfo()).id : null;
  } catch (e) {}
  return identifiant;
}

/** L'appli confie son client Supabase : c'est lui qui recevra la session au
    retour d'une connexion Google / Apple. Sans effet au navigateur. */
export function brancherAuth(client) {
  if (estNatif && client) clientAuth = client;
}

async function fermerNavigateur() {
  const m = await plugin("browser", () => import("@capacitor/browser"));
  if (m) {
    try { await m.Browser.close(); } catch (e) {}
  }
}

async function terminerConnexion(url) {
  const client = clientAuth;
  const query = url.searchParams;
  const ancre = new URLSearchParams((url.hash || "").replace(/^#/, ""));
  const erreur = query.get("error_description") || ancre.get("error_description") || query.get("error") || ancre.get("error");
  if (erreur || !client) {
    console.warn("[natif] retour de connexion sans session", erreur || "client absent");
    window.dispatchEvent(new CustomEvent("noctify-connexion", { detail: { ok: false, erreur: erreur || "client" } }));
    return;
  }
  try {
    const code = query.get("code");
    let res;
    if (code) res = await client.auth.exchangeCodeForSession(code);
    else if (ancre.get("access_token") && ancre.get("refresh_token")) {
      res = await client.auth.setSession({ access_token: ancre.get("access_token"), refresh_token: ancre.get("refresh_token") });
    }
    const ok = !!(res && !res.error && res.data && res.data.session);
    window.dispatchEvent(new CustomEvent("noctify-connexion", { detail: { ok } }));
    /* On repart de zero, session posee : c'est exactement ce que fait le web
       au retour de Google (la page se recharge, getSession la trouve). Les
       deux applis savent deja reprendre un compte connecte au demarrage. */
    if (ok) location.replace("/");
  } catch (e) {
    console.warn("[natif] echange de session impossible", e);
    window.dispatchEvent(new CustomEvent("noctify-connexion", { detail: { ok: false, erreur: "echange" } }));
  }
}

async function suivreLienRetour(brut) {
  let url;
  try { url = new URL(brut); } catch (e) { return; }
  const id = await identifiantAppli();
  if (!id || url.protocol !== id.toLowerCase() + ":") return;
  const chemin = (url.host || url.pathname.replace(/^\/+/, "")).toLowerCase();
  await fermerNavigateur();
  if (chemin === "auth") return terminerConnexion(url);
  if (chemin === "diagnostic") return diagnostic(url);
  location.replace("/" + url.search + url.hash);
}

async function ecouterLiensRetour() {
  const app = await plugin("app", () => import("@capacitor/app"));
  if (!app) return;
  try {
    app.App.addListener("appUrlOpen", (e) => suivreLienRetour(e.url));
    // Appli fermee au moment du retour : iOS la lance AVEC le lien.
    const depart = await app.App.getLaunchUrl();
    if (depart && depart.url) suivreLienRetour(depart.url);
  } catch (e) {}
}


/* ================= CONNEXION GOOGLE / APPLE =================
   Au navigateur la page part chez Google et y revient. Dans l'appli elle ne
   doit PAS partir : la webview remplacerait l'appli par la page de Google
   (et Google refuse les connexions dans une webview embarquee). Apple exige
   une feuille Safari (SFSafariViewController) : on y ouvre la connexion, et
   Supabase renvoie a la fin sur com.noctify.xxx://auth, que l'appli attrape
   ci-dessus.

   ⚠️ Cote Supabase, ce lien doit figurer dans Authentication > URL
   Configuration > Redirect URLs, sinon Supabase renvoie sur le site.

   Rend { error } comme signInWithOAuth, pour que l'appelant garde son
   message d'erreur habituel. */
export async function connexionOAuth(client, fournisseur) {
  brancherAuth(client);
  const id = await identifiantAppli();
  const navigateur = await plugin("browser", () => import("@capacitor/browser"));
  if (!id || !navigateur) return { error: new Error("coquille native indisponible") };
  const { data, error } = await client.auth.signInWithOAuth({
    provider: fournisseur,
    options: { redirectTo: id + "://auth", skipBrowserRedirect: true },
  });
  if (error || !data || !data.url) return { error: error || new Error("URL de connexion absente") };
  try {
    await navigateur.Browser.open({ url: data.url });
    return { error: null };
  } catch (e) {
    return { error: e };
  }
}

/** Ouvre la page de connexion d'un service tiers (Instagram...) dans la
    feuille Safari. Son retour arrive par le lien de l'appli. */
export async function ouvrirConnexionTiers(url) {
  const navigateur = await plugin("browser", () => import("@capacitor/browser"));
  if (!navigateur) return false;
  try {
    await navigateur.Browser.open({ url });
    return true;
  } catch (e) {
    return false;
  }
}

/* ================= LES NOTIFICATIONS NATIVES =================
   Le Web Push n'existe pas dans l'appli native : iOS y passe par APNs. Le
   jeton de l'appareil est range dans push_subscriptions, comme un
   abonnement web, avec endpoint = "apns:<jeton>" (voir
   lib/notifications/apns.js, qui l'envoie).

   ⚠️ La permission n'est demandee qu'au clic, jamais au lancement : meme
   regle qu'au web, un refus est definitif. */

const CLE_JETON_PUSH = "vn_jeton_apns";

export function jetonPushConnu() {
  try { return localStorage.getItem(CLE_JETON_PUSH) || ""; } catch (e) { return ""; }
}

/** "granted" | "denied" | "prompt" -- sans jamais ouvrir de fenetre. */
export async function etatPush() {
  const m = await plugin("push", () => import("@capacitor/push-notifications"));
  if (!m) return undefined;
  try {
    const e = await m.PushNotifications.checkPermissions();
    return e.receive === "granted" ? "granted" : e.receive === "denied" ? "denied" : "prompt";
  } catch (e) {
    return "denied";
  }
}

/** Demande la permission et rend le jeton de l'appareil.
    { jeton } ou { erreur: "refus" | "echec" }. undefined au navigateur. */
export async function activerPush() {
  const m = await plugin("push", () => import("@capacitor/push-notifications"));
  if (!m) return undefined;
  const P = m.PushNotifications;
  try {
    let e = await P.checkPermissions();
    if (e.receive !== "granted" && e.receive !== "denied") e = await P.requestPermissions();
    if (e.receive !== "granted") return { erreur: "refus" };
  } catch (e) {
    return { erreur: "echec" };
  }
  return new Promise((resoudre) => {
    const ecoutes = [];
    const fin = (r) => {
      ecoutes.forEach((h) => Promise.resolve(h).then((x) => x && x.remove && x.remove()).catch(() => {}));
      resoudre(r);
    };
    const minuterie = setTimeout(() => fin({ erreur: "echec" }), 15000);
    ecoutes.push(P.addListener("registration", (t) => {
      clearTimeout(minuterie);
      try { localStorage.setItem(CLE_JETON_PUSH, t.value); } catch (e) {}
      fin({ jeton: t.value });
    }));
    ecoutes.push(P.addListener("registrationError", (err) => {
      clearTimeout(minuterie);
      console.warn("[natif] enregistrement APNs refuse", err && err.error);
      fin({ erreur: "echec" });
    }));
    P.register().catch(() => { clearTimeout(minuterie); fin({ erreur: "echec" }); });
  });
}

export async function desactiverPush() {
  const m = await plugin("push", () => import("@capacitor/push-notifications"));
  try { localStorage.removeItem(CLE_JETON_PUSH); } catch (e) {}
  if (!m) return;
  try { await m.PushNotifications.unregister(); } catch (e) {}
}

/* Toucher une notification ouvre l'appli sur le bon ecran : la charge porte
   l'URL web (ex. /app-preview.html#boutique), l'appli recoit son ancre par
   l'evenement noctify-notification. */
async function ecouterNotificationsTouchees() {
  const m = await plugin("push", () => import("@capacitor/push-notifications"));
  if (!m) return;
  try {
    m.PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      const donnees = (action && action.notification && action.notification.data) || {};
      const url = String(donnees.url || "");
      const ancre = url.includes("#") ? url.slice(url.indexOf("#")) : "";
      window.dispatchEvent(new CustomEvent("noctify-notification", { detail: { url, ancre } }));
    });
  } catch (e) {}
}

/* ================= LE DIAGNOSTIC =================
   com.noctify.app://diagnostic ecrit dans la console de l'appli (celle que
   lit Xcode, ou `xcrun simctl launch --console`) une ligne NOCTIFY-DIAG avec
   l'etat de la coquille. C'est ce qui a servi a verifier les applis dans le
   simulateur. Lecture seule : rien n'est ecrit en base, aucun compte touche. */
async function diagnostic(url) {
  const r = { appli: await identifiantAppli() };
  const html = document.documentElement;
  r.natif = html.classList.contains("natif");
  r.modeAppli = html.classList.contains("mode-appli");
  r.viewport = (document.querySelector('meta[name="viewport"]') || {}).content || "";
  r.rebond = getComputedStyle(html).overscrollBehaviorY || getComputedStyle(html).overscrollBehavior || "";
  r.selection = getComputedStyle(document.body).webkitUserSelect || getComputedStyle(document.body).userSelect || "";
  const sonde = document.createElement("div");
  sonde.style.cssText = "position:fixed;top:0;left:0;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)";
  document.body.appendChild(sonde);
  r.zoneSure = { haut: getComputedStyle(sonde).paddingTop, bas: getComputedStyle(sonde).paddingBottom };
  sonde.remove();
  r.serviceWorkers = navigator.serviceWorker ? (await navigator.serviceWorker.getRegistrations().catch(() => [])).length : "absent";
  r.largeur = window.innerWidth;
  r.origine = location.origin;
  r.push = await etatPush();
  const essai = async (chemin, options) => {
    try {
      return (await fetch(chemin, options)).status;
    } catch (e) {
      return "bloque:" + (e && e.message);
    }
  };
  // Appel reel de l'API depuis la coquille : un statut HTTP (meme 401) prouve
  // que le CORS laisse passer la reponse ; "bloque" prouve le contraire.
  r.apiClubbeur = await essai("/api/credit-clubbeur?action=parrainage", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  r.apiGerant = await essai("/api/instagram?action=status", { headers: { Authorization: "Bearer diagnostic" } });
  r.clientAuth = !!clientAuth;
  const fournisseur = url && url.searchParams.get("oauth");
  if (fournisseur && clientAuth) r.oauth = (await connexionOAuth(clientAuth, fournisseur)).error ? "echec" : "feuille-ouverte";
  if (url && url.searchParams.get("push") === "1") r.pushActive = await activerPush();
  console.log("NOCTIFY-DIAG " + JSON.stringify(r));
  return r;
}

async function demarrerCoque() {
  poserStyleNatif();
  rerouterApi();
  sortirLesLiens();
  couperServiceWorker();
  ecouterLiensRetour();
  ecouterNotificationsTouchees();
  const clavier = await plugin("keyboard", () => import("@capacitor/keyboard"));
  if (clavier) {
    try { await clavier.Keyboard.setAccessoryBarVisible({ isVisible: false }); } catch (e) {}
  }
}

if (estNatif) demarrerCoque();
