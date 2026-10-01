package com.ahmed.neocalendar

import android.content.Context
import android.content.pm.PackageManager
import com.ahmed.neocalendar.core.migration.NEW_APP_PACKAGE
import com.ahmed.neocalendar.core.migration.hasMovedOn

/**
 * Cette app est la dernière sous l'ancien nom : si `com.ahmedmili.neocalendar` est installée, elle lui laisse
 * rappels et widget (sinon chaque rappel sonnerait deux fois). Visibilité du paquet : `<queries>` du manifeste.
 */
object Coexistence {
    @JvmStatic
    fun newAppInstalled(context: Context): Boolean = try {
        context.packageManager.getPackageInfo(NEW_APP_PACKAGE, 0)
        true
    } catch (_: PackageManager.NameNotFoundException) {
        false
    }

    @JvmStatic
    fun moved(context: Context): Boolean = hasMovedOn(newAppInstalled(context))

    /** Au lancement : annule l'alarme en cours si la nouvelle app est là (`schedule` s'en charge) ; rend vrai si c'est le cas. */
    @JvmStatic
    fun enforce(context: Context): Boolean {
        val moved = moved(context)
        if (moved) ReminderScheduler.schedule(context)
        return moved
    }
}
