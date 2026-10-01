package com.ahmed.neocalendar.nativeapp

import android.app.Activity
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.ahmed.neocalendar.AppUpdater
import java.util.concurrent.Executors

/**
 * La mise à jour intégrée (`AppUpdater`, resté en Java) vue de Compose : la version prête, la progression
 * du téléchargement, et le résultat d'une recherche demandée à la main. L'updater cherche et descend tout
 * seul, comme dans la WebView ; poser l'APK reste un geste.
 */
class NativeUpdates(activity: Activity) {
    /** La version descendue et vérifiée, « » s'il n'y en a pas. */
    var pending by mutableStateOf(AppUpdater.pendingVersion())
        private set

    /** 0..100 pendant le téléchargement, -1 si la taille est inconnue, null sinon. */
    var percent by mutableStateOf<Int?>(null)
        private set

    /** Ce que la dernière recherche manuelle a trouvé, null avant la première. */
    var checkResult by mutableStateOf<String?>(null)
        private set

    private val io = Executors.newFixedThreadPool(2)
    private val updater = AppUpdater(activity, io).also { updater ->
        updater.setOnUpdateFound { pending = AppUpdater.pendingVersion() }
        updater.setOnProgress { value -> percent = if (value == -2) null else value }
    }

    fun checkOnLaunch() = updater.checkOnLaunch()

    fun onResume() {
        updater.resumePendingInstall()
        updater.checkOnResume()
    }

    fun install() = updater.installReady()

    fun retry() = updater.retryLastDownload()

    fun check() {
        checkResult = "checking"
        updater.checkNow { checkResult = it }
    }

    /** Efface le résultat affiché (il ne reste à l'écran que quelques secondes). */
    fun clearCheck() {
        if (checkResult != "checking") checkResult = null
    }

    fun shutdown() {
        io.shutdownNow()
    }
}
