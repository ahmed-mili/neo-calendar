# Carnet

Ce qui est décidé mais pas fait, avec la raison de l'avoir remis. Un point sort
d'ici quand il est publié, pas quand il est écrit.

## Tablette

L'application doit tourner sur tablette, et une tablette change ce qui a du sens
à l'écran. Rien n'est fait pour l'instant : à traiter en un lot, quand il y aura
le temps de le faire correctement.

- **Les raccourcis clavier.** Depuis 1.38.24 le bouton « ? » de la barre
  latérale n'apparaît plus sur Android : sur un téléphone la fiche donnait des
  touches — `T`, `D`, `W`, `M` — qu'aucun doigt ne peut presser, au-dessus d'un
  champ de recherche qui faisait monter le clavier tactile par-dessus la fiche
  qu'on venait d'ouvrir. Les raccourcis eux-mêmes fonctionnent toujours.

  La condition est `isAndroidRuntime()`, dans `src/ui/calendar/CalendarSidebar.tsx`,
  et elle est vraie sur tablette aussi. C'est le point à revoir : sur une
  tablette avec un clavier — Bluetooth ou étui — la fiche redevient utile.

  La bonne condition n'est pas « tablette » mais « il y a un clavier ». Android
  le sait (`Configuration.keyboard != KEYBOARD_NOKEYS`, ou
  `hardKeyboardHidden`) ; il faudrait l'exposer par le pont `NeoAndroid`, comme
  le reste. À défaut, remarquer une frappe physique — un `keydown` portant une
  lettre alors qu'aucun champ n'a le focus — et révéler le bouton à ce
  moment-là ; c'est moins sûr mais ne demande rien à la coque.

- **La largeur.** Le reste de l'interface téléphone est dessiné pour une
  colonne. Ce qui se replie sur un téléphone n'a pas de raison de se replier sur
  dix pouces : barre latérale, panneau d'événement, nombre de jours par défaut.
  À décider écran par écran, pas par une règle globale.

## Réglages

- **Découper le JSON de réglages.** Un seul fichier porte tout. Un fichier par
  sujet dans `.neo-calendar/` — vues, thème, calendriers, fuseaux — pour savoir
  lequel ouvrir quand on cherche quelque chose. Même geste que les fonds
  d'écran, qui y vivent déjà.

## Android

- **Vérifier les mises à jour en tâche de fond** (`JobScheduler`), plutôt qu'au
  seul lancement.
- **L'écran d'accueil sur l'optimisation de batterie**, au premier démarrage,
  avec détection de l'état réel plutôt qu'un conseil aveugle.
- **Un service au premier plan** pour que « Réessayer » depuis la notification
  télécharge sans rouvrir l'application.

## Calendrier

- **Le compteur « N événements »** sur la colonne « toute la journée » repliée,
  pour savoir ce qu'on cache avant de la déplier.
