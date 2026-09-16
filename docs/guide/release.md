# Publier une version

```powershell
npm run version:patch            # 1.37.0 → 1.37.1 : ça réparait, c'est réparé
npm run version:minor            # 1.37.1 → 1.38.0 : on peut faire quelque chose de neuf
npm run version:major            # 1.38.0 → 2.0.0  : quelque chose ne se fait plus pareil
npm run version:set -- 1.42.0    # le numéro exact, quand il le faut

git commit -am "Version 1.37.1"
git tag v1.37.1
git push origin main v1.37.1
```

L'alias `git ship` fait tout cela d'un coup : il commite le travail, monte la
version dans les dix fichiers, pose l'étiquette et pousse branche et étiquette
atomiquement en dernier.

```powershell
git ship "Ce que ça change"        # correctif : 1.56.0 → 1.56.1
git ship minor "Une nouveauté"     # 1.56.0 → 1.57.0
```

## Ce que dit le numéro

Les trois nombres répondent à « qu'est-ce que ça change pour moi ? », qui est
la seule question que l'on se pose devant une mise à jour.

| Nombre        | Ce qu'il annonce                                                                          |
| ------------- | ----------------------------------------------------------------------------------------- |
| **majeur**    | l'application devient autre chose : un format de note qui ne se relit plus, un réglage disparu, une habitude cassée. |
| **mineur**    | quelque chose de neuf que l'on ne pouvait pas faire. Rien ne casse.                        |
| **correctif** | rien de neuf : ce qui existait marche enfin comme il devait.                               |

Le dernier nombre ne servait qu'aux rustines d'urgence, si bien que toute
livraison — trois corrections comprises — montait le mineur. Une suite de
`1.x.0` ne distinguait plus la version qui répare de celle qui ajoute, alors
que c'est exactement ce qu'un numéro est là pour dire. Une livraison qui ne
fait que corriger monte donc maintenant le correctif.

L'étiquette déclenche la construction des deux paquets, de leurs métadonnées de
mise à jour et leur publication (`.github/workflows/release.yml`). Une branche
`release/vX.Y.Z` fait la même chose, pour le cas où l'on ne peut pousser que des
branches. Les deux applications sont reconstruites à chaque release stable afin
que les endpoints `latest.json` et `latest-android.json` désignent toujours des
artefacts cohérents de cette même version.

Avant de publier la première version automatique, suivez
[la checklist de publication](../PUBLICATION_CHECKLIST.md).

Rien d'autre à toucher à la main : `version:set` s'occupe des trois
`package.json` et de leurs lockfiles, de `tauri.conf.json`, de `Cargo.toml`, du
`Cargo.lock`, du `versionName` Android et du `versionCode` — ce dernier
strictement croissant, faute de quoi le téléphone refuse la mise à jour.
