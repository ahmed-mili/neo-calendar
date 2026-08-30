# Liens ICS dans les calendriers Full Note

Date : 2026-08-30  
Statut : design validé

## Contexte

Neo Calendar possède actuellement un type de calendrier « Online subscription »
distinct. Il matérialise déjà les événements ICS sous forme de notes Markdown,
mais expose le flux comme un calendrier externe séparé. La refonte rattache les
liens ICS aux calendriers Full Note ordinaires : un même dossier peut recevoir
des notes personnelles et les notes générées par cinq flux au maximum.

Les calendriers ICS existants sont absents de l'installation actuelle. Une
compatibilité de lecture minimale reste néanmoins prévue pour les autres
installations.

## Objectifs

- Retirer le type de calendrier ICS de la fenêtre d'ajout.
- Autoriser jusqu'à cinq liens ICS par calendrier Full Note.
- Créer automatiquement une note Markdown par événement importé.
- Garder les notes importées en lecture seule dans cette version.
- Actualiser automatiquement chaque lien, avec une fréquence configurable.
- Toujours proposer une actualisation manuelle.
- Montrer clairement la date de dernière synchronisation et les erreurs.
- Autoriser le flux à retirer ses événements courants ou futurs sans jamais
  effacer l'historique des semaines précédentes.
- Ne jamais modifier ni supprimer une note personnelle.

## Limites du format ICS

Le standard iCalendar définit la représentation des événements, leurs
identifiants, révisions, récurrences, exclusions et annulations. Il ne garantit
pas qu'une URL publiée contienne une période historique donnée, ni que la
semaine courante soit toujours complète. Cette politique dépend du fournisseur.

Neo Calendar traite donc chaque téléchargement comme un instantané
potentiellement borné. Une absence n'est une preuve de suppression que dans une
zone dont le flux démontre encore la couverture. Les marqueurs explicites
`STATUS:CANCELLED` et `EXDATE` restent des suppressions fiables pour les
occurrences concernées. Référence : RFC 5545.

## Modèle de données

La préférence partagée attache les sources à l'identifiant stable du calendrier
local. Chaque source contient au minimum :

- un identifiant stable généré par Neo Calendar ;
- un nom affiché ;
- l'URL HTTPS ou webcal ;
- une fréquence facultative remplaçant la fréquence globale ;
- un état actif.

La configuration globale contient une fréquence par défaut de 60 minutes. Les
valeurs automatiques proposées sont 5, 15, 30, 60, 180 et 360 minutes. Le mode
manuel n'est pas une fréquence : « Actualiser maintenant » reste disponible
pour chaque source, quelle que soit sa fréquence.

Les dernières tentatives, dernières réussites et erreurs sont locales à
l'appareil afin d'éviter des écritures permanentes dans la configuration
partagée. Les associations, fréquences et sources restent partagées entre
Windows et Android.

Deux sources au maximum sont téléchargées simultanément. Une même source ne
peut pas lancer deux synchronisations concurrentes. Une URL déjà présente dans
le même calendrier est refusée, mais peut être utilisée dans un autre
calendrier.

## Notes générées

Chaque note importée porte au minimum :

```yaml
neoManagedBy: "neo-calendar:ics"
neoIcsFeedId: "…"
neoIcsUid: "…"
neoIcsRecurrenceId: null
neoIcsStatus: "confirmed"
```

L'identité logique combine la source, `UID` et, pour une occurrence récurrente,
`RECURRENCE-ID`. Le nom du fichier est déterministe et sûr sous Windows. Un
changement de titre, d'horaire, de salle ou de description met à jour la même
note au lieu d'en créer une seconde.

Seuls les fichiers portant les marqueurs attendus peuvent être mis à jour ou
supprimés par le synchroniseur. Le contenu personnel du dossier et les notes
d'une autre source restent hors de sa portée. Les notes importées sont
consultables et supprimables par le flux, mais leur édition et leur suppression
manuelles depuis Neo Calendar sont désactivées dans cette version.

## Règle de conservation et de suppression

La frontière d'archive est le lundi à 00 h 00 de la semaine locale de
l'appareil. Une note dont le début est antérieur à cette frontière ne peut
jamais être supprimée par un flux, même si elle disparaît ensuite de l'ICS ou
arrive avec un statut annulé. Elle reste l'archive de ce qui avait été importé.

Pour la semaine courante et les semaines futures :

1. `STATUS:CANCELLED` ou une occurrence visée par `EXDATE` supprime la note
   gérée correspondante dès une synchronisation valide ;
2. une occurrence simplement absente n'est supprimée qu'après deux
   synchronisations valides consécutives où elle manque ;
3. l'instantané doit encore contenir au moins une occurrence datée après
   l'occurrence absente, ce qui prouve que le flux couvre cette date ;
4. à défaut de cette preuve, la note est conservée, notamment pour les
   événements situés après l'horizon actuel du flux ;
5. une réponse HTTP en erreur, un document invalide ou un flux vide inattendu
   ne compte pas comme confirmation et ne supprime rien.

Cette règle retire automatiquement les cours réellement annulés ou déplacés
dans la partie couverte du calendrier, tout en protégeant les archives et la
fin incertaine d'un flux glissant. Le compteur d'absence est propre à chaque
source et occurrence. Une réapparition le remet à zéro.

Le découpage hebdomadaire utilise le fuseau du calendrier s'il est connu,
sinon le fuseau local de l'appareil. Le lundi est le premier jour de semaine.

## Synchronisation

Une source échue est synchronisée au démarrage, au retour au premier plan et
pendant que l'application reste ouverte. Le planificateur calcule l'échéance à
partir de la dernière tentative réussie. Une actualisation manuelle contourne
l'attente, mais respecte la déduplication et la limite de concurrence.

Le cycle d'une source est atomique du point de vue fonctionnel :

1. télécharger et valider entièrement l'ICS ;
2. développer les récurrences dans la fenêtre utile ;
3. calculer en mémoire les créations, mises à jour et suppressions autorisées ;
4. écrire les créations et mises à jour de façon atomique ;
5. appliquer les seules suppressions validées par la règle de conservation ;
6. enregistrer l'état de réussite et recharger le calendrier.

Une erreur interrompt le cycle avant les suppressions et conserve les notes
existantes. Retirer un lien de la configuration arrête ses synchronisations
mais ne supprime pas les notes déjà créées.

## Interface

### Ajout d'un calendrier

La carte « Online subscription » disparaît. La fenêtre conserve les choix
Full Note et calendriers automatiques, sans remanier leur style.

### Menu d'un calendrier

Le menu contextuel d'un calendrier Full Note reçoit une ligne « Liens ICS »
avec la même grammaire visuelle et interactive que les lignes existantes. Elle
ouvre la gestion des sources du calendrier : ajout, nom, URL, fréquence,
actualisation immédiate et retrait. L'ajout est désactivé à cinq sources avec
une explication explicite.

### Paramètres globaux

Les paramètres de l'application proposent la fréquence ICS par défaut et une
action confirmée « Appliquer à tous les liens ». Changer seulement la valeur
par défaut ne modifie pas les remplacements déjà choisis. L'action globale
écrit la valeur dans toutes les sources et retire leurs remplacements.

### État de synchronisation

Chaque source affiche son état. Après une réussite, le libellé suit la forme :

> *Dernière synchro. le 30/08/2026 à 18h05*

Le rendu est secondaire, gris et en italique, adapté au thème de l'application.
Les autres états sont « Jamais synchronisé », « Synchronisation… » et une
erreur actionnable qui conserve aussi la date de la dernière réussite. Le
calendrier affiche un résumé si plusieurs sources existent.

## Compatibilité

Au chargement, une ancienne source `ical` possédant déjà un dossier assigné est
convertie en association vers ce calendrier local, avec la fréquence globale.
La conversion conserve l'identifiant de source et le dossier afin d'éviter les
doublons. Si aucune cible sûre ne peut être déterminée, la source reste lisible
et une action de migration est présentée au lieu de déplacer des fichiers.

L'installation actuelle n'ayant aucun calendrier ICS, aucun déplacement local
n'est requis lors de cette livraison.

## Hors périmètre

- Modifier manuellement le contenu des notes ICS.
- Fusionner champ par champ les modifications locales et distantes.
- Afficher un aperçu de type diff avant un écrasement.
- Déduire arbitrairement la suppression d'un événement hors de la couverture
  démontrée par le flux.

Le futur mode éditable et son aperçu de différences restent inscrits dans
`docs/PROCHAINE_VERSION.md`.

## Tests

### Synchroniseur

- import initial et seconde synchronisation idempotente ;
- mise à jour sans changement d'identité ;
- récurrences, `RECURRENCE-ID`, `EXDATE` et `STATUS:CANCELLED` ;
- aucune suppression d'une note antérieure au lundi courant ;
- aucune suppression après un seul instantané absent ;
- suppression au deuxième instantané valide dans une zone couverte ;
- conservation au-delà du dernier événement fourni ;
- remise à zéro du compteur si l'événement réapparaît ;
- aucune suppression sur HTTP en erreur, ICS invalide ou vide inattendu ;
- impossibilité de toucher une note personnelle ou une autre source ;
- retrait d'un lien sans suppression des notes ;
- sûreté des chemins et écritures atomiques.

### Planificateur et préférences

- fréquence globale de 60 minutes par défaut ;
- fréquences 5, 15, 30, 60, 180 et 360 minutes ;
- remplacement par source et action « Appliquer à tous » ;
- actualisation manuelle toujours disponible ;
- cinq sources au maximum par calendrier ;
- deux téléchargements simultanés au maximum ;
- absence de synchronisations concurrentes d'une même source ;
- états locaux non réécrits dans les préférences partagées.

### Interface et compatibilité

- absence de la carte « Online subscription » ;
- présence de « Liens ICS » pour chaque calendrier Full Note ;
- états vide, chargement, réussite, erreur et limite atteinte ;
- libellé et format de dernière synchronisation ;
- menu et paramètres sans débordement horizontal ;
- migration d'une ancienne source avec et sans cible sûre ;
- rendu et interactions réels sur Windows et Android.

## Livraison conjointe

Le moteur de notes gérées, les protections de chemin et la lecture seule sont
des primitives communes avec le calendrier islamique généré. L'implémentation
doit les factoriser sans coupler le catalogue islamique au transport ICS. La
livraison finale comprend les deux fonctionnalités, leurs tests automatisés et
une vérification réelle sur Windows et Android avant toute commande de release.
