/**
 * Dire d'où vient une photo, et le dire honnêtement.
 *
 * Les images du catalogue sont arrivées en les déposant dans un dossier, et
 * rien n'a jamais noté d'où. Un crédit sert à désigner qui a fait l'image ; un
 * crédit inventé désigne quelqu'un d'autre, ce qui est pire que pas de crédit
 * du tout. Le modèle laisse donc l'auteur absent quand il est inconnu, et
 * `needsCredit` dit lesquelles attendent encore une réponse plutôt que de
 * laisser le manque passer inaperçu.
 *
 * La source est un texte libre et non une liste fermée : les fonds ne viennent
 * pas tous du même endroit — Unsplash, Pexels, une image générée — et une
 * énumération figée obligerait à toucher au code pour en ajouter une.
 */

/** Ce qu'on sait de l'origine d'un fond d'écran. */
export interface WallpaperCredit {
    /** Qui l'a faite. Absent quand on ne le sait pas. */
    author?: string;
    /** D'où elle vient : « Unsplash », « Pexels », « Image générée »… */
    source: string;
    /**
     * L'original, en pleine résolution, chez sa source.
     *
     * Ce que l'application embarque est une version adaptée — recadrée au
     * format de l'écran, recompressée —, donc le lien ne pointe pas vers le
     * fichier livré mais vers la photo dont il est tiré.
     */
    url?: string;
}

/** Juste ce qu'il faut d'un fond pour savoir s'il doit un crédit. */
interface CreditableWallpaper {
    id: string;
    imageUrl: string | null;
    credit?: WallpaperCredit;
}

/** La ligne affichée sous le nom du fond, ou rien s'il n'y a rien à dire. */
export function creditLine(credit: WallpaperCredit | undefined): string | null {
    if (!credit) return null;
    return credit.author
        ? `${credit.author} · ${credit.source}`
        : credit.source;
}

/**
 * Le crédit tel que la source elle-même le formule : « Photo de Uran Wang ».
 *
 * Là où la marque est affichée à côté — le logo Unsplash sous la vignette —,
 * répéter « Unsplash » en toutes lettres dit deux fois la même chose et vole la
 * place du nom, qui est ce qu'un crédit sert à donner. Sans auteur connu, il ne
 * reste que la source, et c'est elle qui s'affiche.
 */
export function creditByline(
    credit: WallpaperCredit | undefined
): string | null {
    if (!credit) return null;
    return credit.author ? `Photo de ${credit.author}` : credit.source;
}

/** Si le fond vient d'Unsplash, dont on sait afficher la marque. */
export function isUnsplash(credit: WallpaperCredit | undefined): boolean {
    return credit?.source === "Unsplash";
}

/**
 * Les fonds qui attendent encore qu'on dise d'où ils viennent.
 *
 * Une couleur unie et le fond du thème ne sont la photo de personne.
 */
export function needsCredit(
    wallpapers: readonly CreditableWallpaper[]
): string[] {
    return wallpapers
        .filter((wallpaper) => wallpaper.imageUrl && !wallpaper.credit)
        .map((wallpaper) => wallpaper.id);
}
