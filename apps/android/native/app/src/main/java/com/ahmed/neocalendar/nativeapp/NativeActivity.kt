package com.ahmed.neocalendar.nativeapp

import android.graphics.Color
import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import com.ahmed.neocalendar.NeoCalendarWidget
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.ahmed.neocalendar.core.workspace.StorageMode
import com.ahmed.neocalendar.nativeapp.sync.SyncController
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import com.ahmed.neocalendar.nativeapp.ui.NativeApp
import com.ahmed.neocalendar.nativeapp.ui.theme.NeoAppearance

class NativeActivity : ComponentActivity() {
    private val viewModel: NativeViewModel by viewModels()
    private lateinit var updates: NativeUpdates

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        com.ahmed.neocalendar.nativeapp.ui.Translator.load(this)
        NeoAppearance.load(this)
        // Barres transparentes sur le fond d'écran, icônes claires, contraste forcé coupé.
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
        )
        if (Build.VERSION.SDK_INT >= 29) {
            window.isNavigationBarContrastEnforced = false
            window.isStatusBarContrastEnforced = false
        }
        updates = NativeUpdates(this)
        setContent { NativeApp(viewModel, updates) }
        holdSplashUntilReady()
        consumeUpdateRetry(intent)
        // Comme la WebView : on cherche une mise à jour une fois le calendrier à l'écran, pas avant.
        lifecycleScope.launch {
            viewModel.screen.first { it !is ScreenState.Loading }
            // Un arrêt en pleine copie a pu laisser un dossier temporaire : nettoyé ici, une fois la grille affichée, jamais au lancement.
            withContext(Dispatchers.IO) { runCatching { com.ahmed.neocalendar.nativeapp.sync.StorageSwitch.cleanLeftovers(applicationContext) } }
            updates.checkOnLaunch()
            // Le moteur de synchronisation démarre APRÈS la grille, hors du fil principal ; jamais avec un dossier externe.
            if (WorkspaceLocation.mode(applicationContext) == StorageMode.Integrated) {
                withContext(Dispatchers.Default) {
                    val sync = SyncController.get(applicationContext)
                    sync.onAppStarted()
                    // L'app a pu passer en arrière-plan pendant ce temps : onStop est passé avant que le chef d'orchestre existe.
                    if (!lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) sync.onAppHidden()
                }
            }
        }
        // Une notification ou le widget peut avoir lancé l'app à froid : la route attend que le dossier soit lu. Une recréation (rotation) ne la rejoue pas.
        if (savedInstanceState == null) routeFrom(intent)
        askNotificationsOnce()
        // La minuterie des liens ICS : une minute, tant que l'app est à l'écran ; les liens dus se synchronisent, les autres non.
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                while (true) {
                    delay(60_000)
                    viewModel.syncIcsDue()
                }
            }
        }
    }

    /** L'app déjà ouverte reçoit une notification, une ligne du widget ou son « + ». */
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        consumeUpdateRetry(intent)
        routeFrom(intent)
    }

    /** « Réessayer » de la notification d'échec : le drapeau est consommé, une rotation ne le rejoue pas. */
    private fun consumeUpdateRetry(intent: Intent?) {
        if (intent == null || !intent.getBooleanExtra(NativeExtras.UPDATE_RETRY, false)) return
        intent.removeExtra(NativeExtras.UPDATE_RETRY)
        updates.retry()
    }

    /** Le splash système reste jusqu'à ce que le dossier soit lu (ou 1,5 s au plus) : pas de spinner nu entre le splash et la grille. */
    private fun holdSplashUntilReady() {
        val content = findViewById<android.view.View>(android.R.id.content)
        val deadline = android.os.SystemClock.uptimeMillis() + 1_500
        content.viewTreeObserver.addOnPreDrawListener(object : android.view.ViewTreeObserver.OnPreDrawListener {
            override fun onPreDraw(): Boolean {
                if (viewModel.screen.value is ScreenState.Loading && android.os.SystemClock.uptimeMillis() < deadline) return false
                content.viewTreeObserver.removeOnPreDrawListener(this)
                return true
            }
        })
    }

    override fun onDestroy() {
        if (::updates.isInitialized) updates.shutdown()
        super.onDestroy()
    }

    /** « + » du widget : un brouillon ; une ligne ou une notification : la fiche de l'évènement. Le drapeau est consommé, une rotation ne le rejoue pas. */
    private fun routeFrom(intent: Intent?) {
        if (intent == null) return
        if (intent.action == NeoCalendarWidget.ACTION_NEW_EVENT) {
            intent.action = null
            viewModel.openRoute(NativeRoute.NewEvent)
            return
        }
        val id = intent.getStringExtra(NativeExtras.EVENT_ID)
        if (!id.isNullOrEmpty()) {
            intent.removeExtra(NativeExtras.EVENT_ID)
            viewModel.openRoute(NativeRoute.Event(id))
        }
    }

    private val notificationPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    /** Au démarrage, une demande s'il manque l'autorisation (Android 13 et plus) ; un refus est définitif et silencieux. */
    private fun askNotificationsOnce() {
        if (Build.VERSION.SDK_INT < 33) return
        if (checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) == android.content.pm.PackageManager.PERMISSION_GRANTED) return
        notificationPermission.launch(android.Manifest.permission.POST_NOTIFICATIONS)
    }

    override fun onStart() {
        super.onStart()
        SyncController.peek()?.onAppVisible()
    }

    override fun onStop() {
        SyncController.peek()?.onAppHidden()
        super.onStop()
    }

    /** Le dossier est relu à l'ouverture et à chaque retour dans l'app (400 ms au plus rapproché). */
    override fun onResume() {
        super.onResume()
        viewModel.refreshOldApp()
        viewModel.reload()
        updates.onResume()
    }
}
