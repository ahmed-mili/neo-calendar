export const THEME_IDS = [
    "catppuccin-mocha",
    "tokyo-night",
    "absolutely",
    "ayu",
    "github",
    "linear",
    "lobster",
    "matrix",
    "one",
    "oscurange",
    "raycast",
    "rose-pine",
    "vercel",
    "vscode-plus",
] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export interface ThemeSemanticColors {
    diffAdded: string;
    diffRemoved: string;
    skill: string;
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
}
