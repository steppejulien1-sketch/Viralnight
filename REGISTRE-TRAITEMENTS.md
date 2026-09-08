# Registre des activités de traitement — Noctify

**Responsable de traitement :** Julien Steppe, personne physique
**Contact :** viralnight001@gmail.com
**Dernière mise à jour :** 8 septembre 2026

---

## À quoi sert ce document

L'article 30 du RGPD impose de tenir un registre des traitements. Il n'est
pas à publier : il est à **présenter à la CNIL si elle le demande**. C'est le
premier document qu'elle réclame en cas de contrôle ou de plainte.

La politique de confidentialité affirmait qu'il existait. Il n'existait pas.
Le voici, rempli à partir du code réel — pas d'un modèle générique.

> **Deux limites à connaître.** Ce registre décrit fidèlement ce que fait le
> code au 8 septembre 2026, mais il n'a pas été relu par un juriste. Et il
> devra être mis à jour à chaque nouveau traitement : une fonctionnalité qui
> collecte une donnée nouvelle est une ligne de plus ici.

---

## Vue d'ensemble

Deux bases Supabase distinctes, et c'est structurant : les clubbeurs et les
gérants ne sont pas dans le même projet, ce qui limite mécaniquement ce qu'un
club peut voir de ses clients.

| Base | Projet | Qui s'y trouve |
|---|---|---|
| Gérants | `mrukkexghpcqtwvwwcbe` | Établissements, propriétaires, récompenses, soumissions |
| Clubbeurs | `gcopwgmqjiufemapamek` | Comptes clients finals, points, bons, amis |

---

## T1 — Comptes clubbeurs

| | |
|---|---|
| **Finalité** | Permettre à une personne de cumuler des points sur plusieurs soirées et d'échanger des récompenses |
| **Base légale** | Exécution du contrat (art. 6.1.b) — les CGU acceptées à la création du compte |
| **Personnes** | Clients finals des établissements partenaires, 15 ans et plus |
| **Données** | Adresse e-mail ou identifiant OAuth (Google, Apple) ; pseudo Instagram ; capture de profil Instagram ; date de création |
| **Durée** | Vie du compte, puis effacement sous 30 jours après suppression |
| **Destinataires** | Supabase (hébergement, UE/Singapour) |
| **Transferts hors UE** | Oui — Supabase Inc., clauses contractuelles types |
| **Sécurité** | RLS activée ; mots de passe hachés (bcrypt, délégué à Supabase Auth) ; clés `service_role` uniquement côté serveur |

## T2 — Points, bons et historique

| | |
|---|---|
| **Finalité** | Attribuer, décompter et vérifier les points ; matérialiser les bons échangés |
| **Base légale** | Exécution du contrat (art. 6.1.b) |
| **Personnes** | Clubbeurs titulaires d'un compte |
| **Données** | Solde ; mouvements ; club d'affectation ; récompenses échangées ; date et heure |
| **Durée** | Vie du compte ; les écritures nécessaires à la comptabilité au-delà, sans lien d'identité |
| **Destinataires** | Supabase. **Les établissements ne reçoivent que des agrégats** — aucun nom, aucun profil |
| **Sécurité** | Calcul et vérification exclusivement côté serveur (fonctions SQL `submit_story`, `redeem_reward`, `daily_gift`) ; aucun montant décidé par le navigateur |

## T3 — Publications soumises et mesure d'audience

| | |
|---|---|
| **Finalité** | Vérifier qu'une publication mentionne bien l'établissement, et relever son nombre de vues pour créditer les points |
| **Base légale** | Exécution du contrat (art. 6.1.b) |
| **Personnes** | Clubbeurs ayant déclaré une publication |
| **Données** | URL de la publication ; plateforme ; statut de validation ; nombre de vues public ; horodatage |
| **Durée** | Vie du compte |
| **Destinataires** | Supabase ; API Instagram (Meta) en lecture seule pour les comptes liés |
| **Transferts hors UE** | Oui — Meta Platforms Ireland / Meta Inc. |
| **Sécurité** | Validation centralisée côté Noctify, jamais par l'établissement (un gérant qui validerait les contenus de ses clients serait juge et partie sur les points qu'il doit) |

## T4 — Identifiant d'appareil (anti-abus)

| | |
|---|---|
| **Finalité** | Limiter la création répétée de comptes pour percevoir plusieurs fois le cadeau de bienvenue |
| **Base légale** | Intérêt légitime (art. 6.1.f) — prévention de la fraude |
| **Personnes** | Toute personne ouvrant l'application clubbeur |
| **Données** | UUID aléatoire tiré par le navigateur (`vn_appareil`), stocké en `localStorage` |
| **Durée** | Jusqu'à effacement des données du navigateur |
| **Destinataires** | Supabase, à la seule fin du contrôle |
| **Balance des intérêts** | L'identifiant n'est rattaché à aucune identité, ne suit la navigation nulle part et n'est jamais transmis à un tiers. Le verrou principal reste physique : pas de bonus sans avoir scanné le QR d'un club sur place |

## T5 — Comptes gérants et établissements

| | |
|---|---|
| **Finalité** | Permettre à un établissement de gérer son barème, son catalogue, son QR et de suivre son activité |
| **Base légale** | Exécution du contrat (art. 6.1.b) |
| **Personnes** | Gérants et propriétaires d'établissements |
| **Données** | E-mail ; nom, ville, adresse, photos de l'établissement ; horaires ; barème ; catalogue |
| **Durée** | Vie du compte, puis 30 jours |
| **Destinataires** | Supabase ; Google Places API (import des horaires) |
| **Transferts hors UE** | Oui — Supabase, Google LLC (DPF UE–États-Unis) |
| **Sécurité** | `establishment_id` **toujours** redéduit du jeton de session via `requireEstablishment.js`, jamais lu dans le corps ou l'URL. Les routes `api/` utilisent `service_role`, qui contourne RLS — c'est ce contrôle qui tient la séparation entre clubs |

## T6 — Comptes Instagram des établissements

| | |
|---|---|
| **Finalité** | Lire les mentions reçues par le compte du club et son nombre d'abonnés, pour créditer automatiquement les clubbeurs |
| **Base légale** | Consentement du gérant (art. 6.1.a) — connexion explicite, révocable depuis les Réglages |
| **Personnes** | Établissements ayant lié leur compte |
| **Données** | Identifiant de compte Instagram ; jeton d'accès ; nombre d'abonnés ; mentions reçues |
| **Durée** | Jusqu'à déconnexion du compte |
| **Destinataires** | Meta |
| **Transferts hors UE** | Oui — Meta |
| **Sécurité** | Jetons stockés côté serveur uniquement. Portée limitée en lecture : aucune publication au nom du club, aucun accès aux messages |

## T7 — Notifications push

| | |
|---|---|
| **Finalité** | Prévenir un clubbeur qu'une story est validée, qu'un cadeau l'attend |
| **Base légale** | Consentement (art. 6.1.a) — permission système, révocable |
| **Personnes** | Clubbeurs ayant accepté |
| **Données** | Abonnement Web Push (endpoint et clés) |
| **Durée** | Jusqu'au refus ou à l'expiration de l'abonnement ; les abonnements morts sont purgés automatiquement |
| **Destinataires** | Services de push des navigateurs (Google, Mozilla, Apple) |

## T8 — Demandes de démonstration

| | |
|---|---|
| **Finalité** | Répondre à un établissement qui demande une démonstration |
| **Base légale** | Mesures précontractuelles (art. 6.1.b) |
| **Données** | Nom, établissement, e-mail, téléphone, message |
| **Durée** | 3 ans à compter du dernier contact (recommandation CNIL, prospection B2B) |
| **Destinataires** | Supabase ; Resend (envoi de la notification) |
| **Transferts hors UE** | Oui — Resend Inc., clauses contractuelles types |

## T9 — Prospection commerciale

| | |
|---|---|
| **Finalité** | Qualifier des établissements à démarcher |
| **Base légale** | Intérêt légitime (art. 6.1.f) — prospection B2B |
| **Personnes** | Établissements, données professionnelles publiques |
| **Données** | Nom, adresse, téléphone, note et avis publics (source : Google Places) |
| **Durée** | 3 ans sans contact |
| **Destinataires** | Supabase ; Google Places API ; OpenAI (qualification, sans donnée personnelle) |
| **⚠️ À vérifier** | Le démarchage B2B par e-mail suppose une information préalable et un droit d'opposition simple. À traiter avant le premier envoi de masse |

---

## Sous-traitants

| Prestataire | Pays | Rôle | Garantie |
|---|---|---|---|
| Vercel Inc. | États-Unis | Hébergement du site et des fonctions serverless | CCT |
| Supabase Inc. | UE / Singapour | Base de données, authentification, stockage | CCT |
| Meta Platforms | Irlande / États-Unis | API Instagram (lecture des mentions) | CCT |
| Google LLC | États-Unis | Places API, OAuth, fiche Maps | CCT + DPF |
| Apple Inc. | États-Unis | Sign in with Apple | CCT |
| OpenAI, L.L.C. | États-Unis | Analyses narratives (agrégats, aucune donnée personnelle) | CCT |
| Resend Inc. | États-Unis | E-mails transactionnels | CCT |
| MapTiler AG | Suisse | Fond de carte | Pays adéquat (décision du 26 juillet 2000) |

**Ce qui n'est PAS utilisé, et qui compte autant :** aucun outil de mesure
d'audience, aucun traceur publicitaire, aucun cookie tiers. Les polices sont
servies depuis le domaine. Vérifié le 8 septembre 2026 : aucune requête ne
sort du domaine au chargement d'une page.

---

## Droits des personnes

Exercice à `viralnight001@gmail.com`, réponse sous 30 jours.

| Droit | État |
|---|---|
| Accès, rectification | Sur demande par e-mail |
| **Effacement** | **Automatisé** — dans l'appli (Réglages) et sur le web (`/suppression-compte.html`) |
| Opposition, limitation | Sur demande |
| Portabilité | Sur demande, export manuel |
| Réclamation CNIL | Mentionnée dans la politique de confidentialité |

---

## Ce qui reste ouvert

| Point | Pourquoi ça compte |
|---|---|
| **Médiateur de la consommation** | Obligation pour tout professionnel vendant à des consommateurs (art. L616-1 conso) : en désigner un, l'adhésion est payante. Non fait — les CGU renvoient à la plateforme européenne ODR en attendant |
| **Analyse d'impact (AIPD)** | Probablement non requise (pas de profilage à effet juridique, pas de donnée sensible), mais à documenter pour pouvoir le démontrer |
| **Mentions légales** | Un éditeur agissant à titre professionnel doit publier son adresse (art. 6 III LCEN). Aujourd'hui absente |
| **Durées de conservation** | Écrites ici, pas encore appliquées automatiquement en base — aucune purge programmée |
| **Registre à tenir à jour** | Ce document date du jour où il a été écrit. Toute nouvelle collecte est une ligne de plus |
