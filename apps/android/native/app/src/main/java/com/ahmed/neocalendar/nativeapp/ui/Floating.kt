package com.ahmed.neocalendar.nativeapp.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntRect
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import android.os.Build
import android.view.WindowManager
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.DialogWindowProvider
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupPositionProvider
import androidx.compose.ui.window.PopupProperties
import com.ahmed.neocalendar.nativeapp.ui.theme.NeoFonts
import kotlin.math.max

/**
 * Un dialogue à la façon de l'ancienne : un voile `rgba(8,9,18,.72)` sur tout l'écran (jetons `Veil`), la carte posée
 * où `alignment` la met. Un appui sur le voile ferme ; la carte garde ses propres appuis (`NeoModalCard`).
 * Le flou 7 px derrière le voile vient de `FLAG_BLUR_BEHIND` (Android 12 et plus).
 */
@Composable
fun NeoModal(
    onDismiss: () -> Unit,
    alignment: Alignment = Alignment.Center,
    /** Vrai : la carte évite les barres système. Faux (défaut) : elle se centre sur tout l'écran, comme `position: fixed; inset: 0`. */
    insets: Boolean = false,
    /** Faux : pas de voile (le dialogue « Ajouter un lien » de la description n'en a pas), un appui dehors ferme quand même. */
    veil: Boolean = true,
    content: @Composable BoxScope.() -> Unit,
) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false),
    ) {
        val window = (LocalView.current.parent as? DialogWindowProvider)?.window
        val blurPx = with(LocalDensity.current) { 7.dp.roundToPx() }
        SideEffect {
            window?.setDimAmount(0f)
            // Le `backdrop-filter: blur(5 à 7px)` des voiles de l'ancienne : flou de fenêtre d'Android 12 (sans effet en dessous).
            if (window != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && veil) {
                window.addFlags(WindowManager.LayoutParams.FLAG_BLUR_BEHIND)
                window.attributes = window.attributes.also { it.blurBehindRadius = blurPx }
            }
        }
        Box(
            Modifier
                .fillMaxSize()
                .background(if (veil) Neo.Veil else Color.Transparent)
                .pointerInput(Unit) { detectTapGestures { onDismiss() } }
                .let { if (insets) it.windowInsetsPadding(WindowInsets.safeDrawing) else it.imePadding() },
            contentAlignment = alignment,
        ) { content() }
    }
}

/** Le dessus d'une carte de dialogue : avale les appuis pour que le voile ne se ferme pas dessous. */
fun Modifier.consumeTaps(): Modifier = pointerInput(Unit) { detectTapGestures { } }

/**
 * Le menu flottant de l'ancienne (`.nc-cal-menu`) : fond `Surface`, bord 1 px, rayon 10, padding 4, ombre portée ;
 * posé sous son ancre, aligné à droite, retourné au-dessus quand il manque la place. À placer dans la `Box` de l'ancre.
 */
@Composable
fun NeoPopupMenu(
    expanded: Boolean,
    onDismiss: () -> Unit,
    minWidth: Dp = 230.dp,
    content: @Composable ColumnScope.() -> Unit,
) {
    if (!expanded) return
    val density = LocalDensity.current
    val provider = remember(density) {
        MenuPositionProvider(with(density) { 8.dp.roundToPx() }, with(density) { 4.dp.roundToPx() }, with(density) { 14.dp.roundToPx() })
    }
    Popup(popupPositionProvider = provider, onDismissRequest = onDismiss, properties = PopupProperties(focusable = true, clippingEnabled = false)) {
        val shape = RoundedCornerShape(10.dp)
        // La fenêtre du menu s'arrête à son contenu : la marge laisse la place à l'ombre.
        Box(Modifier.padding(14.dp)) {
            Column(
                Modifier
                    .widthIn(min = minWidth, max = 320.dp)
                    .width(IntrinsicSize.Max)
                    .shadow(12.dp, shape, ambientColor = Color.Black.copy(alpha = 0.22f), spotColor = Color.Black.copy(alpha = 0.4f))
                    .background(Neo.Surface, shape)
                    .border(1.dp, Neo.Border, shape)
                    .padding(4.dp),
                verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(1.dp),
            ) { content() }
        }
    }
}

private class MenuPositionProvider(private val margin: Int, private val gap: Int, private val shadow: Int) : PopupPositionProvider {
    override fun calculatePosition(anchorBounds: IntRect, windowSize: IntSize, layoutDirection: LayoutDirection, popupContentSize: IntSize): IntOffset {
        // La fenêtre du menu déborde de `shadow` de chaque côté de la carte (la place de l'ombre) : on place la carte, pas la fenêtre.
        val cardW = popupContentSize.width - 2 * shadow
        val cardH = popupContentSize.height - 2 * shadow
        val left = (anchorBounds.right - cardW).coerceIn(margin, max(margin, windowSize.width - cardW - margin))
        var top = anchorBounds.bottom + gap
        if (top + cardH > windowSize.height - margin) top = anchorBounds.top - gap - cardH
        top = top.coerceIn(margin, max(margin, windowSize.height - cardH - margin))
        return IntOffset(left - shadow, top - shadow)
    }
}

/**
 * Une ligne de menu : icône 16 dp (ou carré de couleur 13 dp), libellé, valeur et coche à droite. Danger en `Danger`.
 * Appui = fond `Hover`, sans ondulation.
 */
@Composable
fun MenuRow(
    label: String,
    icon: ImageVector? = null,
    swatch: Color? = null,
    danger: Boolean = false,
    value: String? = null,
    checked: Boolean = false,
    chevron: Boolean = false,
    enabled: Boolean = true,
    muted: Boolean = false,
    onClick: () -> Unit,
) {
    val shape = RoundedCornerShape(6.dp)
    val tint = if (danger) Neo.Danger else Neo.TextSecondary
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 34.dp)
            .alpha(if (enabled) 1f else 0.45f)
            .let { if (enabled) it.pressFill(shape, Neo.Hover, onClick = onClick) else it.clip(shape) }
            .padding(horizontal = 10.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (swatch != null) {
            Box(Modifier.size(16.dp), contentAlignment = Alignment.Center) {
                Box(Modifier.size(13.dp).background(swatch, RoundedCornerShape(4.dp)).border(1.dp, Color.White.copy(alpha = 0.12f), RoundedCornerShape(4.dp)))
            }
        } else if (icon != null) {
            Icon(icon, null, tint = tint, modifier = Modifier.size(16.dp))
        }
        Text(
            label,
            color = if (danger) Neo.Danger else if (muted) Neo.TextFaint else Neo.Text,
            fontSize = 16.sp,
            fontFamily = NeoFonts.inter,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(start = if (swatch != null || icon != null) 10.dp else 0.dp).weight(1f),
        )
        if (value != null) Text(value, color = Neo.TextSecondary, fontSize = 12.sp, fontFamily = NeoFonts.inter, modifier = Modifier.padding(start = 10.dp))
        if (checked) Icon(NeoIcons.Check, null, tint = Neo.Accent, modifier = Modifier.padding(start = 6.dp).size(14.dp))
        if (chevron) Icon(NeoIcons.ChevronRight, null, tint = Neo.TextSecondary, modifier = Modifier.padding(start = 6.dp).size(14.dp))
    }
}

/** Un filet horizontal de 1 dp dans la couleur de bordure. */
@Composable
fun HairlineH(modifier: Modifier = Modifier) {
    Box(modifier.fillMaxWidth().height(1.dp).background(Neo.Border))
}
