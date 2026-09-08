# Licences des polices

Les quatre polices embarquées dans ce dossier sont sous **SIL Open Font
License 1.1** (OFL). Cette licence autorise l'usage commercial,
l'hébergement sur notre propre domaine et l'intégration dans une
application, à une condition : distribuer la notice de copyright avec les
fichiers. C'est l'objet de ce fichier.

Le texte intégral de la licence est disponible à
<https://openfontlicense.org/open-font-license-official-text/>.

| Police | Fichiers | Copyright |
|---|---|---|
| **Inter** | `inter-latin.woff2`, `inter-latin-ext.woff2` | Copyright (c) 2016 The Inter Project Authors — <https://github.com/rsms/inter> |
| **Archivo** | `archivo-latin.woff2`, `archivo-latin-ext.woff2` | Copyright 2020 The Archivo Project Authors — <https://github.com/Omnibus-Type/Archivo> |
| **DM Mono** | `dm-mono-400-*.woff2`, `dm-mono-500-*.woff2` | Copyright 2020 The DM Mono Project Authors — <https://github.com/googlefonts/dm-mono> |
| **JetBrains Mono** | `jetbrains-mono-latin.woff2`, `jetbrains-mono-latin-ext.woff2` | Copyright 2020 The JetBrains Mono Project Authors — <https://github.com/JetBrains/JetBrainsMono> |

## Ce qui est permis, et ce qui ne l'est pas

L'OFL autorise l'utilisation, l'étude, la modification et la
redistribution, y compris commerciales. Elle interdit deux choses :

- **vendre les fichiers de police seuls** (les vendre intégrés à un
  produit est permis) ;
- **réutiliser le nom réservé de la police** pour une version modifiée.
  Si un jour une de ces polices est retouchée, la version modifiée devra
  porter un autre nom.

Aucune attribution visible n'est exigée dans l'interface.

## Sous-ensembles

Les fichiers ne portent que les caractères latin et latin-ext, découpés
par `unicode-range` dans `polices.css` : le navigateur ne télécharge que
ce dont la page a besoin. Archivo est une police variable — un seul
fichier couvre les graisses 600 à 800.

## Pourquoi elles sont ici et pas chez Google

Voir l'en-tête de `polices.css`. En résumé : servir une police depuis
`fonts.googleapis.com` transmet l'adresse IP du visiteur à Google sans
son consentement, ce qui a été jugé contraire au RGPD.
