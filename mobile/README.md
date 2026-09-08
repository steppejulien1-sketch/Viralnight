# `mobile/` — les pièces natives, préparées d'avance

Ce dossier ne fait rien tout seul. Il contient ce qui **ne peut pas être
généré sous Windows** mais qui peut être écrit à l'avance, pour que la
première session sur un Mac soit du copier-coller plutôt que de la
rédaction.

Le reste de la stratégie App Store est dans [`MOBILE.md`](../MOBILE.md).

---

## `PrivacyInfo.xcprivacy`

**Obligatoire depuis mai 2024.** Une soumission sans ce fichier est refusée
*au dépôt*, avant même la review — ce n'est pas un motif de rejet, c'est un
mur.

Où le poser : `ios/App/App/PrivacyInfo.xcprivacy`, puis cocher sa « Target
Membership » dans Xcode. Sans cette case, le fichier est dans le dépôt mais
pas dans le bundle, et le refus est le même.

Ce qu'il déclare, et pourquoi, est expliqué en commentaire dans le fichier.

---

## Chaînes d'usage des permissions

À ajouter dans `ios/App/App/Info.plist`. **Une chaîne absente fait planter
l'application** à la première demande — pas d'erreur, un crash. Une chaîne
vague fait rejeter : Apple veut savoir *à quoi ça sert ici*, pas *ce que
fait la permission*.

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>Pour afficher les clubs autour de toi et sélectionner le bon automatiquement. Ta position reste sur ton téléphone, elle ne nous est jamais envoyée.</string>

<key>NSCameraUsageDescription</key>
<string>Pour scanner le QR code affiché dans le club et créditer tes points.</string>

<key>NSPhotoLibraryUsageDescription</key>
<string>Pour choisir la capture de ton profil Instagram, qui permet au club de reconnaître qui a publié.</string>
```

La première dit la vérité et c'est un argument : la position ne quitte pas
l'appareil (voir `localiser()` dans `app-preview.html`). Un reviewer qui lit
ça n'a pas de question à poser.

Côté Android, ces permissions se déclarent dans
`android/app/src/main/AndroidManifest.xml` — `ACCESS_FINE_LOCATION`,
`CAMERA`, `POST_NOTIFICATIONS` (obligatoire depuis Android 13).

---

## Ce qui reste à faire, et où

| Tâche | Où | Windows ? |
|---|---|---|
| `npx cap add android` | ici | **oui** |
| `npx cap add ios` | sur un Mac | non |
| Poser `PrivacyInfo.xcprivacy` | Xcode | non |
| Chaînes de permission iOS | Xcode | non |
| Brancher les plugins natifs (push, QR, géoloc) | ici | **oui** — c'est le vrai travail, voir MOBILE.md §5 |
| Formulaire *Data safety* | Play Console | oui |
| *Privacy nutrition labels* | App Store Connect | oui |
| Classification d'âge (17+/18+) | les deux consoles | oui |
| Compte de démonstration pour le reviewer | à créer en base | oui |

**L'URL de suppression de compte que Play réclame existe déjà :**
`https://viralnight-koif.vercel.app/suppression-compte.html`. C'est le champ
« Account deletion URL » de la console, et elle supprime réellement —
pas seulement un formulaire de demande.
