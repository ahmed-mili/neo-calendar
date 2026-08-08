export interface WallpaperEffects {
    backgroundBrightness: number;
    backgroundBlur: number;
    containerOpacity: number;
}

export type WallpaperEffectKey = keyof WallpaperEffects;

export const WALLPAPER_EFFECTS_CHANGE_EVENT =
    "neo-calendar:wallpaper-effects-change";

export const DEFAULT_WALLPAPER_EFFECTS: Readonly<WallpaperEffects> = {
    backgroundBrightness: 0.7,
    backgroundBlur: 5,
    containerOpacity: 0.4,
};

const STORAGE_KEY = "neo-calendar-wallpaper-effects-v1";

const LIMITS: Record<
    WallpaperEffectKey,
    { min: number; max: number }
> = {
    backgroundBrightness: { min: 0, max: 1 },
    backgroundBlur: { min: 0, max: 20 },
    containerOpacity: { min: 0, max: 1 },
};

let installed = false;

function clamp(
    key: WallpaperEffectKey,
    value: number
): number {
    const limits = LIMITS[key];

    if (!Number.isFinite(value)) {
        return DEFAULT_WALLPAPER_EFFECTS[key];
    }

    return Math.max(
        limits.min,
        Math.min(limits.max, value)
    );
}

export function normalizeWallpaperEffects(
    value: Partial<WallpaperEffects> | null | undefined
): WallpaperEffects {
    return {
        backgroundBrightness: clamp(
            "backgroundBrightness",
            Number(value?.backgroundBrightness)
        ),
        backgroundBlur: clamp(
            "backgroundBlur",
            Number(value?.backgroundBlur)
        ),
        containerOpacity: clamp(
            "containerOpacity",
            Number(value?.containerOpacity)
        ),
    };
}

export function loadWallpaperEffects(): WallpaperEffects {
    if (typeof window === "undefined") {
        return { ...DEFAULT_WALLPAPER_EFFECTS };
    }

    try {
        const stored = window.localStorage.getItem(STORAGE_KEY);

        if (!stored) {
            return { ...DEFAULT_WALLPAPER_EFFECTS };
        }

        return normalizeWallpaperEffects(
            JSON.parse(stored) as Partial<WallpaperEffects>
        );
    } catch {
        return { ...DEFAULT_WALLPAPER_EFFECTS };
    }
}

export function applyWallpaperEffects(
    effects: WallpaperEffects
): void {
    if (typeof document === "undefined") {
        return;
    }

    const normalized = normalizeWallpaperEffects(effects);
    const roots = [
        document.documentElement,
        document.body,
    ].filter(Boolean) as HTMLElement[];

    const opacityPercent =
        `${Math.round(normalized.containerOpacity * 10000) / 100}%`;

    const mediumOpacityPercent =
        `${Math.min(100, Math.round((normalized.containerOpacity * 100 + 8) * 100) / 100)}%`;

    const strongOpacityPercent =
        `${Math.min(100, Math.round((normalized.containerOpacity * 100 + 14) * 100) / 100)}%`;

    for (const root of roots) {
        root.style.setProperty(
            "--nc-wallpaper-brightness",
            normalized.backgroundBrightness.toFixed(2)
        );

        root.style.setProperty(
            "--nc-wallpaper-blur",
            `${normalized.backgroundBlur.toFixed(0)}px`
        );

        root.style.setProperty(
            "--nc-container-opacity",
            normalized.containerOpacity.toFixed(2)
        );

        root.style.setProperty(
            "--nc-container-opacity-percent",
            opacityPercent
        );

        root.style.setProperty(
            "--nc-container-medium-opacity-percent",
            mediumOpacityPercent
        );

        root.style.setProperty(
            "--nc-container-strong-opacity-percent",
            strongOpacityPercent
        );
    }
}

export function saveWallpaperEffects(
    value: WallpaperEffects
): WallpaperEffects {
    const normalized = normalizeWallpaperEffects(value);

    if (typeof window !== "undefined") {
        try {
            window.localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(normalized)
            );
        } catch {
            // The live values still apply when localStorage is unavailable.
        }
    }

    applyWallpaperEffects(normalized);

    if (typeof window !== "undefined") {
        window.dispatchEvent(
            new CustomEvent<WallpaperEffects>(
                WALLPAPER_EFFECTS_CHANGE_EVENT,
                {
                    detail: normalized,
                }
            )
        );
    }

    return normalized;
}

export function resetWallpaperEffect(
    current: WallpaperEffects,
    key: WallpaperEffectKey
): WallpaperEffects {
    return saveWallpaperEffects({
        ...current,
        [key]: DEFAULT_WALLPAPER_EFFECTS[key],
    });
}

export function installWallpaperEffects(): void {
    if (
        installed ||
        typeof window === "undefined" ||
        typeof document === "undefined"
    ) {
        return;
    }

    installed = true;

    const applyStored = () => {
        applyWallpaperEffects(loadWallpaperEffects());
    };

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            applyStored,
            { once: true }
        );
    } else {
        applyStored();
    }

    window.addEventListener("storage", (event) => {
        if (event.key === STORAGE_KEY) {
            applyStored();
        }
    });

    console.info("[NeoWallpaperEffectsV81] installed");
}

installWallpaperEffects();