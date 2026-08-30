# Calendrier islamique généré

Date : 2026-08-30  
Statut : design validé

## Contexte

Neo Calendar utilise `C:\Neo Calendar` comme dossier de données partagé entre
Windows et Android. Le calendrier local `الْإِسْلَامُ` contient déjà des notes
personnelles. L'application doit y ajouter un catalogue islamique complet sans
mélanger ces fichiers avec ceux de l'utilisateur.

Le dépôt possède déjà un moteur de règles automatiques, une conversion
grégorien vers hégirien fondée sur `Intl` et le calendrier Umm al-Qura, ainsi
qu'un petit preset islamique. Ce preset calcule des événements en mémoire, ne
produit aucune note et ne porte ni catégories, ni traditions, ni descriptions
documentées. Il fixe aussi à tort les six jours de Chawwāl du 2 au 7 alors que
ces six jours peuvent être répartis dans le mois.

## Objectifs

- Générer des notes Markdown dans un sous-dossier géré du calendrier local.
- Afficher le titre de chaque événement uniquement en arabe.
- Fournir une description française informative et sourcée.
- Couvrir les observances communes ainsi que les traditions sunnites, chiites
  duodécimaines, ismaéliennes, ibadites, locales et soufies.
- Inclure les événements historiques majeurs réellement commémorés par une
  tradition, sans transformer le calendrier en chronologie générale.
- Permettre de masquer des types d'événements et des traditions sans supprimer
  leurs fichiers.
- Partager les fichiers et les préférences entre Windows et Android.
- Garantir qu'aucune note personnelle n'est modifiée ou supprimée.

## Hors périmètre

- Les horaires quotidiens de prière, la prière du vendredi, le suḥūr et
  l'ifṭār. Une intégration Mawaqit séparée est inscrite dans
  `docs/PROCHAINE_VERSION.md`.
- Une décision religieuse sur la date observée localement. L'application donne
  une date calculée et explique qu'une observation locale peut la décaler.
- Les anniversaires historiques qui ne font l'objet d'aucune commémoration
  calendaire documentée.
- La modification manuelle des fichiers générés depuis Neo Calendar.

## Définition de la couverture complète

« Complet » désigne l'union des observances calendaires récurrentes publiées par
le corpus de référence ci-dessous. Une entrée n'est ajoutée que si une source
identifiable la rattache à une pratique ou à une tradition. Le catalogue ne
prétend pas que toutes les entrées sont reconnues par tous les musulmans.

Le corpus initial est composé de :

- Coran et recueils canoniques de hadith pour les prescriptions et jeûnes
  communs ou sunnites ;
- calendrier Umm al-Qura pour la conversion hégirienne calculée ;
- annonces mensuelles « Important Islamic Events » d'IMAM-US pour les
  commémorations chiites duodécimaines ;
- publications officielles de The Ismaili pour les observances ismaéliennes ;
- calendriers et annonces du ministère omanais des Affaires religieuses et de
  l'agence Oman News Agency pour les observances ibadites institutionnelles ;
- publications calendaires d'une institution religieuse identifiable pour une
  observance locale ou soufie.

Chaque entrée conserve ses références et sa date de dernière révision. Une
matrice de couverture versionnée énumère les entrées attendues par source. Les
tests comparent le catalogue à cette matrice afin qu'une entrée ne disparaisse
pas silencieusement pendant une modification.

## Organisation des fichiers

La configuration initiale cible :

```text
C:\Neo Calendar\الْإِسْلَامُ\المناسبات الإسلامية\
```

Le chemin n'est pas codé en dur dans le moteur. La préférence partagée contient
le chemin relatif choisi. Le même système peut donc être activé dans un autre
calendrier local.

Le sous-dossier contient :

- une note Markdown par occurrence datée ;
- une note récurrente pour chaque récurrence grégorienne représentable sans
  ambiguïté, notamment les lundis et jeudis ;
- `.neo-calendar-islamic.json`, manifeste non Markdown décrivant la version du
  catalogue et les années déjà générées.

Le générateur possède entièrement ce sous-dossier, mais ne considère un fichier
comme modifiable que si son frontmatter porte simultanément son marqueur, son
identifiant stable et une version reconnue. Un fichier sans ce triplet est une
note personnelle et reste intact.

## Format d'une note générée

Le frontmatter compatible Neo Calendar contient au minimum :

```yaml
---
title: "عيد الفطر"
id: "neo-islamic:common:eid-al-fitr:1448"
type: "single"
date: "2027-03-09"
endDate: null
allDay: true
description: "Aïd al-Fitr. Premier jour de Chawwāl..."
neoManagedBy: "neo-calendar:islamic"
neoManagedVersion: 1
neoIslamicId: "eid-al-fitr"
neoIslamicCategory: "feasts"
neoIslamicTraditions: ["common"]
---
```

Les clés `neo*` sont des métadonnées de gestion. Elles sont préservées par le
parseur et le sérialiseur, mais ne deviennent pas des propriétés générales de
tous les événements. Lors du chargement, elles rendent la note non modifiable
dans l'application et fournissent les dimensions de filtrage.

Le nom du fichier est déterministe, compatible Windows et indépendant d'une
traduction française. Il combine la date, l'identifiant du catalogue et l'année
hégirienne. Changer une description ne change donc pas le chemin du fichier.

## Catalogue

Chaque définition porte :

- `id`, stable et en ASCII ;
- `titleAr`, titre arabe affiché ;
- `nameFr`, nom français repris au début de la description ;
- `descriptionFr`, contexte religieux ou historique concis ;
- `category`, type thématique ;
- `traditions`, liste explicite des traditions concernées ;
- `status`, parmi obligatoire, recommandé, interdit, fête, commémoration ou
  information ;
- `rule`, règle hégirienne ou grégorienne ;
- `sources`, références stables ;
- `lastReviewed`, date de révision du contenu.

Les catégories thématiques initiales sont :

- fêtes et dates majeures ;
- mois et périodes sacrés ;
- Ramadan et nuits du Destin ;
- Hajj et Dhou al-Hijja ;
- jeûnes recommandés ;
- commémorations historiques.

Les traditions initiales sont :

- communes ;
- sunnites ;
- chiites duodécimaines ;
- ismaéliennes ;
- ibadites ;
- locales ou soufies.

Une observance peut appartenir à plusieurs traditions, mais possède une seule
catégorie thématique principale. La description indique les divergences de
date ou de statut sans les présenter comme une erreur d'une autre tradition.

## Règles calendaires

Le moteur existant reste la primitive de conversion. Le catalogue ajoute les
capacités suivantes :

- métadonnées conservées pendant l'expansion d'une règle ;
- périodes produites comme un seul événement avec date de fin, plutôt qu'une
  copie identique sur chaque jour ;
- exclusions de mois ou de dates hégiriennes ;
- fenêtre flexible pour une pratique qui n'impose pas des jours précis ;
- variante de date liée à une tradition ;
- description adaptée à une occurrence exceptionnelle.

Règles particulières obligatoires :

- le jeûne de Ramadan forme une période du premier au dernier jour du mois ;
- les dix dernières nuits et les jours de Tachrīq forment chacun une période ;
- les six jours de Chawwāl sont une fenêtre du 2 à la fin du mois, jamais six
  dates arbitrairement imposées ;
- les jours blancs sont identifiés les 13, 14 et 15 de chaque mois, avec une
  mention particulière le 13 Dhou al-Hijja où le jeûne est interdit ;
- les recommandations des lundis et jeudis ne créent pas une recommandation
  distincte pendant Ramadan, les deux Aïd ou les jours de Tachrīq ;
- le jeûne de ʿArafa précise qu'il concerne les non-pèlerins ;
- les nuits commencent au coucher du soleil dans leur description, même si la
  grille civile les rattache à une date ISO.

## Date calculée et observation locale

La génération hors ligne utilise `Intl.DateTimeFormat` avec
`islamic-umalqura`, comme le moteur actuel. Il s'agit d'une date attendue et non
d'une annonce d'observation locale.

Chaque description concernée contient une phrase courte indiquant que le début
du mois peut varier selon le lieu et l'autorité suivie. Une tradition qui
publie sa propre méthode d'observation conserve cette information dans ses
métadonnées, mais la première version ne télécharge pas des annonces mensuelles
au démarrage.

Si le runtime ne prend pas en charge le calendrier requis ou renvoie une date
invalide, aucune note de la période concernée n'est écrite et une erreur
actionnable est affichée. Aucune date de secours n'est inventée.

## Cycle de génération

À l'activation, l'application génère les années hégiriennes qui intersectent
l'année grégorienne courante, la précédente et la suivante.

Lorsque la navigation atteint une année non matérialisée, l'application génère
les années hégiriennes nécessaires avant d'afficher la période. Les années déjà
générées restent sur le disque. Une montée de version du catalogue réconcilie
les années matérialisées.

La réconciliation suit cet ordre :

1. calculer en mémoire l'ensemble attendu ;
2. lire le manifeste et les seuls fichiers marqués comme gérés ;
3. écrire ou mettre à jour chaque fichier attendu de façon atomique ;
4. supprimer les fichiers gérés devenus obsolètes ;
5. écrire le manifeste en dernier ;
6. recharger le calendrier.

Une interruption avant l'étape 5 laisse l'ancien manifeste. Le prochain passage
reprend alors toute la réconciliation. Les écritures sont déterministes, donc
Windows et Android peuvent converger vers le même contenu après synchronisation.

## Paramètres et filtrage

La préférence partagée contient une configuration dédiée : activation, chemin
relatif du sous-dossier, catégories masquées et traditions masquées. Elle voyage
dans `.neo-calendar.json` avec les autres préférences partagées.

Dans Paramètres > Calendriers, la ligne du calendrier islamique ouvre une page
avec deux groupes d'interrupteurs : « Types d'événements » et « Traditions ».
Le comportement est identique sur Windows et Android.

Les catégories communes sont visibles par défaut. Les commémorations
historiques et les traditions particulières sont présentes sur le disque mais
masquées par défaut. Masquer une option filtre l'affichage, la recherche, le
panneau d'événements et les rappels. Cela ne supprime aucun fichier.

Un événement rattaché à plusieurs traditions reste visible dès qu'au moins une
de ses traditions actives le couvre. Masquer sa catégorie thématique le masque
toujours.

## Activation initiale

L'interface d'ajout d'un calendrier automatique propose le preset islamique et
demande un calendrier local cible. Pour l'installation actuelle, l'activation
enregistre explicitement `الْإِسْلَامُ/المناسبات الإسلامية` dans
`.neo-calendar.json`. Le moteur ne dépend pas du nom arabe pour détecter la
fonctionnalité.

Le dossier est créé s'il est absent. S'il existe déjà et contient un manifeste
incompatible, l'activation s'arrête avec une erreur. S'il contient des fichiers
personnels, ils sont conservés et signalés comme hors gestion.

## Gestion des erreurs et sécurité

- Toutes les opérations restent confinées au chemin relatif configuré sous le
  dossier de données résolu.
- Les segments absolus, `..`, liens symboliques sortants et noms Windows
  réservés sont refusés.
- Une suppression exige le triplet de propriété du générateur et un chemin
  présent dans l'ancien manifeste.
- Une erreur sur un fichier n'entraîne jamais la suppression des autres.
- Un fichier personnel en collision bloque l'occurrence concernée et produit un
  message ; il n'est ni renommé ni remplacé.
- Désactiver la fonctionnalité masque les événements mais conserve les notes.
- Une action séparée et confirmée pourra supprimer uniquement les fichiers
  reconnus comme générés.

## Tests

### Catalogue et règles

- validation du schéma de chaque définition ;
- titre arabe non vide sans traduction française ou texte latin ;
- nom et description français non vides ;
- catégorie, tradition, statut et source reconnus ;
- matrice de couverture complète par source ;
- dates de référence pour les deux Aïd, ʿArafa, ʿĀchūrāʾ, Arbaïn, Ghadīr et les
  nuits du Destin ;
- périodes inclusives correctes ;
- six jours de Chawwāl non transformés en dates imposées ;
- exclusions des jeûnes récurrents pendant les jours interdits.

### Générateur

- première génération, seconde génération identique et mise à niveau du
  catalogue ;
- noms déterministes et absence de doublons ;
- génération paresseuse d'une nouvelle année ;
- reprise après interruption avant le manifeste ;
- collision avec une note personnelle ;
- impossibilité de modifier ou supprimer un fichier non marqué ;
- confinement du chemin sur Windows et Android ;
- contenu Markdown lisible par le parseur existant.

### Interface et préférences

- activation vers un calendrier local ;
- persistance des catégories et traditions masquées ;
- filtrage de la grille, de la liste, de la recherche, du panneau et des
  rappels ;
- état par défaut des catégories communes et particulières ;
- rendu et interaction réels sur Windows et dans l'émulateur Android.

## Compatibilité et livraison

Le preset islamique automatique existant reste lisible. Lorsqu'un utilisateur
active le nouveau générateur, l'application évite de charger simultanément le
vieux preset vers la même cible afin de prévenir les doublons. Les autres
calendriers automatiques et les abonnements ICS ne changent pas.

La livraison comprend le catalogue, sa matrice de couverture, la génération,
les paramètres Windows et Android, les tests automatisés et une vérification
visuelle sur les deux plateformes. L'intégration Mawaqit demeure un chantier
ultérieur indépendant.
