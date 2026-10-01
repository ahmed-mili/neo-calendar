package com.ahmed.neocalendar.nativeapp.ui

import android.graphics.BlurMaskFilter
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * L'ancienne n'a pas d'ondulation : l'appui est un fond plein (remarque transverse 1 de la spec). `on` garde le fond
 * tant qu'une surface ouverte par ce bouton l'est.
 */
@Composable
fun Modifier.pressFill(shape: Shape, fill: Color = Neo.BarPress, on: Boolean = false, onClick: () -> Unit): Modifier {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    return this
        .clip(shape)
        .background(if (pressed || on) fill else Color.Transparent)
        .clickable(interactionSource = source, indication = null, onClick = onClick)
}

/**
 * Une ombre CSS `0 offsetY blur color` : le flou gaussien de sigma `blur / 2` que dessinerait le navigateur, sous
 * un rectangle arrondi de rayon `radius` (le dessus doit être opaque : l'ombre est peinte sous toute la surface).
 */
fun Modifier.cssShadow(offsetY: Dp, blur: Dp, color: Color, radius: Dp = 0.dp): Modifier = drawBehind {
    // BlurMaskFilter convertit son rayon en sigma par `0,57735 x rayon + 0,5`.
    val maskRadius = ((blur.toPx() / 2f - 0.5f) / 0.57735f).coerceAtLeast(0.1f)
    val paint = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
        this.color = color.toArgb()
        maskFilter = BlurMaskFilter(maskRadius, BlurMaskFilter.Blur.NORMAL)
    }
    drawIntoCanvas {
        it.nativeCanvas.drawRoundRect(0f, offsetY.toPx(), size.width, size.height + offsetY.toPx(), radius.toPx(), radius.toPx(), paint)
    }
}
