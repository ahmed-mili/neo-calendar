package com.ahmed.neocalendar.core.appearance

/*
 * Les thèmes de `apps/windows/src/themes/registry.ts`, avec la palette que `codex-themes.css` et
 * `catppuccin-mocha.css` donnent à chacun (fond secondaire, survol, bordure, textes, accent fort...) et la palette claire officielle (`light`,
 * relevé `docs/superpowers/specs/2026-10-02-themes-releve-palettes.md`). `ThemeColors.kt` en tire les couleurs d'un mode.
 * Les couleurs sont en ARGB (`0xAARRGGBB`), les trois principales (accent, surface, encre) en `#rrggbb` comme le registre.
 */

/** Ce que la feuille de style du thème fixe à côté de l'accent, de la surface et de l'encre. */
data class ThemePalette(
    /** `--background-secondary` : tiroir, réglages. */
    val secondary: Long,
    /** `--background-modifier-hover`, `--nc-surface-hover`. */
    val hover: Long,
    /** `--background-modifier-border`. */
    val border: Long,
    /** `--text-muted`. */
    val muted: Long,
    /** `--text-faint`. */
    val faint: Long,
    /** `--text-on-accent`. */
    val onAccent: Long,
    /** `--text-error`. */
    val error: Long,
    /** `--nc-bg-crust` : derrière le fond d'écran. */
    val crust: Long,
    /** `--nc-accent-strong`. */
    val accentStrong: Long,
    /** `--nc-success`. */
    val success: Long,
)

/** La variante claire officielle du thème (relevé du 2026-10-02) : fond, texte, accent, rouge et vert. */
data class ThemeLight(val accent: String, val surface: String, val ink: String, val error: String, val success: String)

data class ThemeDefinition(
    val id: String,
    val label: String,
    val variantLabel: String,
    val accent: String,
    val surface: String,
    val ink: String,
    val contrast: Int,
    val opaqueWindows: Boolean,
    val uiFont: String,
    val codeFont: String,
    val palette: ThemePalette,
    val light: ThemeLight,
)

const val DEFAULT_THEME_ID = "catppuccin-mocha"

val THEMES: List<ThemeDefinition> = listOf(
    ThemeDefinition(
        id = "catppuccin-mocha", label = "Catppuccin", variantLabel = "Mocha",
        accent = "#89b4fa", surface = "#1e1e2e", ink = "#cdd6f4", contrast = 60, opaqueWindows = false,
        uiFont = "\"Inter Variable\", Inter, \"Segoe UI Variable Text\", \"Segoe UI\", system-ui, sans-serif",
        codeFont = "\"JetBrains Mono Variable\", \"JetBrains Mono\", \"Cascadia Code\", Consolas, monospace",
        palette = ThemePalette(
            secondary = 0xFF181825L, hover = 0xFF313244L,
            border = 0x476C7086L, muted = 0xFFA1A8C9L, faint = 0xFF696D86L,
            onAccent = 0xFF1E1E2EL, error = 0xFFF38BA8L, crust = 0xFF11111BL,
            accentStrong = 0xFFA3C5FBL, success = 0xFFA6E3A1L,
        ),
        light = ThemeLight(accent = "#1e66f5", surface = "#eff1f5", ink = "#4c4f69", error = "#d20f39", success = "#40a02b"),
    ),
    ThemeDefinition(
        id = "github", label = "GitHub", variantLabel = "Dark",
        accent = "#1f6feb", surface = "#0d1117", ink = "#e6edf3", contrast = 60, opaqueWindows = true,
        uiFont = "\"Inter Variable\", Inter, \"Segoe UI Variable Text\", \"Segoe UI\", system-ui, sans-serif",
        codeFont = "\"JetBrains Mono Variable\", \"JetBrains Mono\", \"Cascadia Code\", Consolas, monospace",
        palette = ThemePalette(
            secondary = 0xFF191D23L, hover = 0xFF272B31L,
            border = 0xFF383D43L, muted = 0xFFA5ABB1L, faint = 0xFF757B81L,
            onAccent = 0xFFFFFFFFL, error = 0xFFF85149L, crust = 0xFF090C10L,
            accentStrong = 0xFF4B8BEDL, success = 0xFF3FB950L,
        ),
        light = ThemeLight(accent = "#0969da", surface = "#ffffff", ink = "#1f2328", error = "#cf222e", success = "#1a7f37"),
    ),
    ThemeDefinition(
        id = "one", label = "One", variantLabel = "Dark",
        accent = "#4d78cc", surface = "#282c34", ink = "#abb2bf", contrast = 60, opaqueWindows = true,
        uiFont = "\"Inter Variable\", Inter, \"Segoe UI Variable Text\", \"Segoe UI\", system-ui, sans-serif",
        codeFont = "\"JetBrains Mono Variable\", \"JetBrains Mono\", \"Cascadia Code\", Consolas, monospace",
        palette = ThemePalette(
            secondary = 0xFF2F333CL, hover = 0xFF383C45L,
            border = 0xFF424750L, muted = 0xFF848A95L, faint = 0xFF676C77L,
            onAccent = 0xFFFFFFFFL, error = 0xFFE06C75L, crust = 0xFF1C1F24L,
            accentStrong = 0xFF6285C9L, success = 0xFF98C379L,
        ),
        light = ThemeLight(accent = "#5871ef", surface = "#fafafa", ink = "#383a42", error = "#e45649", success = "#50a14f"),
    ),
    ThemeDefinition(
        id = "ayu", label = "Ayu", variantLabel = "Dark",
        accent = "#e6b450", surface = "#10141c", ink = "#bfbdb6", contrast = 60, opaqueWindows = true,
        uiFont = "\"Inter Variable\", Inter, \"Segoe UI Variable Text\", \"Segoe UI\", system-ui, sans-serif",
        codeFont = "\"JetBrains Mono Variable\", \"JetBrains Mono\", \"Cascadia Code\", Consolas, monospace",
        palette = ThemePalette(
            secondary = 0xFF1A1D24L, hover = 0xFF25282EL,
            border = 0xFF33363BL, muted = 0xFF8A8A88L, faint = 0xFF646566L,
            onAccent = 0xFF10141CL, error = 0xFFF26D78L, crust = 0xFF0B0E14L,
            accentStrong = 0xFFDDB666L, success = 0xFF70BF56L,
        ),
        light = ThemeLight(accent = "#f29718", surface = "#fcfcfc", ink = "#5c6166", error = "#ff7383", success = "#6cbf43"),
    ),
    ThemeDefinition(
        id = "rose-pine", label = "Rose Pine", variantLabel = "Moon",
        accent = "#ea9a97", surface = "#232136", ink = "#e0def4", contrast = 60, opaqueWindows = false,
        uiFont = "\"Inter Variable\", Inter, \"Segoe UI Variable Text\", \"Segoe UI\", system-ui, sans-serif",
        codeFont = "\"JetBrains Mono Variable\", \"JetBrains Mono\", \"Cascadia Code\", Consolas, monospace",
        palette = ThemePalette(
            secondary = 0xFF2D2B40L, hover = 0xFF3A384DL,
            border = 0xFF49475CL, muted = 0xFFA7A5BBL, faint = 0xFF7E7C91L,
            onAccent = 0xFF232136L, error = 0xFF908CAAL, crust = 0xFF181726L,
            accentStrong = 0xFFE8A9ABL, success = 0xFF9CCFD8L,
        ),
        light = ThemeLight(accent = "#d7827e", surface = "#faf4ed", ink = "#575279", error = "#b4637a", success = "#56949f"),
    ),
    ThemeDefinition(
        id = "vercel", label = "Vercel", variantLabel = "Dark",
        accent = "#006efe", surface = "#000000", ink = "#ededed", contrast = 50, opaqueWindows = true,
        uiFont = "\"Geist Variable\", Geist, \"Inter Variable\", Inter, \"Segoe UI\", system-ui, sans-serif",
        codeFont = "\"Geist Mono Variable\", \"Geist Mono\", \"JetBrains Mono Variable\", \"Cascadia Code\", Consolas, monospace",
        palette = ThemePalette(
            secondary = 0xFF0D0D0DL, hover = 0xFF1C1C1CL,
            border = 0xFF2F2F2FL, muted = 0xFFA6A6A6L, faint = 0xFF727272L,
            onAccent = 0xFFFFFFFFL, error = 0xFFF13342L, crust = 0xFF000000L,
            accentStrong = 0xFF348AFAL, success = 0xFF00AD3AL,
        ),
        light = ThemeLight(accent = "#0070f7", surface = "#ffffff", ink = "#171717", error = "#fc0035", success = "#28a948"),
    ),
)

/** `getTheme` : un identifiant inconnu rend le premier thème (Catppuccin). */
fun getTheme(id: String?): ThemeDefinition = THEMES.firstOrNull { it.id == id } ?: THEMES[0]
