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
import com.ahmed.neocalendar.MainActivity
import com.ahmed.neocalendar.NeoCalendarWidget
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import com.ahmed.neocalendar.nativeapp.ui.NativeApp

private const val BACKGROUND = 0xFF11111B.toInt()

class NativeActivity : ComponentActivity() {
    private val viewModel: NativeViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(BACKGROUND),
            navigationBarStyle = SystemBarStyle.dark(BACKGROUND),
        )
        setContent { NativeApp(viewModel) }
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
        routeFrom(intent)
    }

    /** « + » du widget : un brouillon ; une ligne ou une notification : la fiche de l'évènement. Le drapeau est consommé, une rotation ne le rejoue pas. */
    private fun routeFrom(intent: Intent?) {
        if (intent == null) return
        if (intent.action == NeoCalendarWidget.ACTION_NEW_EVENT) {
            intent.action = null
            viewModel.openRoute(NativeRoute.NewEvent)
            return
        }
        val id = intent.getStringExtra(MainActivity.EXTRA_EVENT_ID)
        if (!id.isNullOrEmpty()) {
            intent.removeExtra(MainActivity.EXTRA_EVENT_ID)
            viewModel.openRoute(NativeRoute.Event(id))
        }
    }

    private val notificationPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    /** Comme `MainActivity` : au démarrage, une demande s'il manque l'autorisation (Android 13 et plus) ; un refus est définitif et silencieux. */
    private fun askNotificationsOnce() {
        if (Build.VERSION.SDK_INT < 33) return
        if (checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) == android.content.pm.PackageManager.PERMISSION_GRANTED) return
        notificationPermission.launch(android.Manifest.permission.POST_NOTIFICATIONS)
    }

    /** Le dossier est relu à l'ouverture et à chaque retour dans l'app (400 ms au plus rapproché). */
    override fun onResume() {
        super.onResume()
        viewModel.reload()
    }
}
