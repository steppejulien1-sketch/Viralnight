/* Service worker de l'appli clubbeur.

   Ecrit petit et mefiant EXPRES. Le projet a deja perdu du temps sur du
   cache : le CDN Vercel servait un HTML vieux de quelques minutes et
   Julien voyait la version precedente apres un push (voir CLAUDE.md,
   "Pieges connus"). Un service worker mal reglé fait la meme chose, mais
   en pire : il survit au rechargement, au vidage du cache du navigateur,
   et il n'y a pas de bouton evident pour s'en debarrasser.

   D'ou les regles, dans l'ordre :

   1. Le HTML n'est JAMAIS servi depuis le cache tant que le reseau
      repond. Une seule page est gardee en secours hors ligne :
      /app-preview.html. Toutes les autres navigations (landing,
      dashboard, admin) passent en direct, comme si ce fichier
      n'existait pas -- leur comportement ne doit pas changer parce
      qu'un clubbeur a installe l'appli.

   2. Seuls /assets/ et /icones/ sont mis en cache pour de bon. Les
      fichiers de /assets/ portent un hash dans leur nom : une nouvelle
      version a une nouvelle URL, donc l'ancienne entree ne peut pas
      masquer la nouvelle.

   3. Rien d'autre n'est touche. Supabase, les tuiles de carte, les
      routes /api passent en direct.

   4. En developpement (127.0.0.1) le worker s'efface tout seul : les
      URL de modules de Vite ne sont pas stables, les mettre en cache
      rendrait le rechargement a chaud incoherent.

   Pour changer ce qui est garde, incrementer CACHE : l'ancien est
   supprime a l'activation.
*/

var CACHE = "noctify-v1";
var PAGE_APPLI = "/app-preview.html";

self.addEventListener("install", function () {
  // Pas d'attente : la version qui vient d'etre installee prend la main
  // tout de suite. Sans ca, une correction ne serait visible qu'apres
  // avoir ferme TOUS les onglets de l'appli -- exactement le genre de
  // "ca ne se met pas a jour" deja vu sur ce projet.
  self.skipWaiting();
});

self.addEventListener("activate", function (evenement) {
  evenement.waitUntil(
    caches
      .keys()
      .then(function (noms) {
        return Promise.all(
          noms.map(function (nom) {
            return nom === CACHE ? null : caches.delete(nom);
          })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

function enDeveloppement(url) {
  return url.hostname === "127.0.0.1" || url.hostname === "localhost";
}

self.addEventListener("fetch", function (evenement) {
  var requete = evenement.request;
  if (requete.method !== "GET") return;

  var url = new URL(requete.url);
  if (url.origin !== self.location.origin) return; // Supabase, tuiles, CDN
  if (enDeveloppement(url)) return;
  if (url.pathname.indexOf("/api/") === 0) return;

  // --- Navigations : le reseau d'abord, toujours.
  if (requete.mode === "navigate") {
    if (url.pathname !== PAGE_APPLI) return; // les autres pages : rien du tout
    evenement.respondWith(
      fetch(requete)
        .then(function (reponse) {
          var copie = reponse.clone();
          caches.open(CACHE).then(function (c) {
            c.put(PAGE_APPLI, copie);
          });
          return reponse;
        })
        .catch(function () {
          // Hors ligne seulement. Un club en sous-sol capte mal : mieux
          // vaut la derniere version connue qu'un dinosaure.
          return caches.match(PAGE_APPLI);
        })
    );
    return;
  }

  // --- Fichiers a nom stable : le cache d'abord, c'est sans risque.
  var permanent =
    url.pathname.indexOf("/assets/") === 0 || url.pathname.indexOf("/icones/") === 0;
  if (!permanent) return;

  evenement.respondWith(
    caches.match(requete).then(function (enCache) {
      if (enCache) return enCache;
      return fetch(requete).then(function (reponse) {
        // On ne garde que les reponses completes : une 206 (partielle)
        // ou une opaque remise telle quelle plus tard casserait l'appli.
        if (reponse && reponse.status === 200 && reponse.type === "basic") {
          var copie = reponse.clone();
          caches.open(CACHE).then(function (c) {
            c.put(requete, copie);
          });
        }
        return reponse;
      });
    })
  );
});

/* ============================================================
   NOTIFICATIONS PUSH

   Le contenu arrive chiffre : le service de push (Google, Apple,
   Mozilla) transporte l'enveloppe sans pouvoir la lire, et c'est le
   navigateur qui la dechiffre avant de nous la passer ici. On ne
   recoit donc jamais que du texte deja pret a afficher.

   Le texte est fabrique cote serveur par lib/notifications/push.js.
   Ce fichier ne decide de rien : il affiche.
   ============================================================ */

self.addEventListener("push", function (evenement) {
  // ⚠️ Il FAUT afficher une notification a chaque push recu. Un push
  // silencieux est compte comme un abus par Chrome et Firefox, qui
  // finissent par revoquer la permission de tout le site. D'ou le
  // repli plus bas plutot qu'un `return` quand la charge est illisible.
  var contenu = {};
  try {
    contenu = evenement.data ? evenement.data.json() : {};
  } catch (e) {
    contenu = {};
  }

  var titre = contenu.titre || "Noctify";
  var options = {
    body: contenu.corps || "Ouvre l'appli pour voir ce qui a changé.",
    icon: "/icones/icone-192.png",
    // Silhouette monochrome affichee dans la barre d'etat Android. Une
    // icone en couleur y apparait comme une tache grise informe.
    badge: "/icones/badge-96.png",
    // Meme tag = la nouvelle notification remplace la precedente. Sans
    // lui, trois stories validees d'affilee donnent trois lignes.
    tag: contenu.tag || "noctify",
    // ... mais on veut quand meme que le telephone vibre pour la
    // remplacante, sinon un remplacement passe totalement inapercu.
    renotify: Boolean(contenu.tag),
    data: { url: contenu.url || "/app-preview.html" },
  };

  evenement.waitUntil(self.registration.showNotification(titre, options));
});

self.addEventListener("notificationclick", function (evenement) {
  evenement.notification.close();
  var cible = (evenement.notification.data && evenement.notification.data.url) || "/app-preview.html";

  evenement.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(function (fenetres) {
        // Si l'appli est deja ouverte, on la remet devant au lieu d'en
        // ouvrir une seconde. Deux instances de l'appli, c'est deux
        // cartes MapLibre et deux sessions Supabase pour rien.
        for (var i = 0; i < fenetres.length; i++) {
          var f = fenetres[i];
          if (f.url.indexOf("/app-preview.html") !== -1 && "focus" in f) {
            if ("navigate" in f && cible) f.navigate(cible).catch(function () {});
            return f.focus();
          }
        }
        if (self.clients.openWindow) return self.clients.openWindow(cible);
      })
  );
});
