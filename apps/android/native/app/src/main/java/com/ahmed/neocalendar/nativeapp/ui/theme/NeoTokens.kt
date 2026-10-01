package com.ahmed.neocalendar.nativeapp.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** `0 offsetY blur color`, l'ombre de `--nc-shadow` ; le thème n'a ni décalage horizontal ni étalement. */
@Immutable
class NeoShadow(val offsetY: Dp, val blur: Dp, val color: Color)

/**
 * Les jetons d'un thème : un champ par variable CSS de l'ancienne interface. Les écrans lisent `Neo.*`
 * (qui lit le thème courant), jamais une couleur en dur ; ajouter un thème, c'est écrire un `NeoTokens`.
 */
@Immutable
class NeoTokens(
    val id: String,
    // Fonds
    /** `--background-primary` / `--nc-bg-primary` : surface des fiches, dialogues, cartes. */
    val surface: Color,
    /** `--background-secondary` : tiroir, réglages, liste d'un calendrier. */
    val mantle: Color,
    /** `--nc-bg-crust` : fond de page, derrière le fond d'écran. */
    val background: Color,
    /** Fond des lignes de réglage. */
    val settingRow: Color,
    /** `--background-modifier-hover`, `--nc-surface-hover` : appui, survol, ligne active. */
    val hover: Color,
    /** Appui d'un bouton de la barre du haut (blanc 8 %). */
    val barPress: Color,
    // Bordures
    val border: Color,
    val borderStrong: Color,
    // Textes
    val text: Color,
    val textSecondary: Color,
    val textFaint: Color,
    /** Libellés clairs : semaine, jours, étiquettes d'heure. */
    val label: Color,
    /** Réglages : valeurs et titres. */
    val settingsValue: Color,
    /** Réglages : chevrons et notes. */
    val settingsNote: Color,
    // Accent
    val accent: Color,
    val accentStrong: Color,
    val onAccent: Color,
    // États
    /** Rond du jour et ligne de l'heure dans la grille. */
    val today: Color,
    /** Pastille « aujourd'hui » de la barre du haut. */
    val todayPill: Color,
    val danger: Color,
    val overdue: Color,
    val success: Color,
    val taskTodo: Color,
    val taskDone: Color,
    val gridLine: Color,
    val draft: Color,
    val draftFill: Color,
    // Voiles posés par-dessus la grille (blanc translucide)
    val highlightWeek: Color,
    val highlightAnchor: Color,
    val chipNeutral: Color,
    val todayColumn: Color,
    // Géométrie
    val cardRadius: Dp,
    val shadow: NeoShadow,
    // Fond d'écran
    /** Fond du thème quand le réglage dit « Par défaut du thème » (fichier du dossier `wallpapers`). */
    val themeWallpaperFile: String,
    /** Fond d'un appareil qui n'a rien choisi (`DEFAULT_ANDROID_WALLPAPER_ID`). */
    val defaultWallpaperId: String,
    /** Voile sur la photo, du haut (alpha) vers le bas, teinté `surface`. */
    val wallpaperVeilTop: Float,
    val wallpaperVeilBottom: Float,
)

/** Catppuccin Mocha : `catppuccin-mocha.css`, `mobile.css` et les relevés de la spec §22. */
val CatppuccinMocha = NeoTokens(
    id = "catppuccin-mocha",
    surface = Color(0xFF1E1E2E),
    mantle = Color(0xFF181825),
    background = Color(0xFF11111B),
    settingRow = Color(0xFF13131D),
    hover = Color(0xFF313244),
    barPress = Color(0x14FFFFFF),
    border = Color(0x476C7086),
    borderStrong = Color(0x38C6D0F5),
    text = Color(0xFFC6D0F5),
    textSecondary = Color(0xFFA1A8C9),
    textFaint = Color(0xFF696D86),
    label = Color(0xFFD6DDF8),
    settingsValue = Color(0xFF979EBD),
    settingsNote = Color(0xFF757B95),
    accent = Color(0xFF658FF2),
    accentStrong = Color(0xFF89B4FA),
    onAccent = Color(0xFF1E1E2E),
    today = Color(0xFFF15550),
    todayPill = Color(0xFFF5544F),
    danger = Color(0xFFF38BA8),
    overdue = Color(0xFFE5534B),
    success = Color(0xFFA6E3A1),
    taskTodo = Color(0xFFE9973F),
    taskDone = Color(0xFF2F9E44),
    gridLine = Color(0x2B9BA0B9),
    draft = Color(0xFF4AABE0),
    draftFill = Color(0x2E4AABE0),
    highlightWeek = Color(0x17FFFFFF),
    highlightAnchor = Color(0x26FFFFFF),
    chipNeutral = Color(0x24FFFFFF),
    todayColumn = Color(0x0DFFFFFF),
    cardRadius = 22.dp,
    shadow = NeoShadow(8.dp, 24.dp, Color(0x5211111B)),
    themeWallpaperFile = "starlit-snow-peak.jpg",
    defaultWallpaperId = "starlit-snow-peak-portrait",
    wallpaperVeilTop = 0.16f,
    wallpaperVeilBottom = 0.24f,
)
