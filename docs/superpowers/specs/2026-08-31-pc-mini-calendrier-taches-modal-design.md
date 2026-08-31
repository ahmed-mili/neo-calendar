# Refonte PC du mini calendrier et des tâches

## Périmètre

Cette modification concerne uniquement l'application PC Windows. Elle ne doit modifier ni le rendu ni le comportement Android.

## Objectifs

- Rendre toutes les informations du mini calendrier lisibles, y compris les numéros de semaine et les jours hors du mois courant.
- Faire tenir le contenu normal de la barre latérale PC sans barre de défilement verticale interactive.
- Remplacer les listes de tâches intégrées à la barre latérale par deux boutons d'état compacts ouvrant une fenêtre modale.
- Garantir qu'une tâche sans date ni échéance ne puisse jamais être terminée.

## Mini calendrier PC

Le mini calendrier conserve sa structure et sa densité générales. Quand les numéros de semaine sont activés, une colonne de largeur fixe leur est réservée afin qu'ils ne soient ni comprimés ni coupés. Leur contraste est relevé au niveau du texte secondaire. Les jours du mois courant utilisent le texte principal et ceux des mois voisins un texte secondaire lisible, sans opacité additionnelle excessive.

Les états aujourd'hui, sélectionné, semaine courante, survol et focus doivent rester distincts. Les couleurs sont obtenues avec les variables de thème existantes pour rester compatibles avec les thèmes clair, sombre et à fond d'écran.

La barre latérale PC ne masque pas artificiellement une zone encore débordante. Sa structure est rendue assez compacte pour que le mini calendrier, les calendriers et le résumé des tâches tiennent dans la hauteur PC normale. La longue liste des tâches quitte la barre latérale et devient le contenu défilable de la modale. Aucun style Android n'est modifié.

## Résumé Tasks dans la barre latérale

Le titre `Tasks` est toujours visible et n'est plus repliable. Immédiatement dessous figurent exactement deux boutons en forme de pilule :

- `To do`, orange, avec le nombre de tâches à faire ;
- `Complete`, vert, avec le nombre de tâches terminées.

Les pilules réutilisent la colorimétrie et la forme des statuts déjà présents dans la fiche d'un événement. Le bouton `Add task` disparaît de cette section.

Une tâche sans date rejoint le groupe `To do`. Le groupe séparé `No date` disparaît. Dans la liste `To do`, les tâches datées restent triées par date effective, puis les tâches sans date conservent leur ordre stable.

## Fenêtre modale des tâches

Un clic sur une pilule ouvre une modale centrée au-dessus de l'application. Son titre correspond à l'état choisi et affiche le nombre d'éléments. La modale peut être fermée avec sa croix, la touche Échap ou un clic sur l'arrière-plan.

La fenêtre garde un en-tête fixe et seule sa liste interne défile lorsqu'elle contient beaucoup d'éléments. Chaque ligne conserve le titre, la couleur du calendrier, la date ou l'échéance lorsqu'elle existe, et ouvre la fiche de la tâche au clic. Un état vide clair est affiché lorsqu'un groupe ne contient aucun élément.

Le focus clavier est visible. Les pilules et les lignes s'activent avec Entrée ou Espace. La modale expose `role="dialog"`, `aria-modal="true"` et un libellé associé.

## Invariant des tâches sans date

Une tâche est considérée comme datée si elle possède une date ou une échéance. Si elle ne possède ni l'une ni l'autre :

- elle apparaît dans `To do` ;
- sa case de terminaison est désactivée avec un libellé accessible expliquant la raison ;
- le statut `Complete` est indisponible dans sa fiche ;
- la couche d'écriture refuse également toute tentative de la terminer ;
- une ancienne donnée incohérente marquée terminée est normalisée en `To do` lors de sa lecture et sera enregistrée ainsi lors de sa prochaine modification.

La règle doit être centralisée dans une fonction pure afin que la liste, la fiche et l'écriture utilisent la même définition.

## Tests et validation

Les tests unitaires couvrent le regroupement des tâches sans date dans `To do`, leur ordre, la normalisation d'un ancien statut incohérent et le refus de terminaison. Les tests de composants couvrent les deux pilules, l'absence de `No date` et de `Add task`, l'ouverture de la bonne modale, sa fermeture et l'état désactivé d'une tâche sans date.

La validation réelle est effectuée dans l'application Windows avec les numéros de semaine activés et désactivés, un mois à cinq puis six lignes, zéro puis beaucoup de tâches, et les thèmes clair, sombre et à fond d'écran. Elle vérifie que tous les textes restent lisibles et qu'aucune barre de défilement verticale n'apparaît dans la barre latérale à la taille PC de référence.

