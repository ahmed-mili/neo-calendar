package com.ahmed.neocalendar.nativeapp.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.graphics.graphicsLayer
import kotlinx.coroutines.delay
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ahmed.neocalendar.nativeapp.NativeUpdates

/** La pastille de mise à jour du tiroir : le pourcentage pendant la descente, puis « Mettre à jour » une fois l'APK prêt. Rien sans mise à jour. */
@Composable
fun UpdatePill(updates: NativeUpdates) {
    val percent = updates.percent
    val ready = updates.pending.isNotEmpty()
    if (percent == null && !ready) return
    val downloading = percent != null && !ready
    Row(
        Modifier
            .height(28.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(Neo.Accent)
            .then(if (downloading) Modifier else Modifier.clickable(onClick = updates::install))
            .padding(horizontal = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(NeoIcons.Download, null, tint = Neo.OnAccent, modifier = Modifier.size(14.dp))
        Text(
            if (downloading) (if (percent!! >= 0) "$percent %" else "…") else "Mettre à jour",
            color = Neo.OnAccent,
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            modifier = Modifier.padding(start = 5.dp),
        )
    }
}

/**
 * « Rechercher les mises à jour » du tiroir : l'icône `refresh-cw` à côté de la version. Elle tourne pendant la recherche,
 * puis dit « À jour » (ou l'échec) quelques secondes ; une version trouvée apparaît dans la pastille voisine, qui l'installe.
 */
@Composable
fun UpdateCheckButton(updates: NativeUpdates) {
    val result = updates.checkResult
    val checking = result == "checking"
    val label = when (result) {
        "latest" -> "À jour"
        "debug" -> "Développement"
        null, "checking", "found" -> null
        else -> "Impossible de vérifier"
    }
    LaunchedEffect(result) {
        if (result != null && result != "checking" && result != "found") {
            delay(3_000)
            updates.clearCheck()
        }
    }
    val turn = rememberInfiniteTransition(label = "check-spin")
    val angle by turn.animateFloat(0f, 360f, infiniteRepeatable(tween(900, easing = LinearEasing)), label = "check-angle")
    if (label != null) Text(label, color = Neo.TextSecondary, fontSize = 12.sp, maxLines = 1, modifier = Modifier.padding(end = 2.dp))
    Box(
        Modifier.size(36.dp).pressFill(RoundedCornerShape(10.dp), Neo.Hover) { if (!checking) updates.check() },
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            NeoIcons.RefreshCw, "Rechercher les mises à jour", tint = Neo.TextSecondary,
            modifier = Modifier.size(18.dp).graphicsLayer { rotationZ = if (checking) angle else 0f },
        )
    }
}
