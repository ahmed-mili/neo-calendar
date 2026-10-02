package com.ahmed.neocalendar.nativeapp.sync

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.graphics.drawable.Icon
import android.os.IBinder
import android.util.Log
import androidx.core.content.ContextCompat
import com.ahmed.neocalendar.R
import com.ahmed.neocalendar.core.sync.StatusLine
import com.ahmed.neocalendar.nativeapp.NativeActivity
import com.ahmed.neocalendar.nativeapp.ui.tr
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch

/**
 * Le service au premier plan de type `specialUse` (comme Syncthing-Fork : il échappe à la limite de 6 h par 24 h
 * qu'Android 15 impose au type `dataSync`) : il garde le processus en vie tant que le moteur doit tourner, avec une
 * notification permanente. Il ne fait rien d'autre : le moteur est piloté par [SyncController].
 */
class SyncService : Service() {
    private var scope: CoroutineScope? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        running = true
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val controller = SyncController.get(this)
        if (intent?.action == ACTION_QUIT) {
            controller.quit()
            stopSelf()
            return START_NOT_STICKY
        }
        createChannel()
        val notification = notification(controller)
        if (Build.VERSION.SDK_INT >= 34) startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        else startForeground(NOTIFICATION_ID, notification)
        if (scope == null) {
            val s = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
            scope = s
            val manager = getSystemService(NotificationManager::class.java)
            s.launch { combine(controller.status, controller.progress) { a, b -> a to b }.collect { manager.notify(NOTIFICATION_ID, notification(controller)) } }
        }
        return START_STICKY
    }

    override fun onDestroy() {
        running = false
        scope?.cancel()
        scope = null
        super.onDestroy()
    }

    private fun createChannel() {
        val channel = NotificationChannel(CHANNEL_ID, tr("Synchronisation"), NotificationManager.IMPORTANCE_LOW)
        channel.setShowBadge(false)
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    private fun notification(controller: SyncController): Notification {
        val open = PendingIntent.getActivity(
            this, 0, Intent(this, NativeActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val builder = Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title(controller))
            .apply { if (controller.status.value !is StatusLine.Syncing && controller.status.value != StatusLine.UpToDate) setContentText(tr(controller.status.value.text())) }
            .setContentIntent(open)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(Notification.CATEGORY_SERVICE)
        // Avec le démarrage automatique, « Quitter » n'a pas de sens : le moteur redémarrerait à l'allumage (comme Syncthing-Fork).
        if (!controller.settings.value.autoStart) {
            val quit = PendingIntent.getService(
                this, 1, Intent(this, SyncService::class.java).setAction(ACTION_QUIT),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )
            builder.addAction(Notification.Action.Builder(Icon.createWithResource(this, R.drawable.ic_notification), tr("Quitter"), quit).build())
        }
        return builder.build()
    }

    /** Le titre de la notification : « Synchronise : 97 % complet, 1 appareil connecté » comme Syncthing-Fork ; « À jour, N appareil(s) connecté(s) » au repos. */
    private fun title(controller: SyncController): String {
        val status = controller.status.value
        val p = controller.progress.value
        val devices = if (p.connected == 1) "1 appareil connecté" else "${p.connected} appareils connectés"
        return tr(
            when (status) {
                is StatusLine.Syncing -> "Synchronise : ${p.percent} % complet, $devices"
                StatusLine.UpToDate -> "À jour, $devices"
                else -> "Neo Calendar"
            },
        )
    }

    companion object {
        private const val CHANNEL_ID = "neo_sync"
        private const val NOTIFICATION_ID = 4242
        private const val ACTION_QUIT = "com.ahmed.neocalendar.sync.QUIT"

        /** Vrai tant que le service existe : on ne le redémarre pas depuis l'arrière-plan (Android 12+ le refuse). */
        @Volatile private var running = false

        fun start(context: Context) {
            if (running) return
            try {
                ContextCompat.startForegroundService(context, Intent(context, SyncService::class.java))
            } catch (e: Exception) {
                // Démarrage au premier plan refusé (app en arrière-plan sans exemption) : le moteur tourne quand même, sans service.
                Log.w("NeoSyncService", "service non démarré", e)
            }
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, SyncService::class.java))
        }
    }
}
