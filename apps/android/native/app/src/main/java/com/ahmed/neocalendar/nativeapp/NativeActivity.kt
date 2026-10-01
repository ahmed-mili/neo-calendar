package com.ahmed.neocalendar.nativeapp

import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
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

    /** Le dossier est relu à l'ouverture et à chaque retour dans l'app (400 ms au plus rapproché). */
    override fun onResume() {
        super.onResume()
        viewModel.reload()
    }
}
