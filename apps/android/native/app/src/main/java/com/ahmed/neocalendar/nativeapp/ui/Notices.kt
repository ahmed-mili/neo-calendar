package com.ahmed.neocalendar.nativeapp.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.clickable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.platform.LocalConfiguration
import kotlinx.coroutines.delay

/**
 * Les deux bulles de l'ancienne à la place des `Toast` : `nc-desktop-notice` (confirmation, centrée en bas,
 * 440 dp au plus) et `nc-desktop-storage-status--error` (erreur, à droite en bas, 520 dp au plus, fermée par la croix).
 */
object Notices {
    private var serial = 0
    var notice by mutableStateOf<Pair<Int, String>?>(null)
        private set
    var error by mutableStateOf<String?>(null)
        private set

    fun show(message: String) { notice = ++serial to message }
    fun fail(message: String) { error = message }
    fun clear(id: Int) { if (notice?.first == id) notice = null }
    fun dismissError() { error = null }
}

@Composable
fun NoticeHost() {
    val shown = Notices.notice
    // Une confirmation s'efface seule ; l'erreur reste jusqu'à la croix.
    LaunchedEffect(shown?.first) {
        if (shown != null) {
            delay(4_000)
            Notices.clear(shown.first)
        }
    }
    val screenWidth = LocalConfiguration.current.screenWidthDp.dp
    Box(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.navigationBars)) {
        shown?.second?.let { message ->
            Surface(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(bottom = 24.dp)
                    .widthIn(max = minOf(440.dp, screenWidth - 32.dp))
                    .shadow(24.dp, RoundedCornerShape(10.dp), ambientColor = Color.Black, spotColor = Color.Black),
                shape = RoundedCornerShape(10.dp),
                color = Neo.Surface,
                border = BorderStroke(1.dp, Neo.Border),
            ) {
                Text(message, color = Neo.Text, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp))
            }
        }
        Notices.error?.let { message ->
            Surface(
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(end = 18.dp, bottom = 18.dp)
                    .widthIn(max = minOf(520.dp, screenWidth - 36.dp))
                    .shadow(24.dp, RoundedCornerShape(11.dp), ambientColor = Color.Black, spotColor = Color.Black),
                shape = RoundedCornerShape(11.dp),
                color = Neo.Surface,
                border = BorderStroke(1.dp, Neo.Danger.copy(alpha = 0.52f)),
            ) {
                Row(
                    Modifier.padding(horizontal = 13.dp, vertical = 10.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Text(message, color = Neo.Danger, fontSize = 12.sp, modifier = Modifier.weight(1f, fill = false))
                    Box(
                        Modifier.size(20.dp).clickable(onClick = Notices::dismissError),
                        contentAlignment = Alignment.Center,
                    ) { Text("×", color = Neo.Danger, fontSize = 16.sp, textAlign = TextAlign.Center) }
                }
            }
        }
    }
}
