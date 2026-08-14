# Neo Calendar Desktop

Ce dépôt contient désormais l'application autonome Neo Calendar.

## Installer

Les deux paquets sont publiés sur la page
[Releases](https://github.com/ahmed-mili/neo-calendar/releases) du dépôt :
prenez la dernière version, en haut.

- **PC** : `Neo-Calendar-Setup-<version>.exe`. Windows affiche un avertissement
  SmartScreen — l'installateur n'est pas signé — : « Informations
  complémentaires », puis « Exécuter quand même ».
- **Android** : `neo-calendar-android-<version>.apk`. Téléchargez-le depuis le
  téléphone ; Android demande d'autoriser l'installation depuis cette
  source-là, une seule fois.

### Une désinstallation à faire une fois, en venant d'une version antérieure à 1.0.3

Android n'accepte une mise à jour que si elle porte la même signature que la
version déjà installée. Jusqu'à la 1.0.2, chaque machine signait avec sa propre
clé de débogage — celle du PC, puis celle, jetable, du serveur de build — et le
téléphone refusait : « le package est en conflit avec un package déjà présent ».

Depuis la 1.0.3, tous les APK stables portent la même identité de signature.
Sa clé privée et ses mots de passe vivent maintenant hors du dépôt et sont
injectés dans la CI par GitHub Actions Secrets. Pour passer d'une version
antérieure, une seule fois : **désinstallez l'application, puis installez le
nouvel APK**. Les versions suivantes s'installeront par-dessus, sans rien perdre.

## Mises à jour automatiques

Après installation d'une version qui contient le nouvel updater :

- **Windows** vérifie la release stable au démarrage, contrôle sa signature
  Tauri, installe l'update en mode passif, puis redémarre l'application.
- **Android** vérifie la release stable, contrôle le SHA-256, le nom du paquet,
  le `versionCode` et le certificat de l'APK, puis ouvre l'installateur système.
  Android demandera une fois l'autorisation d'installer depuis Neo Calendar.

Les versions plus anciennes ne peuvent pas acquérir ce code toutes seules : la
première version compatible devra encore être installée manuellement. La
signature Tauri protège l'update, mais ne remplace pas une signature de code
Windows reconnue ; SmartScreen peut donc continuer d'afficher son avertissement.

## Publier une version

```powershell
npm run version:patch            # 1.37.0 → 1.37.1 : ça réparait, c'est réparé
npm run version:minor            # 1.37.1 → 1.38.0 : on peut faire quelque chose de neuf
npm run version:major            # 1.38.0 → 2.0.0  : quelque chose ne se fait plus pareil
npm run version:set -- 1.42.0    # le numéro exact, quand il le faut

git commit -am "Version 1.37.1"
git tag v1.37.1
git push origin main v1.37.1
```

### Ce que dit le numéro

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

Avant de rendre le dépôt public ou de publier la première version automatique,
suivez [la checklist de publication](docs/PUBLICATION_CHECKLIST.md).

Rien d'autre à toucher à la main : `version:set` s'occupe des trois
`package.json` et de leurs lockfiles, de `tauri.conf.json`, de `Cargo.toml`, du
`Cargo.lock`, du `versionName` Android et du `versionCode` — ce dernier
strictement croissant, faute de quoi le téléphone refuse la mise à jour.

## Structure

- `apps/windows/` : application React/Vite et backend Tauri/Rust.
- `src/ui/calendar/` : interface calendrier partagée.
- `src/core/` : moteur des événements.
- `src/calendars/` : formats et parseurs de calendriers.
- `src/types/` : types partagés.

Le dépôt historique `obsidian-neo-calendar` reste inchangé. Cette première
migration effectue la séparation physique sans réécrire immédiatement tous
les composants partagés qui utilisent encore le shim de compatibilité
Obsidian.

## Ajouter un fond d'écran

```powershell
# 1. déposer le JPEG en pleine résolution
copy ma-photo.jpg apps\windows\public\themes\neo-wallpapers\montagne-bleue.jpg
# 2. fabriquer la vignette, l'empreinte et l'entrée du manifeste
npm run wallpapers
# 3. coller dans apps/windows/src/themes/wallpapers.ts le bloc que la commande
#    a imprimé (elle ne devine ni le libellé ni la description), puis committer
```

L'image n'entre pas dans l'APK : elle est lue sur `raw.githubusercontent.com`
et n'est donc disponible qu'une fois le commit poussé — mais elle l'est
aussitôt, sans attendre une version. Seules la vignette (23 Ko) et le
manifeste voyagent avec l'application, ce qui laisse le sélecteur s'ouvrir
hors ligne ; la pleine résolution est téléchargée quand quelqu'un choisit ce
fond, puis gardée dans `.neo-calendar/wallpapers/` du dossier de données —
où elle survit aux mises à jour et à une désinstallation.

`npm run wallpapers` est idempotent : il ne refabrique une vignette que si
elle manque ou si l'original a changé.

## Commandes

```powershell
cd neo-calendar
npm install        # sans drapeau : le conflit fast-check est réglé par overrides
npm test           # 500+ tests, la suite complète
npm run dev
npm run tauri      # installateur PC, copié dans Downloads
.\BUILD_ANDROID.ps1  # APK signé avec le coffre local hors dépôt
```

Le chemin du SDK Android (`local.properties`) n'est plus versionné : Android
Studio l'écrit, `BUILD_ANDROID.ps1` le rédige s'il manque, et le serveur de
build se contente d'`ANDROID_HOME`.
