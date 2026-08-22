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

const LIMITS: Record<WallpaperEffectKey, { min: number; max: number }> = {
    backgroundBrightness: { min: 0, max: 1 },
    backgroundBlur: { min: 0, max: 20 },
    containerOpacity: { min: 0, max: 1 },
};

let installed = false;

function clamp(key: WallpaperEffectKey, value: number): number {
    const limits = LIMITS[key];

    if (!Number.isFinite(value)) {
        return DEFAULT_WALLPAPER_EFFECTS[key];
    }

    return Math.max(limits.min, Math.min(limits.max, value));
}

export function normalizeWallpaperEffects(
    value: Partial<WallpaperEffects> | null | undefined
): WallpaperEffects {
    return {
        backgroundBrightness: clamp(
            "backgroundBrightness",
            Number(value?.backgroundBrightness)
        ),
        backgroundBlur: clamp("backgroundBlur", Number(value?.backgroundBlur)),
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

function parseRgb(value: string): [number, number, number] | null {
    const match = value.match(
        /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i
    );

    if (!match) {
        return null;
    }

    return [
        Math.round(Number(match[1])),
        Math.round(Number(match[2])),
        Math.round(Number(match[3])),
    ];
}

function readThemeSurfaceRgb(): [number, number, number] {
    if (typeof document === "undefined" || !document.body) {
        return [17, 17, 27];
    }

    const probe = document.createElement("span");

    probe.style.cssText = [
        "position:fixed",
        "left:-9999px",
        "top:-9999px",
        "color:var(--background-primary, #11111b)",
        "pointer-events:none",
        "visibility:hidden",
    ].join(";");

    document.body.appendChild(probe);

    const resolved = window.getComputedStyle(probe).color;

    probe.remove();

    return parseRgb(resolved) ?? [17, 17, 27];
}

function rgba(rgb: [number, number, number], alpha: number): string {
    const safeAlpha = Math.round(Math.max(0, Math.min(1, alpha)) * 1000) / 1000;

    return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${safeAlpha})`;
}

function effectTargets(): HTMLElement[] {
    if (typeof document === "undefined") {
        return [];
    }

    return [
        document.documentElement,
        document.body,
        document.getElementById("root"),
        document.querySelector<HTMLElement>(".nc-desktop--calendar"),
        document.querySelector<HTMLElement>(".nc-desktop-calendar"),
    ].filter((target): target is HTMLElement => target instanceof HTMLElement);
}

export function applyWallpaperEffects(effects: WallpaperEffects): void {
    if (typeof document === "undefined" || !document.body) {
        return;
    }

    const normalized = normalizeWallpaperEffects(effects);

    const surfaceRgb = readThemeSurfaceRgb();

    const gridAlpha = normalized.containerOpacity;

    const chromeAlpha = Math.min(1, normalized.containerOpacity + 0.08);

    const sidebarAlpha = Math.min(1, normalized.containerOpacity + 0.14);

    const values: Record<string, string> = {
        "--nc-wallpaper-brightness": normalized.backgroundBrightness.toFixed(2),

        "--nc-wallpaper-blur": `${normalized.backgroundBlur.toFixed(0)}px`,

        "--nc-container-opacity": normalized.containerOpacity.toFixed(2),

        "--nc-grid-container-background": rgba(surfaceRgb, gridAlpha),

        "--nc-chrome-container-background": rgba(surfaceRgb, chromeAlpha),

        "--nc-sidebar-container-background": rgba(surfaceRgb, sidebarAlpha),
    };

    for (const target of effectTargets()) {
        for (const [name, value] of Object.entries(values)) {
            target.style.setProperty(name, value);
        }
    }

    console.info(
        `[NeoWallpaperEffectsV84] opacity=${normalized.containerOpacity.toFixed(
            2
        )}`
    );
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
            // Live values still apply without persistent storage.
        }
    }

    applyWallpaperEffects(normalized);

    if (typeof window !== "undefined") {
        window.dispatchEvent(
            new CustomEvent<WallpaperEffects>(WALLPAPER_EFFECTS_CHANGE_EVENT, {
                detail: normalized,
            })
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
        const oldRuntimeLayer = document.getElementById(
            "nc-android-wallpaper-filter-layer"
        );

        oldRuntimeLayer?.remove();

        applyWallpaperEffects(loadWallpaperEffects());
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", applyStored, {
            once: true,
        });
    } else {
        applyStored();
    }

    window.addEventListener("storage", (event) => {
        if (event.key === STORAGE_KEY) {
            applyStored();
        }
    });

    window.setTimeout(applyStored, 0);
    window.setTimeout(applyStored, 300);

    console.info("[NeoWallpaperEffectsV84] installed");
}

installWallpaperEffects();
