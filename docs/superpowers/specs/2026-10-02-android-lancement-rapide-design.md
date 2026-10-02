# Android : lancement rapide (copie des notes et rond de chargement)

Rédigé le 2026-10-02, à la demande d'Ahmed : « l'app doit se lancer le plus
rapidement possible » et « tant que l'app n'est pas utilisable on doit voir le
rond de chargement qui tourne ».

## 1. Mesure (Xiaomi 13T Pro d'Ahmed, 1.86.0, dossier SAF de 543 notes)

| Temps après l'appui | Écran | Travail |
|---|---|---|
| 0 à 0,2 s | rien | démarrage du processus |
| 0,2 à 1,8 s | écran de démarrage | lecture des notes ; l'écran de démarrage est relâché au plafond de 1,5 s (`holdSplashUntilReady`) |
| 1,8 à 8,1 s | **fond d'écran seul, immobile** | lecture des notes, suite |
| 8,1 à 8,3 s | grille puis évènements | calcul et affichage |

« Displayed » d'Android (1,7 s) ne mesure que le relâchement de l'écran de
démarrage, pas l'app utilisable.

Cause, mesurée par trace Perfetto : **611 appels au fournisseur SAF**
(`com.android.externalstorage`), **6 950 ms** au total, ~11 ms chacun, **en
série sur un seul fil**, de 0,17 s à 8,11 s : un appel par fichier lu
(`readText`), plus un par dossier listé. Le calcul de l'app tient en moins de
2 s, réparties sur plusieurs fils. Le coût croît avec le nombre de notes.

## 2. But et critères

- Lancement à froid d'une app déjà utilisée, sur le téléphone d'Ahmed :
  **grille remplie et utilisable en 1 s au plus** (mesuré comme au §1, par
  enregistrement d'écran et trace).
- Jamais d'écran immobile pendant une attente : **un rond de chargement qui
  tourne** dès que l'écran de démarrage est relâché et tant que la grille
  n'est pas remplie.
- Données toujours fraîches : jamais de grille affichée depuis une copie sans
  avoir vérifié le dossier. Une note modifiée ailleurs apparaît au lancement.
- Aucune perte possible : la copie ne sert qu'à éviter des lectures ; toute
  écriture passe par le dossier réel, comme aujourd'hui.
- Règles permanentes : fiabilité d'abord, aucune migration, mise à jour sans
  rien changer pour l'utilisateur, tout en Kotlin.

## 3. Conception

### 3.1 Copie des fichiers lus (noyau)

`CachedWorkspaceStorage` (noyau, JVM pur, testable) enveloppe un
`WorkspaceStorage` :

- `list(dir)` : toujours délégué au stockage réel (un appel par dossier, ~17
  au total) ; chaque entrée porte `lastModified` et **`size`** (nouveau champ
  de `WorkspaceStorage.Entry`, `-1` quand le stockage ne le sait pas ; SAF le
  donne par `COLUMN_SIZE` dans la même requête, `File.length()` en vrai chemin).
- `readText(path)` : rendu depuis la copie si la copie a une entrée pour ce
  chemin avec **le même `lastModified` et la même `size`**, tous deux connus
  (non nuls / non négatifs) ; sinon lu dans le stockage réel et la copie mise
  à jour. C'est le critère de Syncthing pour décider qu'un fichier a changé.
  Un fichier sans date ou sans taille connue est toujours relu.
- La copie ne garde que les fichiers vus au dernier listage : un fichier
  disparu en sort.
- Les lectures qui doivent passer par le stockage réel se font **en parallèle,
  4 au plus** (premier lancement, ou beaucoup de fichiers changés), pour
  réduire le cas sans copie ; l'ordre et le résultat de `loadWorkspace` restent
  identiques à une lecture en série (test).

### 3.2 Persistance de la copie (app)

- Un fichier unique dans le stockage privé (`filesDir/note-cache.bin`, hors du
  dossier de notes, jamais synchronisé, exclu des sauvegardes) : version du
  format, identité du dossier (URI SAF ou chemin privé), puis par fichier :
  chemin, `lastModified`, `size`, contenu.
- Chargé hors du fil principal au début de la lecture ; écrit de façon
  atomique (temporaire puis renommage) après une lecture qui a changé quelque
  chose, hors du fil principal, sans retarder l'affichage.
- Fichier illisible, version inconnue ou dossier différent (l'utilisateur a
  changé de dossier, bascule de stockage) : copie ignorée et reconstruite.
  Jamais d'erreur visible pour une copie abîmée.
- Les écritures de l'app ne touchent pas la copie : la relecture qui suit
  chaque écriture voit la nouvelle date du fichier écrit et le relit.

### 3.3 Rond de chargement (révisé le 2026-10-02 par Ahmed)

« Au lancement de l'app on ne doit voir que le rond qui tourne ; on ne doit
voir le fond d'écran que juste avant que l'app soit utilisable, pas pendant le
chargement. »

- L'écran de démarrage système n'a plus d'icône (icône transparente) : un
  aplat de couleur, cédé tout de suite (plus de plafond de 1,5 s).
- Pendant `Loading` : écran opaque de la même couleur, un indicateur
  circulaire qui tourne au centre (jeton d'accent). Ni fond d'écran ni grille.
- Le fond d'écran et la grille apparaissent ensemble, par un fondu court, quand
  les données sont prêtes et l'image du fond décodée ; si le décodage tarde
  au-delà d'environ 150 ms après les données, la grille apparaît sur l'aplat et
  le fond suit en fondu. Jamais le fond seul avant la grille.

## 4. Erreurs

| Cas | Comportement |
|---|---|
| Copie absente (premier lancement, nouvelle version) | lecture complète en parallèle, rond de chargement, copie écrite ensuite |
| Copie abîmée ou d'un autre dossier | ignorée, reconstruite, aucune erreur affichée |
| Fichier modifié avec même date et même taille | non relu (limite connue, partagée avec Syncthing) |
| Écriture de la copie impossible (disque plein) | ignorée et journalisée ; l'app marche comme sans copie |

## 5. Tests et vérification

- JUnit (noyau) : copie utilisée quand date et taille concordent, relue sinon,
  relue quand la date ou la taille est inconnue, fichier disparu retiré,
  lecture parallèle identique à la lecture en série, nombre d'appels au
  stockage réel compté (un faux stockage qui compte `readText`).
- App : format de la copie (aller-retour, version inconnue, dossier différent,
  fichier tronqué).
- Téléphone d'Ahmed (`adb -s SGPZQ84XNFDQBE8L`, uniquement des mesures et
  l'installation de la version livrée, jamais un APK de debug : signature
  différente) et émulateur : temps jusqu'à la grille remplie, avant / après,
  par enregistrement d'écran ; nombre d'appels SAF par trace Perfetto ;
  rond de chargement visible au premier lancement.

## Hors périmètre

Le défaut de la synchro ICS qui réécrit 84 notes à chaque passage (il
invaliderait 84 entrées de la copie à chaque synchro) : chantier prioritaire
séparé, noté dans `PROCHAINE_VERSION.md`.
