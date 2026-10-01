package com.ahmed.neocalendar.nativeapp.ui.fields

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import com.ahmed.neocalendar.nativeapp.ui.Icon
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import com.ahmed.neocalendar.nativeapp.ui.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.layout.offset
import androidx.compose.ui.unit.sp
import com.ahmed.neocalendar.nativeapp.ui.Neo
import com.ahmed.neocalendar.nativeapp.ui.NeoIcons

/** La colonne d'icônes du panneau : une case de 22x20 qui commence à 27 dp du bord (10 de marge + 16 de remplissage + 1 de bord), glyphes de 16 dp. */
val ICON_COLUMN_START = 27.dp
val ICON_SIZE = 22.dp
val FIELD_GAP = 6.dp

/**
 * Une ligne du panneau : le glyphe dans sa case, puis le contenu. `onClick` fait
 * de toute la ligne une cible ; `open` la dessine en surface pleine (un menu y
 * est ouvert), plus lourde que le survol — sur un écran tactile il n'y a pas de survol.
 */
@Composable
fun FieldRow(
    icon: ImageVector?,
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    open: Boolean = false,
    minHeight: Int = 44,
    iconTint: Color = Neo.TextSecondary,
    /** Les glyphes de l'ancienne tiennent en haut de leur rangée : décalage vertical du glyphe par rapport au centre. */
    iconOffset: androidx.compose.ui.unit.Dp = 0.dp,
    /** Le champ qui s'ouvre s'allume en rectangle arrondi de 6 dp, en retrait de `inset` de chaque côté (le bouton de l'ancienne a sa marge) ; le glyphe ne bouge pas. */
    inset: androidx.compose.ui.unit.Dp = 0.dp,
    /** Hauteur du rectangle allumé quand le champ est ouvert, s'il est plus bas que la rangée (les rappels de l'ancienne : 37 dp). */
    highlightHeight: androidx.compose.ui.unit.Dp? = null,
    iconSize: androidx.compose.ui.unit.Dp = 16.dp,
    leading: (@Composable () -> Unit)? = null,
    content: @Composable RowScope.() -> Unit,
) {
    val base = modifier.fillMaxWidth().padding(horizontal = inset).heightIn(min = minHeight.dp)
    val clickable = if (onClick != null) base.clickable(onClick = onClick) else base
    Row(
        (if (open) clickable.drawBehind {
            val h = highlightHeight?.toPx()?.coerceAtMost(size.height) ?: size.height
            val r = if (inset > 0.dp) 6.dp.toPx() else 0f
            drawRoundRect(Neo.Hover, androidx.compose.ui.geometry.Offset(0f, (size.height - h) / 2f), androidx.compose.ui.geometry.Size(size.width, h), androidx.compose.ui.geometry.CornerRadius(r))
        } else clickable)
            .padding(start = ICON_COLUMN_START - inset, end = if (inset > 0.dp) 8.dp else 16.dp, top = 2.dp, bottom = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(ICON_SIZE, 20.dp).offset(y = iconOffset), contentAlignment = Alignment.Center) {
            if (leading != null) leading() else if (icon != null) Icon(icon, null, tint = iconTint, modifier = Modifier.size(iconSize))
        }
        Box(Modifier.width(FIELD_GAP))
        content()
    }
}

/** Une pastille de valeur (date, heure) : contour au repos, surface pleine quand elle est ouverte. */
@Composable
fun ValuePill(
    text: String,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    open: Boolean = false,
    chevron: Boolean = false,
    color: Color = Neo.Text,
    onClick: () -> Unit,
) {
    val shape = RoundedCornerShape(10.dp)
    val base = modifier.heightIn(min = 36.dp).clip(shape)
        .background(if (open) Neo.Hover else Color.Transparent, shape)
        .border(1.dp, Neo.Border, shape)
    Row(
        (if (enabled) base.clickable(onClick = onClick) else base).padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        Text(text, color = if (enabled) color else Neo.TextFaint, fontSize = 14.sp, maxLines = 1)
        if (chevron) Icon(NeoIcons.ChevronDown, null, tint = Neo.TextSecondary, modifier = Modifier.padding(start = 6.dp).size(14.dp))
    }
}

@Composable
fun SectionLabel(text: String) {
    Text(
        text,
        color = Neo.TextFaint,
        fontSize = 12.sp,
        fontWeight = FontWeight.Medium,
        modifier = Modifier.padding(start = ICON_COLUMN_START + ICON_SIZE + FIELD_GAP, top = 10.dp, bottom = 2.dp),
    )
}

@Composable
fun NeoSwitch(checked: Boolean, enabled: Boolean = true, onChange: (Boolean) -> Unit) {
    Switch(
        checked = checked,
        onCheckedChange = onChange,
        enabled = enabled,
        colors = SwitchDefaults.colors(
            checkedThumbColor = Neo.OnAccent,
            checkedTrackColor = Neo.Accent,
            uncheckedThumbColor = Neo.TextSecondary,
            uncheckedTrackColor = Neo.Hover,
            uncheckedBorderColor = Neo.Border,
            disabledCheckedTrackColor = Neo.Accent.copy(alpha = 0.4f),
        ),
    )
}

/** Un menu déroulant aux couleurs de l'app. */
@Composable
fun NeoMenu(expanded: Boolean, onDismiss: () -> Unit, content: @Composable () -> Unit) {
    DropdownMenu(
        expanded = expanded,
        onDismissRequest = onDismiss,
        modifier = Modifier.background(Neo.Surface).border(1.dp, Neo.Border, RoundedCornerShape(12.dp)),
    ) { content() }
}

@Composable
fun NeoMenuItem(text: String, selected: Boolean = false, enabled: Boolean = true, onClick: () -> Unit) {
    DropdownMenuItem(
        enabled = enabled,
        text = { Text(text, color = if (selected) Neo.Accent else Neo.Text, fontSize = 14.sp) },
        trailingIcon = if (selected) ({ Icon(NeoIcons.Check, null, tint = Neo.Accent, modifier = Modifier.size(16.dp)) }) else null,
        onClick = onClick,
    )
}

/** Un bouton-texte de la fiche (Enregistrer, Annuler dans un dialogue...). */
@Composable
fun TextAction(text: String, modifier: Modifier = Modifier, color: Color = Neo.Accent, enabled: Boolean = true, onClick: () -> Unit) {
    val shape = RoundedCornerShape(10.dp)
    Box(
        modifier.heightIn(min = 40.dp).clip(shape).let { if (enabled) it.clickable(onClick = onClick) else it }.padding(horizontal = 14.dp),
        contentAlignment = Alignment.Center,
    ) { Text(text, color = if (enabled) color else Neo.TextFaint, fontSize = 14.sp, fontWeight = FontWeight.Medium) }
}

@Composable
fun FieldColumn(content: @Composable () -> Unit) {
    Column(Modifier.fillMaxWidth()) { content() }
}
