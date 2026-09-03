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

## Windows

- **L'icône de la zone de notification, avec le chiffre du jour.** Demandé le
  2026-09-03 sur le modèle de Notion Calendar, puis remis à plus tard : ce
  n'est pas un réglage à poser mais un sous-système entier, et il n'y a rien de
  tel dans l'application aujourd'hui. Version PC uniquement.

  Le dessin est tranché : **trente et une images générées une fois** par un
  script et commitées, comme le sont déjà les vignettes de fonds d'écran, et
  l'application change d'icône selon le jour. Un rendu en Rust depuis une
  police embarquée suivrait le thème de Windows et n'importe quelle taille,
  mais le carré de Notion est opaque et se lit sur fond clair comme sombre :
  ce que ce rendu coûterait, il ne le rapporte pas.

  Le reste du design, tel qu'il a été validé :

  - **Clic gauche et clic droit ouvrent tous deux le menu**, comme chez Notion
    sous Windows.
  - **Le menu liste les prochains évènements**, groupés par jour, la date en
    gris puis l'heure et le titre. Sept jours devant, huit entrées au plus.
    Puis un séparateur, « Neo Calendar » qui ramène la fenêtre, « Paramètres… »
    et « Quitter complètement ».
  - **Les phrases sont composées côté JavaScript** et remises au Rust par une
    commande, comme le sont déjà les rappels Android : l'application connaît la
    langue, le format d'heure et ce qui mérite d'être montré ; le natif ne fait
    que poser. Le menu se reconstruit à chaque changement du calendrier.
  - **L'infobulle** dit le prochain évènement, ou qu'il n'y en a pas.
  - **Fermer la fenêtre la cache** au lieu de quitter, sinon l'icône
    disparaîtrait avec elle et la fonctionnalité n'aurait plus d'objet. C'est
    ce que dit l'entrée « Quitter complètement ».

  Laissés dehors au premier jet : le sous-menu qu'ouvre le chevron d'un
  évènement chez Notion — cliquer l'évènement ouvrira sa fiche — et le
  raccourci global `Ctrl+1`, qui se rajoute seul plus tard.

  Vérifié en doc le 2026-09-03, sur Tauri 2.11.5 : `TrayIconBuilder` a bien
  `icon`, `menu`, `tooltip`, `show_menu_on_left_click` et
  `on_tray_icon_event`. La feature `tray-icon` reste à activer dans
  `Cargo.toml`, où elle n'est pas.
