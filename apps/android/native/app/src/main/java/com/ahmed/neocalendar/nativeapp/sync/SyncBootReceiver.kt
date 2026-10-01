package com.ahmed.neocalendar.nativeapp.sync

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.ahmed.neocalendar.core.sync.startsAtBoot
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
        // Les réglages se lisent sans créer le chef d'orchestre : sa création lance elle-même le moteur et le service, ce qui
        // ignorerait « Démarrage automatique » et jouerait en plein lancement de l'app quand ce récepteur est réveillé alors.
        if (!SyncSettingsStore(context).value.startsAtBoot()) return
        if (WorkspaceLocation.mode(context) != StorageMode.Integrated) return
        SyncController.get(context).reconcile()
    }
}
