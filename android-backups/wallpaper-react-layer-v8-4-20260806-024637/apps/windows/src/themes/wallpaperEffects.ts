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
const ANDROID_LAYER_ID = "nc-android-wallpaper-filter-layer";

const LIMITS: Record<
    WallpaperEffectKey,
    { min: number; max: number }
> = {
    backgroundBrightness: { min: 0, max: 1 },
    backgroundBlur: { min: 0, max: 20 },
    containerOpacity: { min: 0, max: 1 },
};

let installed = false;
let syncFrame = 0;

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
        const stored =
            window.localStorage.getItem(STORAGE_KEY);

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

function isAndroidRuntime(): boolean {
    if (
        typeof window === "undefined" ||
        typeof document === "undefined"
    ) {
        return false;
    }

    const androidWindow = window as Window & {
        NeoAndroid?: unknown;
    };

    return (
        Boolean(androidWindow.NeoAndroid) ||
        document.documentElement.classList.contains(
            "nc-platform-android"
        ) ||
        document.body?.classList.contains(
            "nc-platform-android"
        ) === true ||
        document.documentElement.dataset.neoCalendarPlatform ===
            "android"
    );
}

function parseRgb(
    value: string
): [number, number, number] | null {
    const rgb = value.match(
        /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i
    );

    if (!rgb) {
        return null;
    }

    return [
        Math.round(Number(rgb[1])),
        Math.round(Number(rgb[2])),
        Math.round(Number(rgb[3])),
    ];
}

function readThemeSurfaceRgb(): [number, number, number] {
    if (
        typeof document === "undefined" ||
        !document.body
    ) {
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

    const resolved =
        window.getComputedStyle(probe).color;

    probe.remove();

    return parseRgb(resolved) ?? [17, 17, 27];
}

function rgba(
    rgb: [number, number, number],
    alpha: number
): string {
    const safeAlpha =
        Math.round(
            Math.max(0, Math.min(1, alpha)) * 1000
        ) / 1000;

    return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${safeAlpha})`;
}

function readCustomProperty(
    name: string
): string {
    const roots: Element[] = [
        document.documentElement,
        document.body,
        document.querySelector(
            ".nc-desktop--calendar"
        ) as Element,
    ].filter(Boolean);

    for (const root of roots) {
        const value =
            window
                .getComputedStyle(root)
                .getPropertyValue(name)
                .trim();

        if (value) {
            return value;
        }
    }

    return "";
}

function ensureAndroidWallpaperLayer(): HTMLDivElement | null {
    if (
        !isAndroidRuntime() ||
        !document.body
    ) {
        return null;
    }

    let layer =
        document.getElementById(
            ANDROID_LAYER_ID
        ) as HTMLDivElement | null;

    if (!layer) {
        layer = document.createElement("div");
        layer.id = ANDROID_LAYER_ID;
        layer.setAttribute(
            "aria-hidden",
            "true"
        );

        const root =
            document.getElementById("root");

        document.body.insertBefore(
            layer,
            root ?? document.body.firstChild
        );
    }

    return layer;
}

function syncAndroidWallpaperLayer(
    effects: WallpaperEffects
): void {
    const layer =
        ensureAndroidWallpaperLayer();

    if (!layer) {
        return;
    }

    const selectedImage =
        readCustomProperty(
            "--nc-selected-wallpaper"
        );

    const themeImage =
        readCustomProperty(
            "--nc-wallpaper"
        );

    const selectedOverlay =
        readCustomProperty(
            "--nc-selected-wallpaper-overlay"
        );

    const themeOverlay =
        readCustomProperty(
            "--nc-wallpaper-overlay"
        );

    const image =
        selectedImage || themeImage || "none";

    const overlay =
        selectedOverlay || themeOverlay || "none";

    const layers = [
        overlay,
        image,
    ].filter(
        (value) =>
            value &&
            value.toLowerCase() !== "none"
    );

    const surface =
        readCustomProperty(
            "--nc-bg-crust"
        ) ||
        readCustomProperty(
            "--background-primary"
        ) ||
        "#11111b";

    layer.style.backgroundColor =
        surface;

    layer.style.backgroundImage =
        layers.length > 0
            ? layers.join(", ")
            : "none";

    layer.style.filter =
        `brightness(${effects.backgroundBrightness}) ` +
        `blur(${effects.backgroundBlur}px)`;

    layer.dataset.neoBrightness =
        effects.backgroundBrightness.toFixed(2);

    layer.dataset.neoBlur =
        effects.backgroundBlur.toFixed(0);

    console.info(
        `[NeoWallpaperFilterV83] layer image=${image !== "none"} ` +
        `brightness=${effects.backgroundBrightness.toFixed(2)} ` +
        `blur=${effects.backgroundBlur.toFixed(0)}`
    );
}

function effectTargets(): HTMLElement[] {
    if (typeof document === "undefined") {
        return [];
    }

    return [
        document.documentElement,
        document.body,
        document.getElementById("root"),
        document.querySelector<HTMLElement>(
            ".nc-desktop--calendar"
        ),
        document.querySelector<HTMLElement>(
            ".nc-desktop-calendar"
        ),
    ].filter(
        (target): target is HTMLElement =>
            target instanceof HTMLElement
    );
}

export function applyWallpaperEffects(
    effects: WallpaperEffects
): void {
    if (
        typeof document === "undefined" ||
        !document.body
    ) {
        return;
    }

    const normalized =
        normalizeWallpaperEffects(effects);

    const surfaceRgb =
        readThemeSurfaceRgb();

    const gridAlpha =
        normalized.containerOpacity;

    const chromeAlpha =
        Math.min(
            1,
            normalized.containerOpacity + 0.08
        );

    const sidebarAlpha =
        Math.min(
            1,
            normalized.containerOpacity + 0.14
        );

    const values: Record<string, string> = {
        "--nc-wallpaper-brightness":
            normalized.backgroundBrightness.toFixed(2),

        "--nc-wallpaper-blur":
            `${normalized.backgroundBlur.toFixed(0)}px`,

        "--nc-container-opacity":
            normalized.containerOpacity.toFixed(2),

        "--nc-grid-container-background":
            rgba(surfaceRgb, gridAlpha),

        "--nc-chrome-container-background":
            rgba(surfaceRgb, chromeAlpha),

        "--nc-sidebar-container-background":
            rgba(surfaceRgb, sidebarAlpha),
    };

    for (const target of effectTargets()) {
        for (
            const [name, value] of
            Object.entries(values)
        ) {
            target.style.setProperty(
                name,
                value
            );
        }
    }

    if (isAndroidRuntime()) {
        syncAndroidWallpaperLayer(
            normalized
        );
    }
}

export function saveWallpaperEffects(
    value: WallpaperEffects
): WallpaperEffects {
    const normalized =
        normalizeWallpaperEffects(value);

    if (typeof window !== "undefined") {
        try {
            window.localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(normalized)
            );
        } catch {
            // Live effects remain active without persistent storage.
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
        [key]:
            DEFAULT_WALLPAPER_EFFECTS[key],
    });
}

function scheduleLayerSync(): void {
    if (
        syncFrame ||
        typeof window === "undefined"
    ) {
        return;
    }

    syncFrame =
        window.requestAnimationFrame(
            () => {
                syncFrame = 0;

                applyWallpaperEffects(
                    loadWallpaperEffects()
                );
            }
        );
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
        applyWallpaperEffects(
            loadWallpaperEffects()
        );
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

    window.addEventListener(
        "storage",
        (event) => {
            if (event.key === STORAGE_KEY) {
                applyStored();
            }
        }
    );

    const observer =
        new MutationObserver(
            scheduleLayerSync
        );

    observer.observe(
        document.documentElement,
        {
            attributes: true,
            attributeFilter: [
                "class",
                "style",
            ],
            childList: true,
        }
    );

    if (document.body) {
        observer.observe(
            document.body,
            {
                attributes: true,
                attributeFilter: [
                    "class",
                    "style",
                ],
                childList: true,
            }
        );
    }

    window.setTimeout(
        applyStored,
        0
    );

    window.setTimeout(
        applyStored,
        250
    );

    window.setTimeout(
        applyStored,
        900
    );

    console.info(
        "[NeoWallpaperFilterV83] installed"
    );
}

installWallpaperEffects();