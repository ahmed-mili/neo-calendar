# PC : Syncthing intégré et appairage par QR code (parties 2 et 3)

Rédigé le 2026-10-02 à la demande d'Ahmed (« implémente la synchro intégrée sur
l'app PC, c'est urgent »). Suite de
`2026-10-01-android-syncthing-embarque-design.md` (partie 1, livrée en 1.86 /
1.87), dont les principes s'appliquent tels quels : fiabilité et sécurité
d'abord, rien d'accepté tout seul, jamais deux synchros sur une même copie des
notes, lancement de l'app non ralenti, d'autres personnes ont l'app.

## 1. Décisions d'Ahmed

- **Synchro intégrée à l'app PC, préférée à un Syncthing installé à part** :
  la page de son Syncthing ne garde que ce qui n'est pas Neo Calendar.
- **Un PC qui a déjà Syncthing** : l'app reprend seulement le dossier Neo
  Calendar avec son propre moteur ; le Syncthing existant garde le reste
  (coffres Obsidian). Jamais les deux sur le dossier Neo Calendar.
- **Fonctionnement « comme le .exe de Syncthing »** : le moteur tourne en
  permanence, sans économie d'énergie ; il démarre avec Windows, reste actif
  quand la fenêtre est fermée (icône dans la zone de notification avec
  « Ouvrir » et « Quitter »), et ne s'arrête qu'à « Quitter ».
- **Partie 3, appairage simple** : relier le téléphone au PC en scannant un QR
  code, sans jamais voir d'identifiant.

## 2. Le moteur sur PC

- **Binaire officiel** Syncthing pour Windows (`syncthing-windows-amd64`, même
  version que l'Android, v2.1.5), embarqué comme sidecar Tauri
  (`bundle.externalBin`). Vérifié au build : SHA-256 de l'archive et signature
  GPG de `sha256sum.txt.asc` avec l'empreinte épinglée
  `FBA2 E162 F2F4 4657 B38F 0309 E566 5F9B D597 0C47` (même clé et même
  méthode que l'Android ; tout écart fait échouer le build).
- **Dossier d'état** : dans le dossier de données de l'app
  (`%LOCALAPPDATA%\<identifiant de l'app>\syncthing\`), jamais dans le dossier
  de notes, jamais synchronisé. Clé et certificat propres à ce moteur.
- **Dossier synchronisé** : le dossier de données choisi dans l'app (par
  exemple `C:\Neo Calendar`), directement : le PC donne un vrai chemin, aucune
  copie n'est nécessaire.
- **Interface REST** : `127.0.0.1` sur un port tiré au hasard et gardé (ou un
  canal nommé si Syncthing le permet sous Windows : à vérifier), clé d'API
  aléatoire tenue en mémoire et passée par l'environnement (`STGUIAPIKEY`,
  `STGUIADDRESS`), interface web protégée (identifiant + mot de passe
  aléatoires) puisque d'autres programmes du PC peuvent joindre `127.0.0.1`.
- **Réglages imposés** (mêmes que l'Android) : `autoUpgradeIntervalH = 0`,
  `urAccepted = -1`, `crashReportingEnabled = false`, découverte globale et
  relais activés, `localAnnounceEnabled` : à décider par essai (un Syncthing
  installé à côté écoute déjà l'UDP 21027) ; port d'écoute libre choisi et
  gardé ; un seul dossier `sendreceive`, surveillance des fichiers, versionnage
  `trashcan` 30 jours ; `introducer = false`, `autoAcceptFolders = false` ;
  configuration écrite avant le premier `serve` ; `STNORESTART=1`.
- **Supervision** (Rust, côté Tauri) : lancement, relances espacées (2, 4, 8,
  16 s, abandon après 5 échecs jusqu'à une action), arrêt propre
  (`/rest/system/shutdown` puis fin du processus), nettoyage d'un moteur resté
  d'un lancement précédent (même dossier d'état), journal tournant.
- **Cycle de vie « comme le .exe »** : démarrage de l'app avec Windows
  (`tauri-plugin-autostart`, déjà présent), activé par défaut quand la synchro
  intégrée est active ; fermer la fenêtre la masque (icône de zone de
  notification) sans arrêter le moteur ; « Quitter » arrête le moteur puis
  l'app. Une seule instance (`tauri-plugin-single-instance`, déjà présent).
- **Lancement** : le moteur démarre après le premier écran de l'app, hors du
  fil de l'interface ; l'ouverture de l'app reste aussi rapide qu'aujourd'hui.

## 3. Passage en douceur depuis un Syncthing installé

- **Détection** : le dossier de données contient `.stfolder`, et un Syncthing
  installé est trouvé (configuration `%LOCALAPPDATA%\Syncthing\config.xml`,
  processus `syncthing.exe` actif) et partage ce dossier.
- **Proposition** (page Synchronisation, jamais automatique) : « Le dossier de
  Neo Calendar est actuellement synchronisé par Syncthing x.y. Le reprendre
  dans Neo Calendar ? Vos autres partages restent dans Syncthing. »
- **Reprise, après confirmation** :
  1. sauvegarde de la configuration du Syncthing installé ;
  2. retrait du seul dossier Neo Calendar de ce Syncthing, par son API locale
     (clé lue dans sa configuration, même utilisateur Windows) ; ses autres
     dossiers et appareils ne sont pas touchés ;
  3. le moteur de l'app prend le dossier (même identifiant de dossier que
     l'ancien partage, pour que les autres appareils le reconnaissent) ;
  4. la liste des appareils qui partageaient ce dossier est reprise et
     proposée : chacun doit accepter le nouvel appareil de son côté (le
     téléphone avec Neo Calendar : par QR code, partie 3 ; un autre Syncthing :
     l'app explique quoi accepter).
- **Retour en arrière** : « Rendre le dossier à Syncthing » arrête le moteur de
  l'app et remet le dossier dans le Syncthing installé depuis la sauvegarde.
- **Exclusivité** : tant que le Syncthing installé partage le dossier, le
  moteur de l'app ne démarre pas sur lui (même règle que l'Android).

## 4. Page Synchronisation du PC

Remplace la page actuelle (simple liste de méthodes). Même logique que la page
Android et la refonte demandée par Ahmed (une phrase claire, pas de pavé) :

- « Le dossier de Neo Calendar est synchronisé par Neo Calendar (Syncthing
  intégré v2.1.5) » ou « par Syncthing x.y installé sur ce PC » (avec la
  proposition de reprise) ;
- état en une ligne ; appareils (nom, connecté, dernière connexion) ;
  « Ajouter le téléphone » (partie 3) ; demandes entrantes à accepter ;
  démarrage avec Windows ; journal ; logo Syncthing et « En savoir plus »
  (https://syncthing.net) en bas.

## 5. Partie 3 : appairage par QR code

- **Sur le PC** : « Ajouter le téléphone » affiche un QR code qui contient
  l'identifiant de l'appareil PC et un **code d'appairage à usage unique**
  (aléatoire, valable 5 minutes).
- **Sur le téléphone** (page Synchronisation de Neo Calendar) : « Scanner le
  QR code du PC » ouvre la caméra ; le scan ajoute le PC comme appareil et
  annonce au PC le code d'appairage (dans le nom d'appareil présenté au PC
  pendant l'appairage, ou autre canal à choisir à la conception détaillée).
  Le scan vaut consentement côté téléphone.
- **Sur le PC** : pendant les 5 minutes, la demande entrante dont le code
  correspond est acceptée sans question (l'utilisateur vient de montrer le QR
  à son téléphone) ; toute autre demande reste à accepter à la main.
- **Partage** : le PC partage le dossier Neo Calendar avec le téléphone ; le
  téléphone l'adopte (confirmation seulement s'il a déjà des notes locales qui
  seraient fusionnées).
- Jamais d'identifiant affiché pendant ce parcours ; l'identifiant complet
  reste consultable dans « Détails » pour qui le veut.

## 6. Tests

- Rust / TypeScript : supervision (relances, abandon), configuration imposée,
  détection d'un Syncthing installé et retrait du seul dossier Neo Calendar
  (sur une configuration de test), code d'appairage (validité, expiration,
  usage unique), acceptation seulement du bon code.
- Intégration : le moteur PC et un second moteur de test s'appairent et
  synchronisent une note (même principe que le test à deux moteurs Android).
- Réel : sur le PC d'Ahmed (avec sa sauvegarde de configuration) et son
  téléphone : reprise du dossier depuis son Syncthing installé, appairage par
  QR code, synchro dans les deux sens, Laptop toujours synchronisé, coffres
  Obsidian intacts dans son Syncthing.

## Hors périmètre

Résolution automatique des conflits (partie 4) ; Linux et macOS ;
page Synchronisation Android refaite (chantier séparé déjà noté, mais le
scan du QR code y est ajouté ici).
