package com.ahmed.neocalendar.nativeapp.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** Catppuccin Mocha, le thème par défaut de l'inventaire §6. */
object Neo {
    val Accent = Color(0xFF658FF2)
    val Surface = Color(0xFF1E1E2E)
    val Background = Color(0xFF11111B)
    val Text = Color(0xFFC6D0F5)
    val TextSecondary = Color(0xFFA6ADC8)
    val TextFaint = Color(0xFF6C7086)
    val Today = Color(0xFFF5544F)
    val Border = Color(0x14FFFFFF)
    val GridLine = Color(0x1AFFFFFF)
    val Hover = Color(0x14FFFFFF)

    /** Hauteur d'heure au repos, bornes du pincement (inventaire §1 et §6). */
    const val HOUR_HEIGHT_REST = 72f
    val TouchTarget = 48.dp
    val TopBarHeight = 64.dp
}

private val NeoColors = darkColorScheme(
    primary = Neo.Accent,
    onPrimary = Neo.Background,
    background = Neo.Background,
    onBackground = Neo.Text,
    surface = Neo.Surface,
    onSurface = Neo.Text,
    surfaceVariant = Neo.Surface,
    onSurfaceVariant = Neo.TextSecondary,
    outline = Neo.Border,
)

private val NeoTypography = Typography(
    bodyLarge = TextStyle(fontSize = 16.sp, color = Neo.Text),
    bodyMedium = TextStyle(fontSize = 14.sp, color = Neo.Text),
    bodySmall = TextStyle(fontSize = 12.sp, color = Neo.TextSecondary),
    titleMedium = TextStyle(fontSize = 16.sp, fontWeight = FontWeight.Medium, color = Neo.Text),
)

@Composable
fun NeoTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = NeoColors, typography = NeoTypography, content = content)
}

/** `#rrggbb` du fichier de préférences, en couleur ; accent si la chaîne est illisible. */
fun parseCalendarColor(hex: String): Color = try {
    Color(android.graphics.Color.parseColor(hex))
} catch (_: IllegalArgumentException) {
    Neo.Accent
}
