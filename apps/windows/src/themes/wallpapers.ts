export const WALLPAPER_IDS = [
    "theme-default",
    "android-alpenglow",
    "android-rose-summit",
    "starlit-alpine-refuge",
    "mountain-sunset",
    "alpine-crown",
    "dolomite-dawn",
    "dolomite-haze",
    "emerald-cove",
    "lofoten-fjord",
    "glacier-ridge",
    "golden-crest",
    "ember-dolomites",
    "turquoise-lagoon",
    "stormy-fjord",
    "glacier-plateau",
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
        label: "Starlit Alpine Refuge",
        description:
            "Refuge des Dolomites sous un ciel étoilé, à la nuit tombée.",
        imageUrl: "/themes/neo-wallpapers/starlit-alpine-refuge.jpg",
        previewStyle: "image",
        target: "android",
        aspect: "portrait",
    },
    {
        id: "mountain-sunset",
        label: "Mountain Sunset",
        description: "Fond horizontal optimisé pour PC et grands écrans.",
        imageUrl: "/themes/catppuccin-mocha/mountain-sunset.jpg",
        previewStyle: "image",
        target: "pc",
        aspect: "landscape",
    },
    {
        id: "alpine-crown",
        label: "Couronne alpine",
        description: "Fond horizontal : crête enneigée au soleil rasant.",
        imageUrl: "/themes/neo-wallpapers/alpine-crown.jpg",
        previewStyle: "image",
        target: "pc",
        aspect: "landscape",
    },
    {
        id: "dolomite-dawn",
        label: "Aube des Dolomites",
        description: "Fond horizontal : sommet doré sous un ciel mauve.",
        imageUrl: "/themes/neo-wallpapers/dolomite-dawn.jpg",
        previewStyle: "image",
        target: "pc",
        aspect: "landscape",
    },
    {
        id: "dolomite-haze",
        label: "Brume des Dolomites",
        description: "Fond horizontal : crêtes roses au-dessus de la brume.",
        imageUrl: "/themes/neo-wallpapers/dolomite-haze.jpg",
        previewStyle: "image",
        target: "pc",
        aspect: "landscape",
    },
    {
        id: "emerald-cove",
        label: "Crique émeraude",
        description: "Fond horizontal : eau turquoise au pied d'une falaise.",
        imageUrl: "/themes/neo-wallpapers/emerald-cove.jpg",
        previewStyle: "image",
        target: "pc",
        aspect: "landscape",
    },
    {
        id: "lofoten-fjord",
        label: "Fjord des Lofoten",
        description: "Fond horizontal : parois sombres et nuages bas.",
        imageUrl: "/themes/neo-wallpapers/lofoten-fjord.jpg",
        previewStyle: "image",
        target: "pc",
        aspect: "landscape",
    },
    {
        id: "glacier-ridge",
        label: "Crête glaciaire",
        description: "Fond horizontal : glacier et ciel bleu franc.",
        imageUrl: "/themes/neo-wallpapers/glacier-ridge.jpg",
        previewStyle: "image",
        target: "pc",
        aspect: "landscape",
    },
    {
        id: "golden-crest",
        label: "Crête dorée",
        description: "Fond vertical : sommet au soleil rasant, ciel profond.",
        imageUrl: "/themes/neo-wallpapers/golden-crest.jpg",
        previewStyle: "image",
        target: "android",
        aspect: "portrait",
    },
    {
        id: "ember-dolomites",
        label: "Dolomites incandescentes",
        description: "Fond vertical : ciel orangé au-dessus de la brume.",
        imageUrl: "/themes/neo-wallpapers/ember-dolomites.jpg",
        previewStyle: "image",
        target: "android",
        aspect: "portrait",
    },
    {
        id: "turquoise-lagoon",
        label: "Lagon turquoise",
        description: "Fond vertical : eau claire au pied d'une falaise verte.",
        imageUrl: "/themes/neo-wallpapers/turquoise-lagoon.jpg",
        previewStyle: "image",
        target: "android",
        aspect: "portrait",
    },
    {
        id: "stormy-fjord",
        label: "Fjord sous l'orage",
        description: "Fond vertical : parois sombres et nuages bas.",
        imageUrl: "/themes/neo-wallpapers/stormy-fjord.jpg",
        previewStyle: "image",
        target: "android",
        aspect: "portrait",
    },
    {
        id: "glacier-plateau",
        label: "Plateau glaciaire",
        description: "Fond vertical : glacier et versant ocre, ciel franc.",
        imageUrl: "/themes/neo-wallpapers/glacier-plateau.jpg",
        previewStyle: "image",
        target: "android",
        aspect: "portrait",
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
