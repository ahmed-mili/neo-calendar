import { WallpaperCredit } from "./wallpaperCredit";

export const WALLPAPER_IDS = [
    "theme-default",
    "violet-forest-bloom",
    "violet-forest-bloom-portrait",
    "cloudlaced-ranges",
    "cloudlaced-ranges-portrait",
    "panorama-valley",
    "panorama-valley-portrait",
    "milky-way-trail",
    "milky-way-trail-portrait",
    "sunlit-canyon",
    "sunlit-canyon-portrait",
    "whale-tail-cliffs",
    "whale-tail-cliffs-portrait",
    "white-forest-flowers",
    "white-forest-flowers-portrait",
    "golden-gate-night",
    "golden-gate-night-portrait",
    "island-sunset",
    "island-sunset-portrait",
    "tropical-palm-coast",
    "tropical-palm-coast-portrait",
    "starlit-snow-peak",
    "starlit-snow-peak-portrait",
    "steep-blue-ridges",
    "steep-blue-ridges-portrait",
    "golden-snow-range",
    "golden-snow-range-portrait",
    "gapstow-autumn",
    "gapstow-autumn-portrait",
    "coastal-hills-dusk",
    "coastal-hills-dusk-portrait",
    "autumn-forest-path",
    "autumn-forest-path-portrait",
    "turquoise-shallows",
    "turquoise-shallows-portrait",
    "monument-valley-stars",
    "monument-valley-stars-portrait",
    "cloudveil-fjord",
    "cloudveil-fjord-portrait",
    "golden-summit",
    "golden-summit-portrait",
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
     * D'où vient l'image.
     *
     * Chaque photo du catalogue a été choisie dans les favoris Unsplash
     * d'Ahmed, et son auteur comme sa page ont été relevés sur Unsplash même,
     * une par une. Le champ reste optionnel parce qu'une couleur unie et le
     * fond du thème ne sont la photo de personne — mais une photo sans crédit
     * n'entre plus dans ce catalogue.
     */
    credit?: WallpaperCredit;
}

/**
 * Les vingt photos, chacune livrée dans les deux formats.
 *
 * Le catalogue est monté à partir de cette table plutôt qu'écrit deux fois :
 * une photo, c'est un auteur, une page et un texte — le format d'écran est ce
 * qui varie, pas la photo. Chaque entrée produit donc un fond paysage pour les
 * écrans d'ordinateur et un fond portrait pour les téléphones, et l'appareil ne
 * voit que celui qui lui va (`getWallpapersForRuntime`).
 *
 * Les deux fichiers sont recadrés par Unsplash depuis le même original, jamais
 * regénérés : c'est bien la photo de l'auteur crédité qui s'affiche, dans un
 * cadre différent.
 *
 * `portraitId` est écrit en toutes lettres, et non déduit de `id`, pour que le
 * compilateur vérifie qu'il existe dans `WALLPAPER_IDS` : un identifiant mal
 * orthographié serait sinon un fond introuvable découvert à l'exécution.
 */
interface CataloguePhoto {
    readonly id: WallpaperId;
    readonly portraitId: WallpaperId;
    readonly label: string;
    readonly description: string;
    /** Qui l'a prise. Relevé sur la page Unsplash, jamais deviné. */
    readonly author: string;
    /** Sa page chez Unsplash — l'original, en pleine résolution. */
    readonly page: string;
}

const PHOTOS: readonly CataloguePhoto[] = [
    {
        id: "violet-forest-bloom",
        portraitId: "violet-forest-bloom-portrait",
        label: "Sous-bois en fleurs",
        description: "Le soleil traverse les arbres jusqu'à un tapis violet.",
        author: "Uran Wang",
        page: "https://unsplash.com/photos/la-lumiere-du-soleil-traverse-les-arbres-jusqua-un-champ-de-fleurs-violettes-TVORvlpH2ZY",
    },
    {
        id: "cloudlaced-ranges",
        portraitId: "cloudlaced-ranges-portrait",
        label: "Crêtes et nuages",
        description: "Des sommets enneigés au-dessus d'une mer de nuages.",
        author: "Nicolas Prieto",
        page: "https://unsplash.com/photos/chaines-de-montagnes-couvertes-de-nuages-sMJaf08ugD0",
    },
    {
        id: "panorama-valley",
        portraitId: "panorama-valley-portrait",
        label: "Vallée panoramique",
        description: "Une vallée ouverte, les montagnes en arrière-plan.",
        author: "Daniel Seßler",
        page: "https://unsplash.com/photos/une-vue-panoramique-dune-vallee-avec-des-montagnes-en-arriere-plan-yVkwJVCAnXs",
    },
    {
        id: "milky-way-trail",
        portraitId: "milky-way-trail-portrait",
        label: "Sentier sous la Voie lactée",
        description: "La Voie lactée s'arque au-dessus d'un chemin de pierres.",
        author: "Sebastian Knoll",
        page: "https://unsplash.com/photos/voie-lactee-sarquant-au-dessus-dun-sentier-rocheux-IPCh5x1whiQ",
    },
    {
        id: "sunlit-canyon",
        portraitId: "sunlit-canyon-portrait",
        label: "Canyon au soleil",
        description: "Roches et végétation clairsemée en plein soleil.",
        author: "NIR HIMI",
        page: "https://unsplash.com/photos/canyon-desertique-baigne-de-soleil-avec-des-formations-rocheuses-et-une-vegetation-clairsemee-Rv2yB04plX8",
    },
    {
        id: "whale-tail-cliffs",
        portraitId: "whale-tail-cliffs-portrait",
        label: "Baleine sous les falaises",
        description: "Une baleine sort de l'eau sombre au pied des rochers.",
        author: "Marek Piwnicki",
        page: "https://unsplash.com/photos/queue-de-baleine-emergeant-de-leau-sombre-pres-des-falaises-rocheuses-tv8swoH1aOY",
    },
    {
        id: "white-forest-flowers",
        portraitId: "white-forest-flowers-portrait",
        label: "Anémones des bois",
        description: "Des fleurs blanches en sous-bois, au milieu du jour.",
        author: "Kasia Gajek",
        page: "https://unsplash.com/photos/fleurs-blanches-dans-la-foret-pendant-la-journee-Dpf1iwtX2Yo",
    },
    {
        id: "golden-gate-night",
        portraitId: "golden-gate-night-portrait",
        label: "Golden Gate la nuit",
        description: "Le pont illuminé sous un ciel de traîne.",
        author: "Justin Wolff",
        page: "https://unsplash.com/photos/le-golden-gate-bridge-est-illumine-la-nuit-Macs-aqy6Ek",
    },
    {
        id: "island-sunset",
        portraitId: "island-sunset-portrait",
        label: "Île au couchant",
        description: "Un coucher de soleil sur une île au milieu de l'océan.",
        author: "Daniel Seßler",
        page: "https://unsplash.com/photos/un-magnifique-coucher-de-soleil-sur-une-petite-ile-au-milieu-de-locean-xHxfXRbTG1Y",
    },
    {
        id: "tropical-palm-coast",
        portraitId: "tropical-palm-coast-portrait",
        label: "Côte tropicale",
        description: "Des palmiers au bord d'une eau turquoise et claire.",
        author: "Marcreation",
        page: "https://unsplash.com/photos/cote-tropicale-diles-avec-des-palmiers-et-une-eau-turquoise-claire-fV_qtB_sTV8",
    },
    {
        id: "starlit-snow-peak",
        portraitId: "starlit-snow-peak-portrait",
        label: "Sommet sous les étoiles",
        description: "Une montagne enneigée sous un ciel constellé.",
        author: "Benjamin Voros",
        page: "https://unsplash.com/photos/montagne-enneigee-sous-les-etoiles-phIFdC6lA4E",
    },
    {
        id: "steep-blue-ridges",
        portraitId: "steep-blue-ridges-portrait",
        label: "Crêtes escarpées",
        description: "Des versants abrupts sous un ciel bleu franc.",
        author: "Marek Piwnicki",
        page: "https://unsplash.com/photos/montagnes-escarpees-sous-un-ciel-bleu-avec-des-nuages-blancs-I3HjjiGRnko",
    },
    {
        id: "golden-snow-range",
        portraitId: "golden-snow-range-portrait",
        label: "Chaîne dorée",
        description: "Des sommets enneigés pris dans un soleil doré.",
        author: "Marek Piwnicki",
        page: "https://unsplash.com/photos/majestueuses-montagnes-enneigees-baignees-dun-soleil-dore-VksMwErxR9c",
    },
    {
        id: "gapstow-autumn",
        portraitId: "gapstow-autumn-portrait",
        label: "Pont de Gapstow",
        description: "Le pont entouré d'arbres d'automne, à New York.",
        author: "Juan Di Nella",
        page: "https://unsplash.com/photos/pont-de-gapstow-a-lautomne-a-new-york-ne1X1c9M0Hg",
    },
    {
        id: "coastal-hills-dusk",
        portraitId: "coastal-hills-dusk-portrait",
        label: "Collines au crépuscule",
        description:
            "Collines et océan dans une lumière chaude de fin de jour.",
        author: "Antonin Fontaine",
        page: "https://unsplash.com/photos/collines-et-ocean-au-coucher-du-soleil-avec-une-lumiere-chaude-YiRaXIR5Etk",
    },
    {
        id: "autumn-forest-path",
        portraitId: "autumn-forest-path-portrait",
        label: "Chemin d'automne",
        description: "Un chemin de terre dans une forêt aux feuilles jaunes.",
        author: "Daniel Seßler",
        page: "https://unsplash.com/photos/chemin-de-terre-a-travers-la-foret-dautomne-_3DI_vx2ygg",
    },
    {
        id: "turquoise-shallows",
        portraitId: "turquoise-shallows-portrait",
        label: "Hauts-fonds turquoise",
        description: "Vue aérienne d'un sable clair sous une eau peu profonde.",
        author: "Rod Long",
        page: "https://unsplash.com/photos/vue-aerienne-dune-cote-sablonneuse-avec-une-eau-turquoise-peu-profonde-iqBc91jdqoQ",
    },
    {
        id: "monument-valley-stars",
        portraitId: "monument-valley-stars-portrait",
        label: "Monument Valley étoilée",
        description: "Un ciel constellé au-dessus des buttes du désert.",
        author: "Joseph Corl",
        page: "https://unsplash.com/photos/voie-lactee-au-dessus-des-buttes-de-la-vallee-du-monument-BMhglVdk3lA",
    },
    {
        id: "cloudveil-fjord",
        portraitId: "cloudveil-fjord-portrait",
        label: "Fjord sous les nuages",
        description: "Un fjord encerclé de montagnes prises dans les nuages.",
        author: "Marek Piwnicki",
        page: "https://unsplash.com/photos/fjord-entoure-de-montagnes-spectaculaires-couvertes-de-nuages-jMPwiaqRXzI",
    },
    {
        id: "golden-summit",
        portraitId: "golden-summit-portrait",
        label: "Sommet doré",
        description: "Une cime enneigée prise dans un soleil rasant.",
        author: "Marek Piwnicki",
        page: "https://unsplash.com/photos/un-sommet-enneige-baigne-dun-soleil-dore-E909Oe4N3pM",
    },
];

export const DEFAULT_WALLPAPER_ID: WallpaperId = "theme-default";
export const DEFAULT_ANDROID_WALLPAPER_ID: WallpaperId =
    "starlit-snow-peak-portrait";

/** Les deux fonds tirés d'une même photo : l'écran large, puis le téléphone. */
function bothFormats(photo: CataloguePhoto): WallpaperDefinition[] {
    const credit: WallpaperCredit = {
        author: photo.author,
        source: "Unsplash",
        url: photo.page,
    };

    return [
        {
            id: photo.id,
            label: photo.label,
            description: photo.description,
            imageUrl: `/themes/neo-wallpapers/${photo.id}.jpg`,
            previewStyle: "image",
            target: "pc",
            aspect: "landscape",
            credit,
        },
        {
            id: photo.portraitId,
            label: photo.label,
            description: photo.description,
            imageUrl: `/themes/neo-wallpapers/${photo.portraitId}.jpg`,
            previewStyle: "image",
            target: "android",
            aspect: "portrait",
            credit,
        },
    ];
}

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
    ...PHOTOS.flatMap(bothFormats),
    {
        id: "none",
        label: "Aucun",
        description: "Aucune image : la couleur de fond du thème seule.",
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
