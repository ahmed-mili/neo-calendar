import { ThemeDefinition, ThemeId } from "./types";

export const DEFAULT_THEME_ID: ThemeId = "catppuccin-mocha";

export const THEMES: readonly ThemeDefinition[] = [
    {
        id: "catppuccin-mocha",
        label: "Catppuccin",
        variantLabel: "Mocha",
        className: "nc-theme-catppuccin-mocha",
        colorScheme: "dark",
        accent: "#658ff2",
        surface: "#1e1e2e",
        ink: "#c6d0f5",
        uiFont: '"Inter Variable", Inter, "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif',
        codeFont:
            '"JetBrains Mono Variable", "JetBrains Mono", "Cascadia Code", Consolas, monospace',
        opaqueWindows: false,
        contrast: 60,
        semanticColors: {
            diffAdded: "#a6e3a1",
            diffRemoved: "#f38ba8",
            skill: "#cba6f7",
        },
    },
    {
        id: "github",
        label: "GitHub",
        variantLabel: "Dark",
        className: "nc-theme-github",
        colorScheme: "dark",
        accent: "#1f6feb",
        surface: "#0d1117",
        ink: "#e6edf3",
        uiFont: '"Inter Variable", Inter, "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif',
        codeFont:
            '"JetBrains Mono Variable", "JetBrains Mono", "Cascadia Code", Consolas, monospace',
        opaqueWindows: true,
        contrast: 60,
        semanticColors: {
            diffAdded: "#3fb950",
            diffRemoved: "#f85149",
            skill: "#bc8cff",
        },
    },
    {
        id: "one",
        label: "One",
        variantLabel: "Dark",
        className: "nc-theme-one",
        colorScheme: "dark",
        accent: "#4d78cc",
        surface: "#282c34",
        ink: "#abb2bf",
        uiFont: '"Inter Variable", Inter, "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif',
        codeFont:
            '"JetBrains Mono Variable", "JetBrains Mono", "Cascadia Code", Consolas, monospace',
        opaqueWindows: true,
        contrast: 60,
        semanticColors: {
            diffAdded: "#8cc265",
            diffRemoved: "#e05561",
            skill: "#c162de",
        },
    },
    {
        id: "ayu",
        label: "Ayu",
        variantLabel: "Dark",
        className: "nc-theme-ayu",
        colorScheme: "dark",
        accent: "#e6b450",
        surface: "#10141c",
        ink: "#bfbdb6",
        uiFont: '"Inter Variable", Inter, "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif',
        codeFont:
            '"JetBrains Mono Variable", "JetBrains Mono", "Cascadia Code", Consolas, monospace',
        opaqueWindows: true,
        contrast: 60,
        semanticColors: {
            diffAdded: "#70bf56",
            diffRemoved: "#f26d78",
            skill: "#d0a1ff",
        },
    },
    {
        id: "rose-pine",
        label: "Rose Pine",
        variantLabel: "Moon",
        className: "nc-theme-rose-pine",
        colorScheme: "dark",
        accent: "#ea9a97",
        surface: "#232136",
        ink: "#e0def4",
        uiFont: '"Inter Variable", Inter, "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif',
        codeFont:
            '"JetBrains Mono Variable", "JetBrains Mono", "Cascadia Code", Consolas, monospace',
        opaqueWindows: false,
        contrast: 60,
        semanticColors: {
            diffAdded: "#9ccfd8",
            diffRemoved: "#908caa",
            skill: "#c4a7e7",
        },
    },
    {
        id: "vercel",
        label: "Vercel",
        variantLabel: "Dark",
        className: "nc-theme-vercel",
        colorScheme: "dark",
        accent: "#006efe",
        surface: "#000000",
        ink: "#ededed",
        uiFont: '"Geist Variable", Geist, "Inter Variable", Inter, "Segoe UI", system-ui, sans-serif',
        codeFont:
            '"Geist Mono Variable", "Geist Mono", "JetBrains Mono Variable", "Cascadia Code", Consolas, monospace',
        opaqueWindows: true,
        contrast: 50,
        semanticColors: {
            diffAdded: "#00AD3A",
            diffRemoved: "#F13342",
            skill: "#9540D5",
        },
    },
];

export function getTheme(id: string | null | undefined): ThemeDefinition {
    return THEMES.find((theme) => theme.id === id) ?? THEMES[0];
}
