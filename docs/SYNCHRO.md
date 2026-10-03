# Synchronisation : fonctionnement, délais de référence, pannes connues

Ce document sert à retrouver d'où vient un problème de synchro. Il décrit ce
que l'app impose au moteur, les délais mesurés le 2026-10-03 sur trois vrais
appareils (PC Windows, téléphone Xiaomi 13T Pro sous HyperOS, tablette
Xiaomi Pad 6), et, pour chaque panne déjà rencontrée, sa cause et comment la
vérifier.

## Comment ça marche

Chaque appareil fait tourner son propre moteur Syncthing (v2.1.5), lancé par
l'app : `syncthing.exe` à côté de l'app sur PC, `libsyncthingnative.so` dans
l'APK sur Android. Le dossier de notes est le même dossier Syncthing sur tous
les appareils.

Ce que l'app impose au dossier, à sa création et à chaque démarrage du moteur
(PATCH `/rest/config/folders/<id>`, donc aussi sur un dossier déjà déclaré) :

| Réglage | Valeur | Défaut Syncthing | Pourquoi |
|---|---|---|---|
| `fsWatcherDelayS` | 1 | 10 | une modification faite hors de l'app part au bout d'une seconde |
| `fsWatcherTimeoutS` | 1 | 0 (= 6 x le délai) | une suppression n'est plus retenue 6 s (ni 60 s avec l'ancien délai) pour détecter un renommage |
| `pullerDelayS` | 0 | 1 | un fichier annoncé est récupéré tout de suite (le dossier restait 1 s en `sync-waiting`) |
| `rescanIntervalS` | 3600 | 3600 | scan complet de secours, une fois par heure |

Ce que fait l'app autour du moteur :

- **Après chaque écriture de l'app** (note, réglages, pièce jointe), elle
  demande un scan immédiat (`POST /rest/db/scan`) : ce qu'elle écrit part sans
  attendre le surveillant de fichiers. PC : `ScanAfterWrite` dans `lib.rs`.
  Android : `StorageGate` (porte unique des écritures) appelle
  `SyncController.localChanged()`.
- **Quand un fichier arrive d'un autre appareil**, elle relit le dossier une
  fois le lot entièrement reçu (dossier revenu au repos, ou une seconde sans
  nouvel évènement) : jamais entre les deux moitiés d'un renommage. PC : fil
  d'écoute de `/rest/events` dans `control.rs`, qui émet
  `nc://sync-remote-change` vers l'interface. Android : boucle d'écoute de
  `SyncController`.
- **Android, dossier reçu d'un autre appareil** : le surveillant de fichiers
  du moteur ne suit pas les dossiers que le moteur crée lui-même ; l'app
  relance alors la surveillance (`isNewRemoteDir`, coupée puis rétablie).
- **Android, démarrage** : « Démarrer avec le téléphone » est activé par
  défaut (clé `autoStartOn`, depuis la 1.91.11). Le moteur repart à
  l'allumage et après une mise à jour de l'app (`SyncBootReceiver`).
- **PC, démarrage** : l'app est inscrite au démarrage de Windows avec
  `--hidden` ; sans interface, le moteur démarre seul au bout de 15 s.

## Délais de référence (2026-10-03)

Mesurés entre l'écriture sur un appareil et la présence du fichier sur
l'autre, téléphone en 5G puis en Wi-Fi.

| Cas | Délai |
|---|---|
| Évènement écrit dans l'app (scan immédiat) | 0,8 à 1,1 s, dont 400 ms d'attente de frappe |
| Fichier changé hors de l'app (surveillant), tous sens | 0,6 à 2 s |
| Renommage, déplacement, note ancienne supprimée, noms arabes ou emoji | 0,9 à 2 s |
| Rafale de 20 notes, note de 200 Ko | 0,8 à 1,8 s |
| Dossier créé, renommé, supprimé | 1,1 à 2 s |
| Fichier arrivé -> affiché : PC / Android | + 0,17 s / + 0,3 s |
| Conflit (même note modifiée sur deux appareils) | convergence en 1,2 s, la version perdue est gardée en `.sync-conflict-*` |
| Appareil hors ligne 25 s, puis retour du Wi-Fi | rattrapé en 13,5 s (reconnexion au réseau comprise) |
| Android redémarré, sans ouvrir l'app | moteur reparti 5 à 24 s après le déverrouillage, puis synchro en 1 à 2 s |
| Avant la 1.91.5, pour comparaison | création 10 à 13 s, suppression 60 à 70 s |

Un délai nettement au-dessus de ces valeurs est le signe d'une des pannes
ci-dessous.

## Pannes connues, cause, vérification

### Après un redémarrage d'Android, plus rien ne se synchronise

1. **Autorisation Xiaomi « Démarrage automatique » refusée** (état par défaut
   sous HyperOS) : le système refuse de lancer l'app à l'allumage et après une
   mise à jour, même avec le réglage activé. Vérifier :
   `adb shell appops get com.ahmedmili.neocalendar 10008` (`ignore` = refusée,
   `allow` = accordée). Corriger : Sécurité > Autorisations > Démarrage
   automatique > Neo Calendar, ou
   `adb shell appops set com.ahmedmili.neocalendar 10008 allow`.
2. **« Démarrer avec le téléphone » désactivé** dans la page Synchronisation
   (ou version antérieure à la 1.91.11, où il l'était par défaut).
3. **« Quitter » appuyé** dans la notification : le moteur reste arrêté
   jusqu'au prochain lancement de l'app.
4. Avant le premier déverrouillage après l'allumage, aucune app ne peut lire
   le stockage : la synchro ne reprend qu'une fois l'appareil déverrouillé.

Le moteur tourne-t-il ? `adb shell ps -A -o ARGS | grep "libsyncthingnative.*com.ahmedmili.neocalendar"`
(deux lignes quand il tourne).

### Une modification faite sur le téléphone Xiaomi, hors de l'app, n'arrive pas

Constaté sous HyperOS (téléphone), pas sur la tablette : un fichier modifié en
le **remplaçant** (fichier temporaire puis renommage par-dessus) n'est pas vu
par le surveillant de fichiers ; il part au scan horaire, ou à la prochaine
écriture de l'app. Créer, supprimer ou renommer simplement passent. Ce que
Neo Calendar écrit n'est pas concerné (scan après chaque écriture). Non
corrigé au 2026-10-03.

### Un fichier changé hors de l'app, dans un calendrier tout neuf, n'arrive pas (Android)

Versions antérieures à la 1.91.8 : le dossier du nouveau calendrier, reçu
d'un autre appareil, n'était pas surveillé. Relancer l'app ou mettre à jour.

### Une modification met environ 10 s, une suppression environ 60 à 70 s

Réglages de surveillance par défaut de Syncthing toujours en place (version
antérieure à la 1.91.5, ou moteur qui n'a pas redémarré depuis la mise à
jour). Vérifier sur PC dans
`%LOCALAPPDATA%\com.ahmed.neocalendar\syncthing\moteur\config.xml` :
`fsWatcherDelayS="1"`, `fsWatcherTimeoutS="1"` et `<pullerDelayS>0`.

### Un évènement renommé apparaît en double un court instant

Versions antérieures à la 1.91.10 : l'app relisait le dossier entre l'arrivée
du nouveau fichier et la suppression de l'ancien.

### Un évènement sans nom s'affiche avec sa date comme titre

Versions antérieures à la 1.91.10 : un titre vide était remplacé par le nom
du fichier (`2026-10-03.md`). Depuis, il reste « Sans titre » ; une note écrite
à la main sans titre prend toujours le nom de son fichier.

### La synchro s'interrompt une trentaine de secondes

Changement de réseau du téléphone (Wi-Fi <-> données mobiles, nouvelle
adresse IPv6) : les connexions tombent et se rétablissent seules (vu vers
21 h 53 le 2026-10-03). Un changement fait pendant ce temps part à la
reconnexion.

### Le moteur du PC ne démarre pas

Un Syncthing installé sur le PC partage déjà le dossier de notes : l'app ne
lance pas son moteur dessus (état « bloqué par un Syncthing installé »).
Journal du moteur : `%LOCALAPPDATA%\com.ahmed.neocalendar\syncthing\journal\`.

### Des fichiers `.syncthing.*.tmp` ou `~syncthing~*.tmp` traînent

Téléchargements interrompus (fichier supprimé pendant qu'il arrivait).
Invisibles dans l'app, effacés par Syncthing au bout de 24 h.

### Des fichiers `*.sync-conflict-*` apparaissent

Une même note modifiée sur deux appareils avant qu'ils se soient vus :
Syncthing garde une version et met l'autre de côté sous ce nom. Le
`.stignore` du PC ne les propage pas (ils restent sur l'appareil où ils sont
nés).

## Outils

- Banc d'essai à trois appareils et scripts de mesure :
  `.superpowers/synchro/` (non versionné : numéros de série des appareils).
  `banc_synchro.py` (tous les scénarios, comparaison complète des trois
  dossiers avant et après), `mesure-synchro.sh` (aller-retours PC <->
  Android), `test-redemarrage.sh` (redémarrage Android et reprise du moteur).
- Test à deux vrais moteurs, PC :
  `SYNCTHING_BINARY=<syncthing.exe> cargo test --lib -- changes_cross --nocapture`
  dans `apps/windows/src-tauri` (affiche les délais `LATENCE ...`).
- Les apps Android de production ne sont pas débogables : leurs fichiers
  privés et leur moteur ne se lisent pas par adb ; le dossier de notes
  visible (`/sdcard/Neo Calendar`) si.

## Pas encore testé (au 2026-10-03)

Redémarrage du PC ; PC en veille puis réveillé ; téléphone écran éteint
plusieurs heures (veille profonde, coupure des apps par HyperOS) ; appareil
éteint longtemps avec beaucoup de changements à rattraper.
