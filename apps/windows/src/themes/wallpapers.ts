import { WallpaperCredit } from "./wallpaperCredit";

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
    "alpine-lake-sunset",
    "alpine-turquoise-lake",
    "aurora-lake-night",
    "coastal-city-night",
    "milky-way-mountain",
    "misty-forest-dawn",
    "neon-city-sunset",
    "orange-mountain-sunset",
    "tropical-beach-aerial",
    "turquoise-waves-aerial",
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
    /**
     * D'où vient l'image, quand on le sait.
     *
     * Le catalogue s'est rempli en deposant des fichiers dans un dossier, et
     * rien n'a jamais note leur origine : la plupart des entrees n'ont donc pas
     * encore de credit, et `needsCredit` (wallpaperCredit.ts) dit lesquelles.
     * Absent vaut « on ne sait pas », jamais « personne » — un credit invente
     * designe quelqu'un d'autre, ce qui est pire que pas de credit du tout.
     */
    credit?: WallpaperCredit;
}

/**
 * D'ou viennent les photos du catalogue.
 *
 * Ahmed, qui les a choisies, dit qu'elles viennent toutes d'Unsplash. Le lien
 * pointe vers Unsplash et non vers chaque photo : rien n'a jamais note de
 * quelle page chacune vient, et inventer vingt-cinq adresses reviendrait a
 * designer vingt-cinq photos au hasard. Le jour ou les pages sont connues, il
 * suffit de poser `url` sur l'entree concernee — c'est pour cela que le champ
 * est par fond et non global.
 */
const UNSPLASH = { source: "Unsplash", url: "https://unsplash.com" } as const;

/**
 * Celle dont le fichier dit lui-meme comment elle a ete faite.
 *
 * `starlit-alpine-refuge.jpg` porte une signature C2PA d'OpenAI Media Service,
 * dans le JPEG. Une image generee peut parfaitement etre publiee sur Unsplash,
 * donc les deux tiennent ensemble : la source reste Unsplash, et ce que le
 * fichier prouve n'est pas jete.
 */
const UNSPLASH_GENERATED = {
    source: "Unsplash · image générée",
    url: "https://unsplash.com",
} as const;

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
        credit: UNSPLASH,
    },
    {
        id: "android-rose-summit",
        label: "Sommet Rose",
        description: "Fond vertical Android aux tons rose et bleu.",
        imageUrl: "/themes/neo-wallpapers/android-rose-summit.jpg",
        previewStyle: "image",
        target: "android",
        aspect: "portrait",
        credit: UNSPLASH,
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
        credit: UNSPLASH_GENERATED,
    },
    {
        id: "mountain-sunset",
        label: "Mountain Sunset",
        description: "Fond horizontal optimisé pour PC et grands écrans.",
        imageUrl: "/themes/catppuccin-mocha/mountain-sunset.jpg",
        previewStyle: "image",
        target: "pc",
        aspect: "landscape",
        credit: UNSPLASH,
    },
    {
        id: "alpine-crown",
        label: "Couronne alpine",
        description: "Fond horizontal : crête enneigée au soleil rasant.",
        imageUrl: "/themes/neo-wallpapers/alpine-crown.jpg",
        previewStyle: "image",
        target: "pc",
        aspect: "landscape",
        credit: UNSPLASH,
    },
    {
        id: "dolomite-dawn",
        label: "Aube des Dolomites",
        description: "Fond horizontal : sommet doré sous un ciel mauve.",
        imageUrl: "/themes/neo-wallpapers/dolomite-dawn.jpg",
        previewStyle: "image",
        target: "pc",
        aspect: "landscape",
        credit: UNSPLASH,
    },
    {
        id: "dolomite-haze",
        label: "Brume des Dolomites",
        description: "Fond horizontal : crêtes roses au-dessus de la brume.",
        imageUrl: "/themes/neo-wallpapers/dolomite-haze.jpg",
        previewStyle: "image",
        target: "pc",
        aspect: "landscape",
        credit: UNSPLASH,
    },
    {
        id: "emerald-cove",
        label: "Crique émeraude",
        description: "Fond horizontal : eau turquoise au pied d'une falaise.",
        imageUrl: "/themes/neo-wallpapers/emerald-cove.jpg",
        previewStyle: "image",
        target: "pc",
        aspect: "landscape",
        credit: UNSPLASH,
    },
    {
        id: "lofoten-fjord",
        label: "Fjord des Lofoten",
        description: "Fond horizontal : parois sombres et nuages bas.",
        imageUrl: "/themes/neo-wallpapers/lofoten-fjord.jpg",
        previewStyle: "image",
        target: "pc",
        aspect: "landscape",
        credit: UNSPLASH,
    },
    {
        id: "glacier-ridge",
        label: "Crête glaciaire",
        description: "Fond horizontal : glacier et ciel bleu franc.",
        imageUrl: "/themes/neo-wallpapers/glacier-ridge.jpg",
        previewStyle: "image",
        target: "pc",
        aspect: "landscape",
        credit: UNSPLASH,
    },
    {
        id: "golden-crest",
        label: "Crête dorée",
        description: "Fond vertical : sommet au soleil rasant, ciel profond.",
        imageUrl: "/themes/neo-wallpapers/golden-crest.jpg",
        previewStyle: "image",
        target: "android",
        aspect: "portrait",
        credit: UNSPLASH,
    },
    {
        id: "ember-dolomites",
        label: "Dolomites incandescentes",
        description: "Fond vertical : ciel orangé au-dessus de la brume.",
        imageUrl: "/themes/neo-wallpapers/ember-dolomites.jpg",
        previewStyle: "image",
        target: "android",
        aspect: "portrait",
        credit: UNSPLASH,
    },
    {
        id: "turquoise-lagoon",
        label: "Lagon turquoise",
        description: "Fond vertical : eau claire au pied d'une falaise verte.",
        imageUrl: "/themes/neo-wallpapers/turquoise-lagoon.jpg",
        previewStyle: "image",
        target: "android",
        aspect: "portrait",
        credit: UNSPLASH,
    },
    {
        id: "stormy-fjord",
        label: "Fjord sous l'orage",
        description: "Fond vertical : parois sombres et nuages bas.",
        imageUrl: "/themes/neo-wallpapers/stormy-fjord.jpg",
        previewStyle: "image",
        target: "android",
        aspect: "portrait",
        credit: UNSPLASH,
    },
    {
        id: "glacier-plateau",
        label: "Plateau glaciaire",
        description: "Fond vertical : glacier et versant ocre, ciel franc.",
        imageUrl: "/themes/neo-wallpapers/glacier-plateau.jpg",
        previewStyle: "image",
        target: "android",
        aspect: "portrait",
        credit: UNSPLASH,
    },
    {
        id: "alpine-lake-sunset",
        label: "Lac alpin au couchant",
        description:
            "Fond vertical : ciel pourpre reflété sur un lac de montagne.",
        imageUrl: "/themes/neo-wallpapers/alpine-lake-sunset.jpg",
        previewStyle: "image",
        target: "android",
        aspect: "portrait",
        credit: UNSPLASH,
    },
    {
        id: "alpine-turquoise-lake",
        label: "Lac alpin turquoise",
        description:
            "Fond vertical : eau turquoise au pied de cimes enneigées.",
        imageUrl: "/themes/neo-wallpapers/alpine-turquoise-lake.jpg",
        previewStyle: "image",
        target: "android",
        aspect: "portrait",
        credit: UNSPLASH,
    },
    {
        id: "aurora-lake-night",
        label: "Aurores boréales",
        description:
            "Fond vertical : voiles verts au-dessus d'un lac, la nuit.",
        imageUrl: "/themes/neo-wallpapers/aurora-lake-night.jpg",
        previewStyle: "image",
        target: "android",
        aspect: "portrait",
        credit: UNSPLASH,
    },
    {
        id: "coastal-city-night",
        label: "Ville côtière la nuit",
        description:
            "Fond vertical : gratte-ciel et traînées de phares au bord de l'eau.",
        imageUrl: "/themes/neo-wallpapers/coastal-city-night.jpg",
        previewStyle: "image",
        target: "android",
        aspect: "portrait",
        credit: UNSPLASH,
    },
    {
        id: "milky-way-mountain",
        label: "Voie lactée",
        description:
            "Fond vertical : cœur de la galaxie au-dessus d'une crête sombre.",
        imageUrl: "/themes/neo-wallpapers/milky-way-mountain.jpg",
        previewStyle: "image",
        target: "android",
        aspect: "portrait",
        credit: UNSPLASH,
    },
    {
        id: "misty-forest-dawn",
        label: "Forêt brumeuse",
        description:
            "Fond vertical : lumière du matin filtrée entre les troncs.",
        imageUrl: "/themes/neo-wallpapers/misty-forest-dawn.jpg",
        previewStyle: "image",
        target: "android",
        aspect: "portrait",
        credit: UNSPLASH,
    },
    {
        id: "neon-city-sunset",
        label: "Ville néon",
        description:
            "Fond vertical : crépuscule magenta sur une skyline de néons.",
        imageUrl: "/themes/neo-wallpapers/neon-city-sunset.jpg",
        previewStyle: "image",
        target: "android",
        aspect: "portrait",
        credit: UNSPLASH,
    },
    {
        id: "orange-mountain-sunset",
        label: "Coucher orangé",
        description:
            "Fond vertical : soleil rasant sur des crêtes en ombres chinoises.",
        imageUrl: "/themes/neo-wallpapers/orange-mountain-sunset.jpg",
        previewStyle: "image",
        target: "android",
        aspect: "portrait",
        credit: UNSPLASH,
    },
    {
        id: "tropical-beach-aerial",
        label: "Plage tropicale",
        description:
            "Fond vertical : vue aérienne d'un sable blanc et d'un récif turquoise.",
        imageUrl: "/themes/neo-wallpapers/tropical-beach-aerial.jpg",
        previewStyle: "image",
        target: "android",
        aspect: "portrait",
        credit: UNSPLASH,
    },
    {
        id: "turquoise-waves-aerial",
        label: "Vagues turquoise",
        description:
            "Fond vertical : vue aérienne d'un rouleau d'écume sur une eau claire.",
        imageUrl: "/themes/neo-wallpapers/turquoise-waves-aerial.jpg",
        previewStyle: "image",
        target: "android",
        aspect: "portrait",
        credit: UNSPLASH,
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
