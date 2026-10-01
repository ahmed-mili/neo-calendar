package com.ahmed.neocalendar.nativeapp.ui.fields

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import com.ahmed.neocalendar.nativeapp.ui.Icon
import com.ahmed.neocalendar.nativeapp.ui.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntRect
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupPositionProvider
import androidx.compose.ui.window.PopupProperties
import com.ahmed.neocalendar.nativeapp.ui.Neo
import com.ahmed.neocalendar.nativeapp.ui.NeoIcons
import com.ahmed.neocalendar.nativeapp.ui.pressFill
import kotlin.math.max

/** La surface d'un popover de la fiche : le fond, le bord, le rayon et l'ombre que la feuille de style donne à chacun. */
class PopoverSurface(val fill: Color, val radius: Dp, val padding: Dp, val shadowed: Boolean, val gap: Dp = 0.dp)

/** `.nc-cal-select-menu` : verre `rgba(30,30,46,.9)` flouté de 12 px sur la fiche, qui est elle-même opaque : la surface pleine donne le même aplat (mesuré 28,28,44 des deux côtés). Rayon 12, gap 1. */
val GlassSurface get() = PopoverSurface(Neo.Surface, 12.dp, 5.dp, true, gap = 1.dp)

/** `.nc-panel-kind-menu` : surface pleine, bord, rayon 7, padding 4. */
val SolidSurface get() = PopoverSurface(Neo.Surface, 7.dp, 4.dp, true)

/**
 * Un popover posé sous son ancre (à placer dans la `Box` de l'ancre), retourné au-dessus quand la place manque. `width` :
 * sa largeur, ou celle de l'ancre quand elle est nulle.
 */
@Composable
fun Popover(
    expanded: Boolean,
    onDismiss: () -> Unit,
    surface: PopoverSurface = GlassSurface,
    width: Dp? = null,
    alignEnd: Boolean = false,
    focusable: Boolean = true,
    /** Le bas de l'ancre de l'ancienne est plus bas que celui du champ qui ouvre (`.nc-panel-date-options` entoure Répéter). */
    anchorOffset: Dp = 0.dp,
    /** Le champ qui ouvre est en retrait de chaque côté : le menu prend sa largeur et son bord gauche (`width` en est déjà réduit). */
    anchorInset: Dp = 0.dp,
    /** Centré sur la fenêtre plutôt qu'aligné sur l'ancre (le sélecteur de date se centre sur la fiche : `EventPanelRows.tsx`). */
    centerX: Boolean = false,
    content: @Composable ColumnScope.() -> Unit,
) {
    if (!expanded) return
    val density = LocalDensity.current
    // La fenêtre ne dépasse pas l'écran : sur une carte large, la marge d'ombre latérale se réduit pour que la carte garde sa largeur.
    val screenWidth = androidx.compose.ui.platform.LocalConfiguration.current.screenWidthDp.dp
    val side = if (width != null) minOf(16.dp, ((screenWidth - width) / 2).coerceAtLeast(0.dp)) else 16.dp
    val provider = remember(density, alignEnd, side, anchorOffset, anchorInset, centerX) {
        PopoverPosition(
            with(density) { 8.dp.roundToPx() }, with(density) { (4.dp + anchorOffset).roundToPx() },
            with(density) { side.roundToPx() }, with(density) { 16.dp.roundToPx() }, alignEnd, with(density) { anchorInset.roundToPx() }, centerX,
        )
    }
    Popup(popupPositionProvider = provider, onDismissRequest = onDismiss, properties = PopupProperties(focusable = focusable, clippingEnabled = false)) {
        val shape = RoundedCornerShape(surface.radius)
        Box(Modifier.padding(horizontal = side, vertical = 16.dp)) {
            Column(
                (if (width != null) Modifier.width(width) else Modifier)
                    .let { if (surface.shadowed) it.shadow(12.dp, shape, ambientColor = Color.Black.copy(alpha = 0.2f), spotColor = Color.Black.copy(alpha = 0.35f)) else it }
                    .background(surface.fill, shape)
                    .border(1.dp, Neo.Border, shape)
                    .padding(surface.padding),
                verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(surface.gap),
            ) { content() }
        }
    }
}

private class PopoverPosition(private val margin: Int, private val gap: Int, private val shadow: Int, private val shadowY: Int, private val alignEnd: Boolean, private val insetX: Int = 0, private val centered: Boolean = false) : PopupPositionProvider {
    override fun calculatePosition(anchorBounds: IntRect, windowSize: IntSize, layoutDirection: LayoutDirection, popupContentSize: IntSize): IntOffset {
        val cardW = popupContentSize.width - 2 * shadow
        val cardH = popupContentSize.height - 2 * shadowY
        val rawLeft = if (centered) (windowSize.width - cardW) / 2 else if (alignEnd) anchorBounds.right - cardW else anchorBounds.left + insetX
        val left = rawLeft.coerceIn(margin, max(margin, windowSize.width - cardW - margin))
        var top = anchorBounds.bottom + gap
        if (top + cardH > windowSize.height - margin) top = anchorBounds.top - gap - cardH
        top = top.coerceIn(margin, max(margin, windowSize.height - cardH - margin))
        return IntOffset(left - shadow, top - shadowY)
    }
}

/**
 * Une entrée de popover : `height` dp, rayon `radius`, libellé `textSize`, coche (à gauche ou à droite), icône ou pastille.
 * Active : fond `rgba(49,50,68,.78)`. Appui : fond plein, sans ondulation.
 */
@Composable
fun PopoverEntry(
    label: String,
    height: Dp,
    textSize: Int = 16,
    radius: Dp = 8.dp,
    active: Boolean = false,
    checkAtStart: Boolean = false,
    icon: ImageVector? = null,
    swatch: Color? = null,
    color: Color = Neo.Text,
    iconTint: Color = Neo.TextSecondary,
    hint: String? = null,
    hintAfterLabel: Boolean = false,
    horizontalPadding: Dp = 10.dp,
    rich: androidx.compose.ui.text.AnnotatedString? = null,
    onClick: () -> Unit,
) {
    val shape = RoundedCornerShape(radius)
    Row(
        Modifier.fillMaxWidth().heightIn(min = height)
            .background(if (active && !checkAtStart) Neo.Hover.copy(alpha = 0.78f) else Color.Transparent, shape)
            .pressFill(shape, Neo.Hover, onClick = onClick)
            .padding(horizontal = if (checkAtStart) 8.dp else horizontalPadding),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (checkAtStart) {
            // Coche de 14 dp au bord gauche de la rangée (8 dp) ; le texte (ou la pastille) reprend à la même place qu'avant.
            Box(Modifier.size(if (swatch != null) 21.5.dp else 24.dp, 22.dp), contentAlignment = Alignment.CenterStart) {
                if (active) Icon(NeoIcons.Check, null, tint = Neo.Text, modifier = Modifier.size(14.dp))
            }
        }
        if (swatch != null) Box(Modifier.padding(end = if (checkAtStart) 8.5.dp else 10.dp).size(10.dp).background(swatch, RoundedCornerShape(3.dp)))
        if (icon != null) Icon(icon, null, tint = iconTint, modifier = Modifier.padding(end = 10.dp).size(15.dp))
        if (rich != null) Text(rich, fontSize = textSize.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = true))
        else Text(label, color = color, fontSize = textSize.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = if (hintAfterLabel) Modifier else Modifier.weight(1f, fill = true))
        if (hint != null && hintAfterLabel) { Text(hint, color = Neo.TextSecondary, fontSize = 13.sp, modifier = Modifier.padding(start = 8.dp).weight(1f)) }
        else if (hint != null) Text(hint, color = Neo.TextFaint, fontSize = 13.sp, modifier = Modifier.padding(start = 8.dp))
        if (!checkAtStart && active) Icon(NeoIcons.Check, null, tint = Neo.Text, modifier = Modifier.padding(start = 6.dp).size(14.dp))
    }
}

/** Le titre d'un popover (« Calendrier », « Répéter ») : 11 sp / 600, interlettrage .33. */
@Composable
fun PopoverHeading(text: String) {
    Text(
        text,
        color = Neo.TextFaint, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.33.sp,
        modifier = Modifier.padding(start = 30.dp, end = 8.dp, top = 6.3.dp, bottom = 6.5.dp),
    )
}

/** La largeur de l'ancre d'un popover, mesurée : `.nc-cal-select-menu` prend celle de sa ligne. */
class AnchorWidth(val width: Dp, val track: Modifier)

@Composable
fun rememberAnchorWidth(fallback: Dp = 300.dp): AnchorWidth {
    val density = LocalDensity.current
    var width by remember { androidx.compose.runtime.mutableStateOf(fallback) }
    return AnchorWidth(width, Modifier.onSizeChanged { width = with(density) { it.width.toDp() } })
}
