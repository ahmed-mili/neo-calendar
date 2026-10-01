package com.ahmed.neocalendar.nativeapp.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
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
