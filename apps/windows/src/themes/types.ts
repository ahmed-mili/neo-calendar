export const THEME_IDS = [
    "catppuccin-mocha",
    "github",
    "one",
    "ayu",
    "rose-pine",
    "vercel",
] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export interface ThemeSemanticColors {
    diffAdded: string;
    diffRemoved: string;
    skill: string;
}

/** La variante claire officielle du thème (relevé du 2026-10-02, `docs/superpowers/specs/2026-10-02-themes-releve-palettes.md`). */
export interface ThemeLightPalette {
    accent: string;
    surface: string;
    ink: string;
    danger: string;
    success: string;
}

export interface ThemeDefinition {
    id: ThemeId;
    label: string;
    variantLabel: string;
    className: string;
    colorScheme: "dark" | "light";
    accent: string;
    surface: string;
    ink: string;
    uiFont: string | null;
    codeFont: string | null;
    opaqueWindows: boolean;
    contrast: number;
    semanticColors: ThemeSemanticColors;
    light: ThemeLightPalette;
}
