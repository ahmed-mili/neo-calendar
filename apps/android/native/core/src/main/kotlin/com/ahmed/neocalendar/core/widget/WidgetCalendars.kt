@file:JvmName("WidgetCalendars")

package com.ahmed.neocalendar.core.widget

/*
 * Le choix des calendriers d'un widget (ajout du natif, sans équivalent TypeScript).
 *
 * `chosen` est la liste des calendriers retenus pour CE widget, ou null quand rien n'a été enregistré :
 * un widget posé avant le choix, ou dont la configuration n'a pas eu lieu, montre tout. Une fois un choix
 * enregistré, un calendrier créé plus tard n'y figure pas : c'est une liste de retenus, pas d'exclus.
 */

/** Vrai si une ligne du calendrier [calendarId] doit s'afficher dans un widget dont le choix est [chosen]. */
fun isCalendarShown(calendarId: String?, chosen: Set<String>?): Boolean =
    chosen == null || (calendarId != null && calendarId in chosen)
