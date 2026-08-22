# Syncthing dans Neo Calendar (PC et Android)

Rédigé le 2026-08-22 au soir, pour être exécuté le 2026-08-23.
Statut : conception validée sur le principe, deux points restent à trancher
avant d'écrire du code (section « À trancher avant de commencer »).

## L'objectif

Deux choses, dans cet ordre :

1. **Les conflits de synchronisation se règlent tout seuls.** Aujourd'hui,
   quand Syncthing ne peut pas départager deux versions d'une note, il garde la
   plus récente sous son nom et pose la perdante à côté, sous le nom
   `Reunion.sync-conflict-20260822-181800-ABCDEFG.md`. Neo Calendar doit
   fusionner les deux et faire disparaître le fichier de conflit, sans rien
   demander.
2. **L'app dit ce que fait la synchronisation.** Est-ce à jour, depuis quand le
   téléphone n'a pas parlé, combien de fichiers sont en retard, le dossier de
   données est-il seulement partagé.

## Ce qui existe déjà, et qu'il ne faut pas refaire

Le code connaît Syncthing sans jamais lui parler :

- `apps/windows/src/platform/desktopWorkspacePreferences.ts` a été scindé en
  deux moitiés (`DeviceWorkspacePreferences` / `SharedWorkspacePreferences`)
  précisément parce que deux appareils réécrivant le fichier entier toute la
  journée donnaient à Syncthing de quoi entrer en conflit.
- `reconcileWorkspacePreferences` fusionne déjà couleurs et ordre plutôt que de
  prendre le fichier lu pour la vérité entière, et traite l'absence de fichier
  comme « rien appris » plutôt que comme « tout effacé ». C'est le modèle de
  fusion à généraliser, pas à réinventer.
- `merge_preserving_colors` dans `apps/windows/src-tauri/src/lib.rs` fait la
  même chose côté Rust au moment de l'écriture.
- `EventCache.populating` (src/core/EventCache.ts) empêche déjà qu'un sync
  déposant des notes pendant le démarrage fasse insérer deux fois le même
  événement.
- L'écran Réglages a une section Synchronisation, mais elle ne fait que lister
  « Syncthing (recommandé) / stockage en ligne / transfert manuel »
  (`DesktopSettings.tsx`, `renderSync`). C'est là que la nouvelle page se
  branche.

**Bug latent confirmé par lecture du code** : `read_event_files` (lib.rs:299)
retient tout fichier dont l'extension est `.md`, sans exception. Un
`Reunion.sync-conflict-....md` est donc chargé comme un événement de plein
droit : après le moindre conflit, l'événement apparaît **en double dans la
grille**, et modifier l'un ou l'autre écrit dans un fichier que Syncthing
considère comme un déchet. C'est la partie la plus urgente et la moins chère.

## La réponse à « le plus volumineux ou le plus récent gagne, c'est fiable ? »

**Le plus récent : fiable la plupart du temps, mais il perd exactement ce qu'on
veut garder.** Neo Calendar réécrit le fichier entier à chaque modification.
Scénario : le téléphone est hors ligne dans le métro, tu y ajoutes trois
événements dans la note du jour ; de retour, le PC avait entre-temps réécrit
cette même note pour changer une heure. Le PC est « plus récent », il gagne, et
les trois événements du téléphone n'ont jamais existé. C'est le scénario qui a
motivé la scission des préférences, il se reposera à l'identique sur les notes.

**Le plus volumineux : à écarter.** Une suppression légitime (retirer un
événement, raccourcir une description) rend le fichier plus petit. « Le plus
gros gagne » ressuscite donc systématiquement ce qu'on vient de supprimer, et
sur une note d'événement unique il fait gagner un titre rallongé contre un
changement d'heure. Le critère corrèle avec « contient plus d'information »
seulement pour les notes quotidiennes multi-événements, et même là il travaille
à contresens des suppressions.

**Ce qui coûte à peine plus cher et tient debout** : le frontmatter est du YAML
plat (title, date, startTime, endTime, allDay, type...). Comparer deux
dictionnaires plats champ par champ, c'est une trentaine de lignes. On garde
alors tout ce qui est disjoint (le téléphone a changé l'heure, le PC le titre :
les deux survivent), et « le plus récent » ne sert plus que de départage quand
les deux ont touché **le même** champ. Même prix, beaucoup moins de pertes.

## Décision d'intégration

**Les fichiers d'abord, l'API REST en bonus.**

La résolution de conflits ne dépend de rien : elle regarde le dossier de
données, elle y trouve ou non des fichiers `.sync-conflict-*`, elle les traite.
Aucune clé, aucune configuration, elle marche même si Syncthing est remplacé un
jour par autre chose (le nom de fichier est le seul contrat).

L'API REST locale de Syncthing (`http://127.0.0.1:8384/rest/...`) vient en
plus, pour ce que les fichiers ne peuvent pas dire : quels appareils sont
connectés, ce qui reste à transférer, les erreurs. Si la clé n'est pas là,
l'app perd ces informations et rien d'autre.

## Architecture

Quatre unités, chacune testable seule.

### 1. `conflictResolver.ts` (partagé, pur, aucun I/O)

Le cœur. Entrée : deux contenus de fichier plus leurs métadonnées (date de
modification, identifiant d'appareil tiré du nom du fichier de conflit).
Sortie : le contenu fusionné, plus un journal de ce qui a été tranché.

Aucun accès disque, aucune dépendance plateforme, donc entièrement testable en
Jest depuis la racine, comme `reconcileWorkspacePreferences` l'est déjà.

**Contrainte de conception non négociable : la fusion est déterministe.** Les
deux appareils voient le même conflit et le résolvent chacun de leur côté. Si
la fusion dépend de « qui suis-je », les deux produisent deux résultats
différents et fabriquent un nouveau conflit, indéfiniment. Donc aucune règle du
type « ma version d'abord » : le départage se fait sur (date de modification,
puis identifiant d'appareil comparé alphabétiquement), jamais sur l'identité du
résolveur.

Trois formes de fichier, trois traitements :

- **Note d'événement unique** (un fichier, un événement) : fusion du
  frontmatter champ par champ, départage à la récence sur les champs communs
  divergents. Le corps markdown, s'il diffère, suit le gagnant du départage,
  et l'autre corps est conservé au journal.
- **Note quotidienne** (plusieurs événements dans une liste) : union des
  lignes, dédupliquées à l'identique, ordre stable (celui de la version
  gagnante, les lignes propres à la perdante insérées à leur place relative).
  Une ligne présente d'un seul côté est gardée.
- **Fichier de préférences JSON** : `reconcileWorkspacePreferences` existe
  déjà, on l'appelle.

**Limite théorique à assumer** : sans état de référence commun, « présent d'un
seul côté » ne se distingue pas de « supprimé de l'autre côté ». L'union
choisie ici privilégie donc l'ajout sur la suppression : une suppression faite
sur un appareil pendant qu'un autre modifiait la même note peut revenir. C'est
le sens le moins destructeur, et le journal le montre. La levée de cette limite
(garder un cliché local du dernier contenu lu ou écrit par cet appareil, hors
dossier synchronisé, pour faire une vraie fusion à trois versions) est notée en
phase 6, pas dans le premier lot.

### 2. Le balayeur, par plateforme

Lister les fichiers dont le nom porte
`.sync-conflict-<8 chiffres>-<6 chiffres>-<7 caractères>` avant l'extension,
lire les deux versions, appeler le résolveur, écrire le résultat sous le nom
d'origine, puis **archiver la perdante hors du dossier synchronisé** et
supprimer le fichier de conflit du dossier (sa suppression se propage aux
autres appareils, ce qui est exactement voulu).

- PC : Rust, dans `lib.rs`, à côté de `read_event_files`. Archive dans le
  dossier de données applicatif de Tauri, pas dans le dossier synchronisé.
- Android : Java, via le pont `NeoAndroid.invoke` existant et l'accès SAF déjà
  accordé (`ACTION_OPEN_DOCUMENT_TREE`). **Aucune nouvelle permission.**

Déclenché au démarrage, et à chaque rechargement du dossier.

### 3. Le client Syncthing (lecture seule, facultatif)

Un client REST minimal. Ce qu'on lit, et ce que ça donne :

| Point d'entrée | Ce qu'on en tire |
|---|---|
| `/rest/system/status` | l'identifiant de cet appareil, et la preuve que la clé marche |
| `/rest/system/connections` | appareils connectés, dernier échange, adresse |
| `/rest/config/folders` | **le dossier de données est-il seulement partagé** (erreur silencieuse la plus fréquente) |
| `/rest/db/status?folder=` | état (idle, syncing, scanning), fichiers en retard, erreurs |
| `/rest/db/completion?folder=&device=` | « le téléphone a 3 fichiers de retard » |
| `/rest/system/error` | dossier en pause, disque plein, appareil rejeté |
| `/rest/db/scan?folder=` | **forcer un rescan après écriture** : la modification part tout de suite au lieu d'attendre la fenêtre de scan |
| `/rest/events?since=` | fin de synchronisation signalée en direct, donc la grille se rafraîchit au bon moment plutôt qu'en boucle |

Deux pièges de plateforme, à traiter dès le départ :

- **Android** : un `fetch` vers `http://127.0.0.1:8384` depuis la WebView est
  bloqué deux fois (contenu non chiffré, et CORS). L'appel doit passer par le
  pont Java, comme tout le reste. Prévoir aussi le `network_security_config`
  autorisant le trafic en clair vers 127.0.0.1 uniquement.
- **PC** : l'appel part de Rust, à côté de `fetch_desktop_ics` qui a déjà un
  client HTTP.

**Découverte de la clé** : sous Windows, Syncthing la garde dans
`%LOCALAPPDATA%\Syncthing\config.xml`, balise `<apikey>`, lisible sans rien
demander. À vérifier demain, mais si cela se confirme, il n'y a rien à saisir
sur PC. Sur Android, la configuration de Syncthing-Fork est dans son stockage
privé, donc inaccessible : la clé se colle à la main dans les réglages (elle
s'affiche dans l'interface web de Syncthing-Fork).

### 4. L'interface

- **Une page « Synchronisation »** dans les réglages, à la place de la liste
  actuelle des méthodes possibles : état du dossier, appareils avec leur
  dernier échange et leur retard, erreurs, et le journal des conflits résolus,
  chaque ligne offrant de restaurer la version écartée.
- **Une pastille discrète** dans la barre, seulement quand il y a quelque chose
  à dire : synchronisation en cours, hors ligne depuis un moment, conflit
  résolu, dossier non partagé. Rien à afficher quand tout va bien.
- Le style suit `SettingsRow` / `SettingsGroup` comme le reste de l'écran.

## Tests

- Le résolveur : Jest, depuis la racine. Un cas par forme de fichier, plus les
  cas qui font mal : champs disjoints, même champ divergent, corps différent,
  fichier de conflit d'un fichier lui-même en conflit, contenu illisible.
- **Le test de convergence** : donner le même couple (gagnant, perdant) au
  résolveur en inversant les rôles et vérifier que la sortie est identique
  octet pour octet. C'est ce test qui garantit qu'on ne fabrique pas une boucle
  de conflits.
- Le balayeur PC : tests Rust dans `lib.rs`, sur un dossier temporaire, comme
  `a_save_never_drops_a_colour_another_device_added` le fait déjà.
- Le client REST : réponses figées, aucun réseau dans les tests.
- Sur le vrai matériel : fabriquer un conflit à la main (couper le réseau,
  modifier le même événement des deux côtés, rebrancher), sur le PC et sur le
  **téléphone réel**, pas seulement l'émulateur.

## Ordre de construction

| Phase | Contenu | Publiable seule |
|---|---|---|
| 0 | Fabriquer un vrai conflit, relever le nom exact produit par Syncthing, confirmer le doublon dans la grille, vérifier la lecture de la clé dans config.xml | non |
| 1 | Ignorer les fichiers `.sync-conflict-*` à la lecture, PC et Android | **oui**, correctif |
| 2 | Le résolveur pur et ses tests | non |
| 3 | Le balayeur PC, l'archivage, le journal | oui |
| 4 | Le balayeur Android | oui, avec 3 |
| 5 | Le client REST, la page Synchronisation, le rescan après écriture | oui |
| 6 | Le cliché local pour une vraie fusion à trois versions | plus tard |

Les phases 1 à 5 valent une version mineure. AGENTS.md interdit de la publier
sans l'accord d'Ahmed.

## À trancher avant de commencer

1. **Le comportement en cas de vraie divergence.** La question posée le 22/08
   au soir n'a pas reçu de réponse (elle a dérivé sur le critère de taille).
   Trois possibilités : trancher seule et garder trace au journal (ce que la
   spec suppose partout), poser un marqueur sur l'événement et laisser choisir,
   ou laisser gagner le plus récent sans rien dire.
2. **La pastille dans la barre** : la barre porte déjà la version et le bouton
   de mise à jour, dont la place a été négociée finement en 1.50.x. Vérifier
   qu'un troisième état y tient avant de le dessiner.
