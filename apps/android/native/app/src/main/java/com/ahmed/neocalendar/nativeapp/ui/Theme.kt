package com.ahmed.neocalendar.nativeapp.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ahmed.neocalendar.nativeapp.ui.theme.NeoAppearance
import com.ahmed.neocalendar.nativeapp.ui.theme.NeoFonts

/**
 * Les jetons du thème courant, lus par tous les écrans (jamais une couleur en dur). Les valeurs viennent de
 * `NeoAppearance.tokens` (état Compose : un changement de thème redessine). Voir `theme/NeoTokens.kt`.
 */
object Neo {
    private val t get() = NeoAppearance.tokens

    val Surface get() = t.surface
    val Mantle get() = t.mantle
    val Background get() = t.background
    val SettingRow get() = t.settingRow
    val Hover get() = t.hover
    val BarPress get() = t.barPress
    val Border get() = t.border
    val BorderStrong get() = t.borderStrong
    val Text get() = t.text
    val TextSecondary get() = t.textSecondary
    val TextFaint get() = t.textFaint
    val Label get() = t.label
    val SettingsValue get() = t.settingsValue
    val SettingsNote get() = t.settingsNote
    val Accent get() = t.accent
    val AccentStrong get() = t.accentStrong
    val OnAccent get() = t.onAccent
    val Today get() = t.today
    val TodayPill get() = t.todayPill
    val Danger get() = t.danger
    val Overdue get() = t.overdue
    val Success get() = t.success
    val TaskTodo get() = t.taskTodo
    val TaskDone get() = t.taskDone
    val GridLine get() = t.gridLine
    val AllDayGutterBorder get() = t.allDayGutterBorder
    val AllDayCellBorder get() = t.allDayCellBorder
    val Draft get() = t.draft
    val DraftFill get() = t.draftFill
    val HighlightWeek get() = t.highlightWeek
    val HighlightAnchor get() = t.highlightAnchor
    val ChipNeutral get() = t.chipNeutral
    val TodayColumn get() = t.todayColumn
    val CardRadius get() = t.cardRadius
    val Shadow get() = t.shadow

    /** Hauteur d'heure au repos, bornes du pincement (inventaire §1 et §6). */
    const val HOUR_HEIGHT_REST = 72f
    val TouchTarget = 48.dp
    val TopBarHeight = 64.dp
}

/**
 * Surface translucide par-dessus le fond d'écran : la couleur de surface à l'opacité des conteneurs
 * (0,40 par défaut, la même pour la barre du haut, la gouttière et la grille).
 */
fun Modifier.neoGlass(): Modifier = drawBehind {
    drawRect(Neo.Surface.copy(alpha = NeoAppearance.effects.containerOpacity))
}

@Composable
private fun neoColorScheme() = darkColorScheme(
    primary = Neo.Accent,
    onPrimary = Neo.OnAccent,
    background = Neo.Background,
    onBackground = Neo.Text,
    surface = Neo.Surface,
    onSurface = Neo.Text,
    surfaceVariant = Neo.Surface,
    onSurfaceVariant = Neo.TextSecondary,
    outline = Neo.Border,
    error = Neo.Danger,
)

@Composable
private fun neoTypography() = Typography(
    bodyLarge = TextStyle(fontFamily = NeoFonts.calendar, fontSize = 16.sp, color = Neo.Text),
    bodyMedium = TextStyle(fontFamily = NeoFonts.calendar, fontSize = 14.sp, color = Neo.Text),
    bodySmall = TextStyle(fontFamily = NeoFonts.calendar, fontSize = 12.sp, color = Neo.TextSecondary),
    titleMedium = TextStyle(fontFamily = NeoFonts.calendar, fontSize = 16.sp, fontWeight = FontWeight.Medium, color = Neo.Text),
)

@Composable
fun NeoTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = neoColorScheme(), typography = neoTypography(), content = content)
}

/** `#rrggbb` du fichier de préférences, en couleur ; accent si la chaîne est illisible. */
fun parseCalendarColor(hex: String): Color = try {
    Color(android.graphics.Color.parseColor(hex))
} catch (_: IllegalArgumentException) {
    Neo.Accent
}
