export const WALLPAPER_IDS = [
    "theme-default",
    "mountain-sunset",
    "none",
] as const;

export type WallpaperId = (typeof WALLPAPER_IDS)[number];

export interface WallpaperDefinition {
    id: WallpaperId;
    label: string;
    description: string;
    imageUrl: string | null;
    previewStyle: "theme" | "image" | "solid";
}

export const DEFAULT_WALLPAPER_ID: WallpaperId = "theme-default";

/*
 * Add future wallpapers here. The selector and persistence layer consume this
 * registry automatically, so a new background only needs an id, label and URL.
 */
export const WALLPAPERS: readonly WallpaperDefinition[] = [
    {
        id: "theme-default",
        label: "Par défaut du thème",
        description: "Utilise le fond prévu par le thème sélectionné.",
        imageUrl: null,
        previewStyle: "theme",
    },
    {
        id: "mountain-sunset",
        label: "Mountain Sunset",
        description: "Paysage de montagne actuellement fourni avec Neo Calendar.",
        imageUrl: "/themes/catppuccin-mocha/mountain-sunset.jpg",
        previewStyle: "image",
    },
    {
        id: "none",
        label: "Aucun fond d’écran",
        description: "Utilise uniquement la couleur d’arrière-plan du thème.",
        imageUrl: null,
        previewStyle: "solid",
    },
];

export function isWallpaperId(value: unknown): value is WallpaperId {
    return (
        typeof value === "string" &&
        (WALLPAPER_IDS as readonly string[]).includes(value)
    );
}

export function getWallpaper(
    id: WallpaperId | string | null | undefined
): WallpaperDefinition {
    return (
        WALLPAPERS.find((wallpaper) => wallpaper.id === id) ?? WALLPAPERS[0]
    );
}
