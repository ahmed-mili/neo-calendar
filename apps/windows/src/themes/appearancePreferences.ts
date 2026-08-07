import type { ThemeDefinition, ThemeId } from "./types";
import {
    DEFAULT_WALLPAPER_ID,
    getRuntimeDefaultWallpaperId,
    isWallpaperId,
    type WallpaperId,
} from "./wallpapers";

export type AppearanceMode = "system" | "light" | "dark";

export interface ThemeCustomization {
    accent?: string;
    surface?: string;
    ink?: string;
    uiFont?: string;
    codeFont?: string;
    translucentSidebar?: boolean;
    contrast?: number;
    wallpaperId?: WallpaperId;
}

export interface AppearancePreferences {
    mode: AppearanceMode;
    translucentSidebar: boolean;
    contrast: number;
    themeOverrides: Partial<Record<ThemeId, ThemeCustomization>>;
}

export interface EffectiveThemeAppearance {
    accent: string;
    surface: string;
    ink: string;
    uiFont: string;
    codeFont: string;
    translucentSidebar: boolean;
    contrast: number;
    wallpaperId: WallpaperId;
}

const STORAGE_KEY = "neo-calendar.appearance";
export const APPEARANCE_CHANGE_EVENT = "neo-calendar:appearance-change";

export const DEFAULT_UI_FONT = '"Inter Variable", Inter, "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif';
export const DEFAULT_CODE_FONT = '"JetBrains Mono Variable", "JetBrains Mono", "Cascadia Code", Consolas, monospace';

const DEFAULT_APPEARANCE: AppearancePreferences = {
    mode: "dark",
    translucentSidebar: true,
    contrast: 50,
    themeOverrides: {},
};

function clampContrast(value: unknown, fallback = 50): number {
    const numeric = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(0, Math.min(100, Math.round(numeric)));
}

function normalizeMode(value: unknown): AppearanceMode {
    return value === "system" || value === "light" || value === "dark"
        ? value
        : DEFAULT_APPEARANCE.mode;
}

function normalizeHex(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    if (!/^#[0-9a-fA-F]{6}$/.test(trimmed)) return undefined;
    return trimmed.toLowerCase();
}

function normalizeFont(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 && trimmed.length <= 240 ? trimmed : undefined;
}

function normalizeThemeCustomization(value: unknown): ThemeCustomization {
    const input =
        value && typeof value === "object"
            ? (value as Record<string, unknown>)
            : {};

    const normalized: ThemeCustomization = {};
    const accent = normalizeHex(input.accent);
    const surface = normalizeHex(input.surface);
    const ink = normalizeHex(input.ink);
    const uiFont = normalizeFont(input.uiFont);
    const codeFont = normalizeFont(input.codeFont);

    if (accent) normalized.accent = accent;
    if (surface) normalized.surface = surface;
    if (ink) normalized.ink = ink;
    if (uiFont) normalized.uiFont = uiFont;
    if (codeFont) normalized.codeFont = codeFont;
    if (typeof input.translucentSidebar === "boolean") {
        normalized.translucentSidebar = input.translucentSidebar;
    }
    if (input.contrast !== undefined) {
        normalized.contrast = clampContrast(input.contrast);
    }
    if (isWallpaperId(input.wallpaperId)) {
        normalized.wallpaperId = input.wallpaperId;
    }
    return normalized;
}

export function normalizeAppearancePreferences(
    value: unknown
): AppearancePreferences {
    const input =
        value && typeof value === "object"
            ? (value as Record<string, unknown>)
            : {};

    const overridesInput =
        input.themeOverrides && typeof input.themeOverrides === "object"
            ? (input.themeOverrides as Record<string, unknown>)
            : {};
    const themeOverrides: Partial<Record<ThemeId, ThemeCustomization>> = {};

    for (const [themeId, customization] of Object.entries(overridesInput)) {
        themeOverrides[themeId as ThemeId] = normalizeThemeCustomization(
            customization
        );
    }

    return {
        mode: normalizeMode(input.mode),
        translucentSidebar:
            typeof input.translucentSidebar === "boolean"
                ? input.translucentSidebar
                : DEFAULT_APPEARANCE.translucentSidebar,
        contrast: clampContrast(
            input.contrast,
            DEFAULT_APPEARANCE.contrast
        ),
        themeOverrides,
    };
}

export function loadAppearancePreferences(): AppearancePreferences {
    if (typeof window === "undefined") return DEFAULT_APPEARANCE;

    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        return raw
            ? normalizeAppearancePreferences(JSON.parse(raw))
            : DEFAULT_APPEARANCE;
    } catch {
        return DEFAULT_APPEARANCE;
    }
}

export function saveAppearancePreferences(
    next: AppearancePreferences
): AppearancePreferences {
    const normalized = normalizeAppearancePreferences(next);
    if (typeof window === "undefined") return normalized;

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    window.dispatchEvent(
        new CustomEvent<AppearancePreferences>(APPEARANCE_CHANGE_EVENT, {
            detail: normalized,
        })
    );
    return normalized;
}

export function resolveAppearanceMode(mode: AppearanceMode): "light" | "dark" {
    if (mode !== "system") return mode;
    if (typeof window === "undefined" || !window.matchMedia) return "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
}

export function getEffectiveThemeAppearance(
    theme: ThemeDefinition,
    preferences: AppearancePreferences
): EffectiveThemeAppearance {
    const override = preferences.themeOverrides[theme.id] ?? {};
    return {
        accent: override.accent ?? theme.accent,
        surface: override.surface ?? theme.surface,
        ink: override.ink ?? theme.ink,
        uiFont: override.uiFont ?? theme.uiFont ?? DEFAULT_UI_FONT,
        codeFont: override.codeFont ?? theme.codeFont ?? DEFAULT_CODE_FONT,
        translucentSidebar:
            override.translucentSidebar ?? !theme.opaqueWindows,
        contrast: override.contrast ?? theme.contrast,
        wallpaperId: override.wallpaperId ?? getRuntimeDefaultWallpaperId(),
    };
}

export function setThemeCustomization(
    preferences: AppearancePreferences,
    themeId: ThemeId,
    customization: ThemeCustomization
): AppearancePreferences {
    return saveAppearancePreferences({
        ...preferences,
        themeOverrides: {
            ...preferences.themeOverrides,
            [themeId]: normalizeThemeCustomization(customization),
        },
    });
}

export function resetThemeCustomization(
    preferences: AppearancePreferences,
    themeId: ThemeId
): AppearancePreferences {
    const themeOverrides = { ...preferences.themeOverrides };
    delete themeOverrides[themeId];
    return saveAppearancePreferences({ ...preferences, themeOverrides });
}
