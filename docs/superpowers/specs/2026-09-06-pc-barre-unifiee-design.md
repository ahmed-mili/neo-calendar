# Barre supérieure unifiée de Neo Calendar sur Windows

## Demande et référence

Demande d’Ahmed du 6 septembre 2026 : reproduire l’organisation de la barre
supérieure de Notion Calendar, les menus présentés et la navigation par période.
Ce document accompagne le plan demandé avec `superpowers:writing-plans`.

Référence : [capture annotée](assets/2026-09-06-pc-barre-unifiee.png).
La capture et les annotations d’Ahmed priment sur les choix techniques ci-dessous.

## Résultat attendu

- Une seule ligne en haut de la fenêtre Windows, sans seconde barre de titre.
- À gauche : chevron du menu, bouton de panneau latéral, recherche et création.
  Réutiliser les actions actuelles ; l’icône de création visible dans Notion ouvre
  `openNewEvent` dans Neo Calendar.
- À droite : contrôle des mises à jour quand nécessaire, sélecteur de vue,
  Aujourd’hui, précédent/suivant, puis réduire, agrandir/restaurer et fermer.
- Le titre du mois reste sous cette ligne. Le regroupement ne remonte pas le mois
  dans la barre et ne crée pas d’avatar ou de service de compte.
- Le menu et les commandes de fenêtre restent accessibles quand la barre latérale
  est repliée. Les commandes de fenêtre existent aussi au chargement, sur l’accueil
  et après une erreur React.
- Les surfaces gardent le thème choisi dans Neo Calendar. La géométrie, la densité,
  les alignements, les icônes et les sous-menus suivent la capture.

## Menu d’application

Le chevron ouvre au survol un menu à trois rubriques exactement : Neo Calendar,
Modifier, Afficher. Pas de rubrique Aide. Le clic et le clavier ouvrent aussi le menu.
Le survol d’une rubrique ouvre son sous-menu latéral, sans fermeture au passage
entre les deux surfaces. Échap referme le niveau courant puis le menu ; un clic
extérieur referme le tout et le focus revient au contrôle d’origine.

| Rubrique | Entrées dans l’ordre |
|---|---|
| Neo Calendar | `v` + version réelle ; Rechercher les mises à jour… ; Paramètres… |
| Modifier | Annuler l’action ; Rétablir ; séparateur ; Couper ; Copier ; Coller ; Coller et respecter le style ; Supprimer ; Sélectionner tous les éléments visibles ; Dupliquer |
| Afficher | Espacement des heures par défaut ; Augmenter l’espacement des heures ; Réduire l’espacement des heures ; séparateur ; Échelle de l’interface ; Relancer ; Forcer le rafraîchissement ; Afficher les outils de développement ; séparateur ; Basculer en plein écran |

La version vient de `appVersion()`. Elle remplace la ligne À propos, n’ouvre pas de
dialogue et disparaît de son ancien emplacement Windows. L’engrenage de la barre
est remplacé par Paramètres dans ce menu. La mise à jour automatique et le dialogue
d’installation restent ceux de l’application ; la recherche manuelle ne lance pas
l’installation à elle seule. Les entrées indisponibles sont désactivées.

Les raccourcis affichés et exécutés sont : Ctrl+Z, Ctrl+Y, Ctrl+X, Ctrl+C, Ctrl+V,
Ctrl+Maj+V, Retour arrière, Ctrl+A, Ctrl+D ; Ctrl+Virgule pour Paramètres ;
Ctrl+Maj+0, Ctrl+Maj+Point, Ctrl+Maj+Virgule pour l’espacement ; Ctrl+R,
Ctrl+Maj+R, Ctrl+Alt+I et F11 pour les quatre dernières actions concernées.
Suppr reste un alias de suppression. Vérifier les accords de ponctuation sur AZERTY.

## Navigation et édition

| Vue | Pas de précédent/suivant, bouton et clavier |
|---|---|
| Jour | 1 jour |
| 3 jours | 3 jours |
| Nombre de jours | Nombre actuellement choisi |
| Semaine | 7 jours |
| Liste | 7 jours, conformément au comportement actuel |
| Mois | Un mois civil, ancré sur son premier jour |

Les flèches horizontales n’agissent pas dans un champ, une sélection de texte,
un menu, un dialogue ou pendant une composition IME. Les touches J/K et [/]
actuelles restent disponibles. Ni déplacement de curseur ni navigation dans un
sous-menu ne doit changer la date du calendrier.

Modifier agit sur le champ qui avait le focus avant l’ouverture du menu, sinon sur
la sélection d’évènements. Conserver les règles actuelles de calendrier éditable,
de récurrence et de presse-papiers. Tout sélectionner concerne les occurrences qui
recouvrent la plage visible ; exclure les calendriers masqués et le tampon de
préchargement de ±7 jours. La lecture seule n’empêche pas sélection et copie.

**Hypothèse de périmètre pour Annuler/Rétablir :** conserver l’annulation actuelle
des suppressions de fichiers d’évènements et ajouter son rétablissement, à un
niveau. L’éditeur de texte garde son historique natif. Un historique général de
création, déplacement et modification n’est pas inclus dans cette hypothèse.
Une question a été envoyée à Ahmed pendant la planification ; sa réponse, si elle
élargit ce périmètre, impose de mettre à jour la tâche d’historique avant exécution.

## Affichage et comportement de fenêtre

L’espacement modifie la même hauteur d’heure que Ctrl+molette : bornes existantes,
facteur existant de 1,1 et retour à `restingHourHeight()`. Préserver le point situé
au centre vertical du viewport pour une commande de menu ou de clavier. Le zoom
de l’interface est indépendant : paliers proposés 80 %, 90 %, 100 %, 110 %, 125 %,
150 %, 175 %, 200 %. Ces paliers sont un choix d’implémentation, le sous-menu
détaillé n’étant pas montré dans la référence. Mémoriser ce réglage localement
sur Windows, sans le synchroniser avec Android.

Relancer recharge l’interface. Forcer le rafraîchissement recharge ses ressources
sans cache HTTP ; ce n’est pas une suppression de cookies, de préférences, de
fichiers ou de données du calendrier. Les outils de développement fonctionnent
dans la distribution Windows, où la feature Tauri `devtools` existe déjà.

La surface vide de la barre déplace la fenêtre ; le double clic agrandit/restaure.
Les boutons et menus ne sont jamais des zones de déplacement. Conserver le
redimensionnement, Alt+F4 et la navigation Windows. Vérifier les commandes à
différentes échelles d’affichage et en plein écran dans la vraie application.

## Architecture retenue

Une barre React Windows composée autour du `CalendarHeader` existant. Le layout
partagé reçoit un slot facultatif pour cette barre et masque alors uniquement ses
anciens contrôles supérieurs. Il ne connaît aucune API Tauri. Le point d’entrée
Windows fournit les commandes de fenêtre dans un shell qui survit au chargement
et aux erreurs ; Android conserve son point d’entrée et son rendu actuels.

Un petit registre de commandes relie menu et raccourcis aux callbacks existants
de `DesktopCalendar`. Les opérations natives passent par les API Tauri installées.
Un module Rust Windows borné expose l’édition native de WebView2 et le
rafraîchissement sans cache ; aucun protocole arbitraire n’est accepté du frontend.

Les alternatives écartées sont la conservation de la barre native, qui laisserait
deux lignes, et le remplacement intégral des composants partagés, qui dupliquerait
le sélecteur de vue et toucherait inutilement Android.

## Contraintes globales

- Cible : application Windows. Aucun changement de comportement Android ou Obsidian.
- React 17, TypeScript, Jest et Tauri 2 déjà installés ; pas de nouvelle bibliothèque UI.
- Seule dépendance directe supplémentaire envisagée : `webview2-com = "=0.38.2"`,
  déjà résolue à cette version dans Cargo.lock, pour le pont natif Windows.
- Réutiliser les icônes existantes puis Lucide installé ; aucune icône dessinée au hasard.
- Traductions via `t()` et `src/ui/i18n.ts` ; version via `appVersion()`.
- Pas de refonte générale de `DesktopCalendar.tsx` ni de la synchronisation ICS.
- Ne pas écraser les modifications locales présentes au début de l’exécution.
- La livraison exige des tests de comportement et une comparaison visuelle Tauri.
- `git ship` est exécuté par Ahmed, jamais automatiquement par ce plan.

## Critères de réception

Le résultat montre une seule barre et les trois sous-menus conformes à la capture.
Chaque entrée active effectue réellement l’action annoncée. Les flèches suivent
le pas de chaque vue, y compris après un défilement horizontal. Les contrôles
restent visibles à 960 px et en fenêtre agrandie. Le menu fonctionne à la souris
et au clavier, en thème clair et sombre. Les tests Android existants et les builds
Windows/Android passent. Les essais de suppression utilisent un dossier temporaire.
