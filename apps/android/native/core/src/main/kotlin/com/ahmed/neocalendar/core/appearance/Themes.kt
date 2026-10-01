package com.ahmed.neocalendar.core.appearance

/*
 * Les thèmes de `apps/windows/src/themes/registry.ts`, avec la palette que `codex-themes.css`, `tokyo-night.css` et
 * `catppuccin-mocha.css` donnent à chacun (fond secondaire, survol, bordure, textes, accent fort...).
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
)

const val DEFAULT_THEME_ID = "catppuccin-mocha"

val THEMES: List<ThemeDefinition> = listOf(
    ThemeDefinition(
        id = "catppuccin-mocha", label = "Catppuccin", variantLabel = "Mocha",
        accent = "#658ff2", surface = "#1e1e2e", ink = "#c6d0f5", contrast = 60, opaqueWindows = false,
        uiFont = "\"Inter Variable\", Inter, \"Segoe UI Variable Text\", \"Segoe UI\", system-ui, sans-serif",
        codeFont = "\"JetBrains Mono Variable\", \"JetBrains Mono\", \"Cascadia Code\", Consolas, monospace",
        palette = ThemePalette(
            secondary = 0xFF181825L, hover = 0xFF313244L,
            border = 0x476C7086L, muted = 0xFFA1A8C9L, faint = 0xFF696D86L,
            onAccent = 0xFF1E1E2EL, error = 0xFFF38BA8L, crust = 0xFF11111BL,
            accentStrong = 0xFF89B4FAL, success = 0xFFA6E3A1L,
        ),
    ),
    ThemeDefinition(
        id = "tokyo-night", label = "Tokyo Night", variantLabel = "Dark",
        accent = "#3d59a1", surface = "#1a1b26", ink = "#a9b1d6", contrast = 60, opaqueWindows = false,
        uiFont = "\"Inter Variable\", Inter, \"Segoe UI Variable Text\", \"Segoe UI\", system-ui, sans-serif",
        codeFont = "\"JetBrains Mono Variable\", \"JetBrains Mono\", \"Cascadia Code\", Consolas, monospace",
        palette = ThemePalette(
            secondary = 0xFF16161EL, hover = 0xFF292E42L,
            border = 0x85414868L, muted = 0xFF787C99L, faint = 0xFF565F89L,
            onAccent = 0xFFC0CAF5L, error = 0xFF914C54L, crust = 0xFF0F0F17L,
            accentStrong = 0xFF7AA2F7L, success = 0xFF449DABL,
        ),
    ),
    ThemeDefinition(
        id = "absolutely", label = "Absolutely", variantLabel = "Dark",
        accent = "#cc7d5e", surface = "#2d2d2b", ink = "#f9f9f7", contrast = 60, opaqueWindows = true,
        uiFont = "\"Inter Variable\", Inter, \"Segoe UI Variable Text\", \"Segoe UI\", system-ui, sans-serif",
        codeFont = "\"JetBrains Mono Variable\", \"JetBrains Mono\", \"Cascadia Code\", Consolas, monospace",
        palette = ThemePalette(
            secondary = 0xFF383836L, hover = 0xFF454543L,
            border = 0xFF565654L, muted = 0xFFBCBCBAL, faint = 0xFF8F8F8DL,
            onAccent = 0xFFFFFFFFL, error = 0xFFFF5F38L, crust = 0xFF1F1F1EL,
            accentStrong = 0xFFD69880L, success = 0xFF00C853L,
        ),
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
    ),
    ThemeDefinition(
        id = "linear", label = "Linear", variantLabel = "Dark",
        accent = "#606acc", surface = "#0f0f11", ink = "#e3e4e6", contrast = 60, opaqueWindows = true,
        uiFont = "\"Inter Variable\", Inter, \"Segoe UI Variable Text\", \"Segoe UI\", system-ui, sans-serif",
        codeFont = "\"JetBrains Mono Variable\", \"JetBrains Mono\", \"Cascadia Code\", Consolas, monospace",
        palette = ThemePalette(
            secondary = 0xFF1B1B1DL, hover = 0xFF28292BL,
            border = 0xFF393A3CL, muted = 0xFFA3A4A6L, faint = 0xFF757577L,
            onAccent = 0xFFFFFFFFL, error = 0xFFFF7E78L, crust = 0xFF0A0A0CL,
            accentStrong = 0xFF7D85D2L, success = 0xFF69C967L,
        ),
    ),
    ThemeDefinition(
        id = "lobster", label = "Lobster", variantLabel = "Dark",
        accent = "#ff5c5c", surface = "#111827", ink = "#e4e4e7", contrast = 60, opaqueWindows = true,
        uiFont = "Satoshi, \"Inter Variable\", Inter, \"Segoe UI Variable Text\", \"Segoe UI\", system-ui, sans-serif",
        codeFont = "\"JetBrains Mono Variable\", \"JetBrains Mono\", \"Cascadia Code\", Consolas, monospace",
        palette = ThemePalette(
            secondary = 0xFF1D2332L, hover = 0xFF2A303EL,
            border = 0xFF3B414DL, muted = 0xFFA5A7ADL, faint = 0xFF767A83L,
            onAccent = 0xFFFFFFFFL, error = 0xFFFF5C5CL, crust = 0xFF0C111BL,
            accentStrong = 0xFFF97A7BL, success = 0xFF22C55EL,
        ),
    ),
    ThemeDefinition(
        id = "matrix", label = "Matrix", variantLabel = "Dark",
        accent = "#1eff5a", surface = "#040805", ink = "#b8ffca", contrast = 60, opaqueWindows = true,
        uiFont = "\"JetBrains Mono Variable\", \"JetBrains Mono\", \"Cascadia Code\", Consolas, monospace",
        codeFont = "\"JetBrains Mono Variable\", \"JetBrains Mono\", \"Cascadia Code\", Consolas, monospace",
        palette = ThemePalette(
            secondary = 0xFF0E1610L, hover = 0xFF1A261DL,
            border = 0xFF28392CL, muted = 0xFF82B58FL, faint = 0xFF5A7F64L,
            onAccent = 0xFF040805L, error = 0xFFFA423EL, crust = 0xFF030604L,
            accentStrong = 0xFF40FF73L, success = 0xFF1EFF5AL,
        ),
    ),
    ThemeDefinition(
        id = "one", label = "One", variantLabel = "Dark",
        accent = "#4d78cc", surface = "#282c34", ink = "#abb2bf", contrast = 60, opaqueWindows = true,
        uiFont = "\"Inter Variable\", Inter, \"Segoe UI Variable Text\", \"Segoe UI\", system-ui, sans-serif",
        codeFont = "\"JetBrains Mono Variable\", \"JetBrains Mono\", \"Cascadia Code\", Consolas, monospace",
        palette = ThemePalette(
            secondary = 0xFF2F333CL, hover = 0xFF383C45L,
            border = 0xFF424750L, muted = 0xFF848A95L, faint = 0xFF676C77L,
            onAccent = 0xFFFFFFFFL, error = 0xFFE05561L, crust = 0xFF1C1F24L,
            accentStrong = 0xFF6285C9L, success = 0xFF8CC265L,
        ),
    ),
    ThemeDefinition(
        id = "oscurange", label = "Oscurange", variantLabel = "Dark",
        accent = "#f9b98c", surface = "#0b0b0f", ink = "#e6e6e6", contrast = 60, opaqueWindows = true,
        uiFont = "\"Inter Variable\", Inter, \"Segoe UI Variable Text\", \"Segoe UI\", system-ui, sans-serif",
        codeFont = "\"JetBrains Mono Variable\", \"JetBrains Mono\", \"Cascadia Code\", Consolas, monospace",
        palette = ThemePalette(
            secondary = 0xFF17171BL, hover = 0xFF252529L,
            border = 0xFF37373AL, muted = 0xFFA4A4A6L, faint = 0xFF747476L,
            onAccent = 0xFF0B0B0FL, error = 0xFFFA423EL, crust = 0xFF08080AL,
            accentStrong = 0xFFF5C3A0L, success = 0xFF40C977L,
        ),
    ),
    ThemeDefinition(
        id = "raycast", label = "Raycast", variantLabel = "Dark",
        accent = "#ff6363", surface = "#101010", ink = "#fefefe", contrast = 60, opaqueWindows = false,
        uiFont = "\"Inter Variable\", Inter, \"Segoe UI Variable Text\", \"Segoe UI\", system-ui, sans-serif",
        codeFont = "\"JetBrains Mono Variable\", \"JetBrains Mono\", \"Cascadia Code\", Consolas, monospace",
        palette = ThemePalette(
            secondary = 0xFF1D1D1DL, hover = 0xFF2D2D2DL,
            border = 0xFF404040L, muted = 0xFFB7B7B7L, faint = 0xFF828282L,
            onAccent = 0xFFFFFFFFL, error = 0xFFFF6363L, crust = 0xFF0B0B0BL,
            accentStrong = 0xFFFF8585L, success = 0xFF59D499L,
        ),
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
    ),
    ThemeDefinition(
        id = "vscode-plus", label = "VS Code Plus", variantLabel = "Dark",
        accent = "#007acc", surface = "#1e1e1e", ink = "#d4d4d4", contrast = 50, opaqueWindows = true,
        uiFont = "\"Geist Variable\", Geist, \"Inter Variable\", Inter, \"Segoe UI\", system-ui, sans-serif",
        codeFont = "\"Geist Mono Variable\", \"Geist Mono\", \"JetBrains Mono Variable\", \"Cascadia Code\", Consolas, monospace",
        palette = ThemePalette(
            secondary = 0xFF282828L, hover = 0xFF343434L,
            border = 0xFF424242L, muted = 0xFF9D9D9DL, faint = 0xFF757575L,
            onAccent = 0xFFFFFFFFL, error = 0xFFF44747L, crust = 0xFF151515L,
            accentStrong = 0xFF2F8ECEL, success = 0xFF369432L,
        ),
    ),
)

/** `getTheme` : un identifiant inconnu rend le premier thème (Catppuccin). */
fun getTheme(id: String?): ThemeDefinition = THEMES.firstOrNull { it.id == id } ?: THEMES[0]
