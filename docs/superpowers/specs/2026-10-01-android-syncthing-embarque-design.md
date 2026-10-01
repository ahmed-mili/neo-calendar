# Android : Syncthing embarqué et notes en stockage privé

Rédigé le 2026-10-01, sous-projet 1 de « la synchro intégrée ». Conception
validée avec Ahmed section par section le même jour.

## 1. But et principes

N'importe quelle personne qui installe Neo Calendar sur son téléphone et son
PC doit pouvoir synchroniser ses notes **sans installer Syncthing ni
Syncthing-Fork**, nulle part. L'app n'est pas utilisée par Ahmed seul :
d'autres personnes l'ont installée, avec des dossiers et des méthodes de synchro
que l'on ne connaît pas.

Principe d'arbitrage, donné par Ahmed : **100 % fiable et sécurisé d'abord**.
Une simplification n'est retenue que si elle ne retire rien à la fiabilité ni à
la sécurité.

Règle permanente, donnée par Ahmed : **l'app doit toujours se lancer le plus
vite possible.** Conséquences pour ce sous-projet :

- le moteur ne démarre **jamais avant** que la grille soit affichée : il est
  lancé en arrière-plan une fois le premier écran rempli, et rien de
  l'affichage n'attend sa réponse (état « démarrage » sur la page
  Synchronisation en attendant) ;
- aucun travail de synchro (configuration, ports, vérification du binaire) sur
  le chemin du lancement ;
- le temps de lancement est **mesuré avant et après** (même protocole que la
  mesure du 2026-10-01 sur l'émulateur, processus froid) ; une régression
  bloque la livraison. La lecture par vrai chemin doit le rendre plus court
  qu'en 1.85.

### Découpage en quatre sous-projets

1. **Android : stockage privé + Syncthing embarqué** (ce document). Utile seul :
   un Syncthing embarqué s'appaire avec un Syncthing ordinaire, comme celui qui
   tourne aujourd'hui sur le PC d'Ahmed.
2. PC : Syncthing embarqué dans l'app Tauri (sidecar), avec la migration de qui
   a déjà un Syncthing sur le dossier de données.
3. Appairage simplifié entre deux Neo Calendar (sans montrer d'identifiant).
4. Résolution automatique des fichiers `.sync-conflict-*`
   (`2026-08-22-syncthing-integration-design.md`).

Chacun a sa spec, son plan et sa livraison.

### Faits qui contraignent la conception

- Ahmed garde Syncthing-Fork sur son téléphone pour ses coffres Obsidian : le
  Syncthing embarqué doit **cohabiter** avec une autre instance de Syncthing
  sur le même appareil.
- Le noyau lit et écrit les notes à travers `WorkspaceStorage` /
  `WritableWorkspaceStorage` (`core/workspace/WorkspaceStorage.kt`) ;
  `SafWorkspaceStorage` en est une implémentation. Le stockage privé en est une
  deuxième.
- Le chargement (`loadWorkspace`) ne filtre pas aujourd'hui les fichiers
  `*.sync-conflict-*` : ils s'afficheraient comme des évènements en double.
- Syncthing-Fork (dépôt `researchxxl/syncthing-android`, cloné dans
  `C:\dev\syncthing-android`) est la référence de comportement, relevée dans
  son code le 2026-10-01 (sections 4 et 5).

## 2. Où vivent les notes

### Premier lancement d'une nouvelle installation : aucune question

L'app crée le dossier `Neo Calendar` dans son **stockage privé**
(`filesDir/Neo Calendar`), y pose le marqueur (`.neo-calendar.json`) et s'ouvre
directement sur la grille. Aucune permission, aucun sélecteur.

Un dossier est reconnu comme dossier Neo Calendar s'il contient
`.neo-calendar.json` ou le sous-dossier `.neo-calendar/`.

### Mise à jour d'une installation existante : rien ne change

L'app reste sur le dossier SAF déjà choisi. Rien n'est copié, déplacé ni
demandé. La synchro intégrée se décide plus tard, dans les Réglages.

### Deux modes de stockage, exclusifs

| Mode | Notes | Moteur Syncthing |
|---|---|---|
| **Synchronisation intégrée** (recommandé) | stockage privé | tourne selon le mode de fonctionnement |
| **Dossier synchronisé par une autre app** | dossier SAF choisi | ne démarre jamais |

Jamais les deux à la fois sur une même copie des notes. Le stockage privé est
inaccessible aux autres apps : Syncthing-Fork ne peut pas le synchroniser,
l'exclusivité est garantie par Android.

Une nouvelle installation est en « Synchronisation intégrée » avec le moteur
**non configuré** : il ne démarre qu'une fois un appareil ajouté (section 6).
Tant qu'il n'y a aucun appareil, rien ne tourne et aucune notification
n'apparaît.

### Passer d'un dossier SAF à la synchronisation intégrée

Depuis la page Synchronisation :

1. Si le dossier SAF contient `.stfolder` (marqueur d'un dossier partagé par un
   Syncthing), l'app l'explique avant de continuer : ce dossier est encore
   partagé par une autre app Syncthing ; il faudra le retirer de cette app une
   fois la bascule faite, sinon le téléphone le synchroniserait deux fois.
2. Copie de tout le dossier (notes, `.neo-calendar.json`, `.neo-calendar/`,
   pièces jointes) dans un dossier privé **temporaire**, en excluant `.stfolder`,
   `.stversions`, `*.sync-conflict-*` et les temporaires `.syncthing.*.tmp`.
3. Vérification fichier par fichier : même liste, mêmes tailles, même SHA-256.
4. Seulement si tout concorde : renommage atomique du dossier temporaire en
   `Neo Calendar`, puis bascule du mode. Sinon : dossier temporaire supprimé,
   mode inchangé, message précis (quel fichier, quelle erreur).
5. Le dossier SAF d'origine n'est **jamais** modifié ni supprimé.

### Ouvrir un dossier existant / revenir à un dossier externe

- « Ouvrir un dossier existant » (Réglages) : sélecteur SAF ; le dossier n'est
  accepté que s'il porte le marqueur. Il passe l'app en mode « Dossier
  synchronisé par une autre app » et arrête le moteur.
- « Revenir à un dossier externe » : arrêt du moteur, puis copie vérifiée des
  notes privées vers un dossier choisi dans le sélecteur (même procédure que
  ci-dessus, en sens inverse). Le stockage privé est conservé jusqu'à ce que
  l'utilisateur le vide explicitement.

## 3. Lecture et écriture des notes

- **`FileWorkspaceStorage`** (noyau, `java.io.File`, testable en JUnit sans
  émulateur) implémente `WritableWorkspaceStorage` sur un vrai chemin.
- **Écriture atomique** : écrire dans un fichier temporaire du même dossier
  (nom commençant par `.neo-tmp-`, ignoré par Syncthing via `.stignore`), `fsync`,
  puis renommer sur le fichier cible. Syncthing ne voit jamais une note à moitié
  écrite.
- **Fichiers ignorés au chargement** (dans les deux modes) : `.stfolder`,
  `.stversions/`, `.stignore`, `.syncthing.*.tmp`, `.neo-tmp-*`,
  `*.sync-conflict-*`.
- **`.stignore`** du dossier : écrit par l'app, contient `.neo-tmp-*` et rien
  d'autre. Ce qui se synchronise aujourd'hui (y compris `.neo-calendar/`) se
  synchronise toujours : ce sous-projet ne change pas ce qui voyage.
- **Changements reçus** : quand le moteur signale qu'un fichier du dossier a
  été mis à jour par un autre appareil (évènements `ItemFinished` /
  `RemoteIndexUpdated` de l'API REST, regroupés sur 1 s), l'app relit le dossier
  comme après une écriture, puis reprogramme les rappels et met à jour le
  widget.
- La lecture par vrai chemin remplace SAF et rend le démarrage plus rapide ;
  aucun index séparé n'est ajouté dans ce sous-projet.

## 4. Le moteur

### Le binaire

- Syncthing est **compilé depuis ses sources** dans la CI, comme le fait
  Syncthing-Fork (`syncthing/build-syncthing.py`) : version épinglée (tag de
  release de `github.com/syncthing/syncthing`), `GOOS=android`,
  `CGO_ENABLED=1` avec le compilateur `clang` du NDK, `go run build.go -goos
  android -goarch <arch> -cc <clang> -no-upgrade build`,
  `EXTRA_LDFLAGS=-checklinkname=0`, construction reproductible
  (`SOURCE_DATE_EPOCH=0`).
  - Pourquoi pas le binaire Linux publié : compilé sans cgo, il résout les noms
    par `/etc/resolv.conf`, absent d'Android. Syncthing-Fork compile pour cette
    raison.
- Le tag est vérifié avant compilation : son commit doit correspondre à celui
  de la release signée de Syncthing (empreinte fixée dans le dépôt).
- Livré dans l'APK unique sous `jniLibs/<abi>/libsyncthingnative.so`, pour
  **`arm64-v8a` et `x86_64`**, avec `packaging.jniLibs.useLegacyPackaging =
  true` (le fichier est extrait à l'installation et exécutable depuis
  `nativeLibraryDir`, comme dans Syncthing-Fork).
- Monter de version Syncthing = changer le tag épinglé et son empreinte.

### Configuration

- Dossier d'état du moteur : `filesDir/syncthing/` (clé, certificat,
  `config.xml`, base d'index). Hors du dossier de notes, jamais synchronisé.
- Générée à la première mise en route, puis réglée par l'API REST :
  - `options.autoUpgradeIntervalH = 0` (l'app fixe la version) ;
  - `options.urAccepted = -1` (pas de statistiques d'usage) ;
  - `options.crashReportingEnabled = false` ;
  - découverte globale, découverte locale et relais publics **activés** (la
    synchro hors du même Wi-Fi en dépend ; tout est chiffré de bout en bout) ;
  - un seul dossier : les notes, `type = sendreceive`, surveillance des
    fichiers activée, **versionnage « corbeille »** (`trashcan`, 30 jours) : une
    note écrasée ou supprimée par une synchro reste récupérable dans
    `.stversions`.
- **Ports** : ceux de Syncthing par défaut peuvent être pris par Syncthing-Fork.
  À la première mise en route, l'app choisit un port d'écoute TCP/QUIC libre et
  le garde. La cohabitation de la **découverte locale** (UDP 21027) avec une
  autre instance sur le même téléphone est à vérifier (section 10) ; si les
  deux ne peuvent pas l'écouter ensemble, la nôtre s'en passe (la découverte
  globale et les adresses explicites suffisent).
- **Interface locale (REST)** : jamais accessible sans secret. Une autre app du
  téléphone peut joindre `127.0.0.1`.
  - Préféré : adresse de l'interface en socket Unix
    (`unix://` + chemin dans `filesDir/syncthing/`), inaccessible aux autres
    apps.
  - Sinon : `127.0.0.1` sur un port aléatoire, clé d'API aléatoire (32 octets)
    **et** identifiant + mot de passe aléatoires pour l'interface web, gardés
    dans le stockage privé.

### Supervision

- `SyncEngine` (Kotlin) lance le processus, attend que l'API réponde, lui parle,
  l'arrête proprement (`/rest/system/shutdown`, puis destruction du processus
  après 10 s).
- S'il s'arrête de lui-même : relance avec délai croissant (2 s, 4 s, 8 s… plafonné
  à 5 min), erreur affichée sur la page Synchronisation et dans la
  notification. Après 5 échecs de suite, plus de relance automatique jusqu'à
  une action de l'utilisateur.
- Sa sortie standard est gardée dans un journal tournant (1 Mo) du stockage
  privé, consultable et partageable depuis la page Synchronisation.

## 5. Quand le moteur tourne

### Deux modes

- **« Comme Syncthing-Fork »** (par défaut) : service au premier plan de type
  `specialUse` (comme Syncthing-Fork : il échappe à la limite de 6 h / 24 h
  qu'Android 15 impose au type `dataSync`), avec sa propriété
  `PROPERTY_SPECIAL_USE_FGS_SUBTYPE` et une notification permanente. Il démarre
  à l'ouverture de l'app et continue en arrière-plan jusqu'à « Quitter ».
  - **Démarrage automatique** (désactivé par défaut, comme dans
    Syncthing-Fork) : démarre aussi à l'allumage du téléphone
    (`RECEIVE_BOOT_COMPLETED`) ; « Quitter » disparaît alors.
- **« Seulement quand l'app est ouverte »** : pas de service ni de
  notification ; le moteur démarre avec l'app et s'arrête quand elle passe en
  arrière-plan, après avoir attendu (60 s au plus) que les modifications locales
  soient envoyées.

### Conditions de fonctionnement (version réduite de Syncthing-Fork)

S'appliquent aux deux modes ; le moteur est mis en pause quand une condition
n'est pas remplie, et l'état le dit.

| Condition | Par défaut (celui de Syncthing-Fork) |
|---|---|
| Sur Wi-Fi | oui |
| Sur Wi-Fi limité (compté) | non |
| Sur données mobiles | non |
| Source d'alimentation | secteur et batterie (ou secteur seul, ou batterie seule) |
| Respecter l'économiseur de batterie | oui |

Laissées de côté (ajoutables plus tard) : liste de SSID, itinérance, mode avion,
« Synchronisation auto des données », horaire.

## 6. La page Synchronisation

Elle remplace le dialogue d'information actuel (Réglages → Synchronisation).

- **Mode de stockage** : les deux modes exclusifs, avec les actions de la
  section 2.
- **État** (une ligne) : à jour ; synchro en cours (N fichiers) ; en pause
  (condition non remplie, laquelle) ; hors ligne ; erreur (message).
- **Cet appareil** : nom modifiable ; identifiant Syncthing en QR code, en texte
  et par « Partager ».
- **Appareils** : nom, connecté ou non, dernière connexion.
  - « Ajouter un appareil » : scanner un QR code (de préférence) ou coller un
    identifiant, validé par sa somme de contrôle Luhn avant toute requête.
  - **Demande entrante** : « <nom> veut se connecter », avec l'identifiant
    complet à comparer à celui affiché par l'autre appareil ; Accepter /
    Refuser. **Rien n'est jamais accepté automatiquement.**
  - Retirer un appareil (confirmation).
- **Dossier de notes** : partagé automatiquement avec chaque appareil accepté.
  Quand un appareil accepté **propose** un dossier (cas du Syncthing actuel
  d'un PC qui partage `C:\Neo Calendar`), l'app demande confirmation en disant
  ce qui va se passer (« vos N notes locales seront fusionnées avec celles du
  PC »), puis adopte l'identifiant de dossier proposé. Un seul dossier est
  synchronisé ; une deuxième proposition est refusée avec une explication.
- **Fonctionnement** : le mode, les conditions, « Démarrage automatique » et
  « Quitter » (mode Syncthing-Fork).
- **Conflits** : nombre de fichiers `*.sync-conflict-*` présents (lecture
  seule ; leur fusion est le sous-projet 4).
- **Journal du moteur** : afficher, partager.

## 7. Sécurité (récapitulatif)

- Aucun accès local au moteur sans secret (section 4).
- Communication entre appareils chiffrée (TLS), identité par certificat ;
  appareils acceptés seulement par l'utilisateur, après comparaison de
  l'identifiant ; dossier adopté seulement après confirmation.
- Binaire construit depuis un tag vérifié, de façon reproductible ; mise à jour
  automatique de Syncthing coupée.
- Statistiques d'usage et rapports de plantage coupés.
- Clés, certificat et secrets uniquement dans le stockage privé ; exclus des
  sauvegardes Android (`dataExtractionRules` / `fullBackupContent`), pour qu'une
  restauration sur un autre téléphone ne duplique pas l'identité de l'appareil.

## 8. Erreurs

| Situation | Comportement |
|---|---|
| Copie de bascule incomplète ou différente | rien ne bascule, dossier temporaire supprimé, message avec le fichier en cause |
| Moteur qui ne démarre pas / s'arrête | relances espacées, erreur visible, journal consultable |
| Port déjà pris | nouveau port libre choisi et gardé |
| Espace disque insuffisant | Syncthing met le dossier en erreur ; l'état l'affiche |
| Identifiant d'appareil invalide | refusé avant toute requête |
| Dossier proposé alors qu'un dossier est déjà synchronisé | refusé, avec explication |
| Fichier de conflit reçu | ignoré au chargement, compté sur la page |

## 9. Tests

- **JUnit (noyau)** : `FileWorkspaceStorage` (lecture, écriture atomique,
  renommage, suppression), filtres des fichiers ignorés, copie vérifiée de
  bascule (fichier manquant, contenu différent, réussite), validation Luhn d'un
  identifiant, choix d'un port libre.
- **Intégration en CI** : deux vrais Syncthing (binaires Linux de la même
  version) configurés par le même code de configuration que l'app : appairage,
  partage, une note qui fait l'aller-retour, une modification simultanée qui
  produit un `sync-conflict` ignoré au chargement.
- **Émulateur** : appairage avec un **second Syncthing de test lancé sur le PC
  dans un dossier temporaire**. Le Syncthing réel du PC d'Ahmed et ses données
  ne sont **jamais** touchés pendant les essais. Vérifier : première
  installation (dossier privé créé, grille), mise à jour depuis 1.85 (rien ne
  change), bascule vérifiée, synchro dans les deux sens, rappels reprogrammés
  après une note reçue, les deux modes, une condition (Wi-Fi coupé → pause),
  « Quitter », relance après arrêt forcé du processus.
- **Cohabitation** : sur l'émulateur, Syncthing-Fork installé et actif en même
  temps que l'app.
- **Temps de lancement** : à froid, dossier SAF (1.85) contre dossier privé
  avec moteur actif ; grille affichée au moins aussi vite, moteur prêt ensuite.

## 10. À vérifier avant d'écrire le plan

Chaque point se tranche par un essai, pas par une supposition :

1. L'interface REST en socket Unix fonctionne-t-elle sur Android, et le client
   HTTP de l'app sait-il s'y connecter ? Sinon : port aléatoire + secrets.
2. Deux instances sur le même téléphone peuvent-elles faire la découverte
   locale (UDP 21027) ? Sinon : la nôtre la désactive.
3. Taille réelle de `libsyncthingnative.so` pour `arm64-v8a` et `x86_64`, et
   taille de l'APK qui en résulte.
4. Temps de compilation de Syncthing dans la CI et mise en cache (Go, NDK,
   modules).
5. Version de Syncthing à épingler et version de Go qu'elle exige.

## Hors périmètre

Sous-projets 2 à 4 ; index des notes pour le démarrage ; suppression du plugin
Obsidian ; conditions de fonctionnement non reprises (section 5).
