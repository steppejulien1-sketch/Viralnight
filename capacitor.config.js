/* Configuration Capacitor des DEUX applis iOS de Noctify (29/09/2026).

   - l'appli clubbeur  (app-preview.html) -> com.noctify.app,    projet ios/
   - l'appli gerants   (club-app.html)    -> com.noctify.gerant, projet ios-gerant/

   Un seul fichier pour les deux : la variable NOCTIFY_APPLI choisit laquelle.
   On ne la pose jamais a la main, les scripts npm le font :
     npm run ios:sync           (clubbeur)
     npm run ios:sync:gerant    (gerants)

   ⚠️ EXPORTS NOMMES, PAS `export default`. Le CLI de Capacitor lit ce fichier
   avec require() et ne va pas chercher `.default` pour un .js. Sous Node 22+
   require() d'un module ESM rend ses exports nommes : c'est ce qu'il lit.

   ⚠️ AUCUNE CLE ICI. Ce fichier est dans git. Les cles publiques Supabase
   entrent dans le bundle par les variables VITE_* au moment du build. */

const gerant = process.env.NOCTIFY_APPLI === "gerant";

export const appId = gerant ? "com.noctify.gerant" : "com.noctify.app";
export const appName = gerant ? "Noctify Gérant" : "Noctify";
export const webDir = gerant ? "dist-gerant" : "dist-mobile";

export const ios = {
  path: gerant ? "ios-gerant" : "ios",
  /* "never" : la page occupe tout l'ecran, sous l'heure et la batterie, et
     c'est le CSS qui se decale avec env(safe-area-inset-*) -- les deux applis
     le font deja pour la PWA installee. "always" decalait la vue entiere :
     les photos pleine largeur ne montaient plus sous la barre d'etat et la
     barre d'onglets flottait au-dessus d'une bande vide. */
  contentInset: "never",
  // Un appui long sur un lien n'ouvre pas l'apercu de Safari.
  allowsLinkPreview: false,
  backgroundColor: "#ffffff",
  /* ⚠️ PAS de `scheme` ici : ce reglage change l'ORIGINE de la page
     (capacitor://localhost), pas le lien de retour des connexions. Le
     changer casserait la liste blanche CORS d'api/ et viderait le stockage.
     Le lien de retour (com.noctify.app://...) est declare dans Info.plist. */
};

export const plugins = {
  SplashScreen: {
    // Filet de securite : l'appli retire l'ecran de lancement elle-meme des
    // qu'elle est prete (natif.masquerSplash). S'il ne l'est jamais, il part
    // quand meme au bout de 3 s.
    launchShowDuration: 3000,
    launchAutoHide: true,
    backgroundColor: "#ffffffff",
    showSpinner: false,
    iosSpinnerStyle: "small",
  },
  StatusBar: {
    // Texte sombre : les deux applis sont claires sous la barre d'etat.
    style: "LIGHT",
    overlaysWebView: true,
  },
  Keyboard: {
    // Le clavier pousse la page au lieu de la recouvrir. La barre « < > OK »
    // qui trahit une page web est retiree au demarrage (natif.js).
    resize: "native",
    resizeOnFullScreen: true,
  },
  PushNotifications: {
    presentationOptions: ["badge", "sound", "alert"],
  },
};
