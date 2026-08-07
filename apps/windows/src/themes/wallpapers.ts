export const WALLPAPER_IDS = [
    "theme-default",
    "android-alpenglow",
    "android-rose-summit",
    "starlit-alpine-refuge",
    "mountain-sunset",
    "none",
] as const;

export type WallpaperId = (typeof WALLPAPER_IDS)[number];
export type WallpaperTarget = "android" | "pc" | "universal";
export type WallpaperAspect = "portrait" | "landscape" | "adaptive";

export interface WallpaperDefinition {
    id: WallpaperId;
    label: string;
    description: string;
    imageUrl: string | null;
    previewStyle: "theme" | "image" | "solid";
    target: WallpaperTarget;
    aspect: WallpaperAspect;
}

export const DEFAULT_WALLPAPER_ID: WallpaperId = "theme-default";
export const DEFAULT_ANDROID_WALLPAPER_ID: WallpaperId = "android-alpenglow";

export const WALLPAPERS: readonly WallpaperDefinition[] = [
    {
        id: "theme-default",
        label: "Par défaut du thème",
        description: "Utilise le fond prévu par le thème sélectionné.",
        imageUrl: null,
        previewStyle: "theme",
        target: "universal",
        aspect: "adaptive",
    },
    {
        id: "android-alpenglow",
        label: "Sommets Alpenglow",
        description: "Fond vertical optimisé pour les écrans Android.",
        imageUrl: "/themes/neo-wallpapers/android-alpenglow.jpg",
        previewStyle: "image",
        target: "android",
        aspect: "portrait",
    },
    {
        id: "android-rose-summit",
        label: "Sommet Rose",
        description: "Fond vertical Android aux tons rose et bleu.",
        imageUrl: "/themes/neo-wallpapers/android-rose-summit.jpg",
        previewStyle: "image",
        target: "android",
        aspect: "portrait",
    },
    {
        id: "starlit-alpine-refuge",
        label: "Refuge sous les étoiles",
        description:
            "Refuge des Dolomites sous un ciel étoilé, à la nuit tombée.",
        imageUrl: "/themes/neo-wallpapers/starlit-alpine-refuge.jpg",
        previewStyle: "image",
        target: "android",
        aspect: "portrait",
    },
    {
        id: "mountain-sunset",
        label: "Crépuscule sur les cimes",
        description: "Fond horizontal optimisé pour PC et grands écrans.",
        imageUrl: "/themes/catppuccin-mocha/mountain-sunset.jpg",
        previewStyle: "image",
        target: "pc",
        aspect: "landscape",
    },
    {
        id: "none",
        label: "Aucun fond d'écran",
        description: "Utilise uniquement la couleur d'arrière-plan du thème.",
        imageUrl: null,
        previewStyle: "solid",
        target: "universal",
        aspect: "adaptive",
    },
];

export function isWallpaperId(value: unknown): value is WallpaperId {
    return (
        typeof value === "string" &&
        (WALLPAPER_IDS as readonly string[]).includes(value)
    );
}

export function isAndroidRuntime(): boolean {
    if (typeof document === "undefined") {
        return false;
    }

    const androidWindow = window as Window & {
        NeoAndroid?: unknown;
    };

    return (
        Boolean(androidWindow.NeoAndroid) ||
        document.documentElement.classList.contains("nc-platform-android") ||
        document.body?.classList.contains("nc-platform-android") === true ||
        document.documentElement.dataset.neoCalendarPlatform === "android"
    );
}

export function getRuntimeDefaultWallpaperId(): WallpaperId {
    return isAndroidRuntime()
        ? DEFAULT_ANDROID_WALLPAPER_ID
        : DEFAULT_WALLPAPER_ID;
}

export function getWallpaper(
    id: WallpaperId | string | null | undefined
): WallpaperDefinition {
    return (
        WALLPAPERS.find((wallpaper) => wallpaper.id === id) ??
        WALLPAPERS.find(
            (wallpaper) => wallpaper.id === getRuntimeDefaultWallpaperId()
        ) ??
        WALLPAPERS[0]
    );
}

export type WallpaperRuntime = "android" | "pc";

/**
 * What a given device should be offered.
 *
 * A landscape photo cropped to a phone screen shows a strip of its middle, and
 * a portrait one on a desktop shows two bars: neither belongs in the other's
 * list. Only the choices that suit any screen appear on both.
 */
export function getWallpapersForRuntime(
    runtime: WallpaperRuntime
): readonly WallpaperDefinition[] {
    return WALLPAPERS.filter(
        (wallpaper) =>
            wallpaper.target === "universal" || wallpaper.target === runtime
    );
}

export function currentWallpaperRuntime(): WallpaperRuntime {
    return isAndroidRuntime() ? "android" : "pc";
}

export function getWallpapersForTarget(
    target: WallpaperTarget
): readonly WallpaperDefinition[] {
    return WALLPAPERS.filter((wallpaper) => wallpaper.target === target);
}
