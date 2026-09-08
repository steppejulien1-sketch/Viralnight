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

   ⚠️ CE QUI N'EST PAS ICI : les notifications push natives. Elles exigent un
   compte Apple Developer et une cle APNs que Julien n'a pas encore, ET un
   chemin d'envoi serveur different du Web Push actuel (lib/notifications/
   envoyer.js parle VAPID, pas APNs). A moitie branchees, elles pourriraient.
   Le Web Push existant continue de marcher au navigateur et en PWA Android.
   Voir MOBILE.md.
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
export async function scannerQr() {
  const m = await plugin("scanner", () => import("@capacitor/barcode-scanner"));
  if (!m) return undefined;
  try {
    const res = await m.CapacitorBarcodeScanner.scanBarcode({
      hint: m.CapacitorBarcodeScannerTypeHint.QR_CODE,
      scanInstructions: "Vise le QR code affiché dans le club",
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
      enableHighAccuracy: false, // le club le plus proche, pas la place de parking
      timeout: (options && options.timeout) || 8000,
      maximumAge: (options && options.maximumAge) || 600000,
    });
    return { coords: { latitude: p.coords.latitude, longitude: p.coords.longitude } };
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
   Un lien http ouvert par window.open sort de l'appli et n'y revient pas
   toujours. Le navigateur in-app garde le contexte : on lit, on ferme, on
   est encore dans Noctify.

   Ne concerne PAS les liens `instagram://` et `tiktok://`, qui doivent bien
   quitter l'appli pour ouvrir la leur -- ils continuent de passer par
   location.href. */
export async function ouvrirLien(url) {
  const m = await plugin("browser", () => import("@capacitor/browser"));
  if (!m) return false;
  try {
    await m.Browser.open({ url, presentationStyle: "popover" });
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
      await barre.StatusBar.setOverlaysWebView({ overlay: false });
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
