package com.ahmed.neocalendar.nativeapp.sync

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.ahmed.neocalendar.core.sync.RunMode
import com.ahmed.neocalendar.core.workspace.StorageMode
import com.ahmed.neocalendar.nativeapp.WorkspaceLocation

/**
 * À l'allumage du téléphone (ou après une mise à jour de l'app), relance la synchronisation, mais seulement si l'utilisateur
 * a activé « Démarrage automatique » (désactivé par défaut, comme dans Syncthing-Fork), en mode « Comme Syncthing-Fork »,
 * avec le stockage privé et au moins un appareil appairé. Sinon : rien, et le processus n'est même pas réveillé plus que ça.
 */
class SyncBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED && intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return
        if (WorkspaceLocation.mode(context) != StorageMode.Integrated) return
        val controller = SyncController.get(context)
        val s = controller.settings.value
        if (s.configured && s.autoStart && s.runMode == RunMode.LikeFork && !s.quit) controller.reconcile()
    }
}
