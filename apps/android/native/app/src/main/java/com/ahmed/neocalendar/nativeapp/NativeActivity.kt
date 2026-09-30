package com.ahmed.neocalendar.nativeapp

import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
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
    }

    /** Le dossier est relu à l'ouverture et à chaque retour dans l'app (400 ms au plus rapproché). */
    override fun onResume() {
        super.onResume()
        viewModel.reload()
    }
}
