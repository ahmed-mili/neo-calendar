/**
 * Fetching the wallpapers in one gesture rather than nine.
 *
 * The full-resolution photographs are not in the Android package: they are
 * downloaded when one is chosen. That is right for someone who wants one of
 * them, and wrong for someone setting the app up — choosing, waiting, reopening
 * the picker, choosing again, nine times, to end up where a single press should
 * have left them.
 *
 * The decisions live here: what is actually left to fetch, and what the button
 * says about it. The fetching itself is `ensureWallpaper`, one at a time —
 * several at once on a phone's connection is not faster, and it makes the
 * count meaningless.
 */

/** Just enough of a wallpaper to know whether it has a file to fetch. */
export interface FetchableWallpaper {
    id: string;
    imageUrl: string | null;
}

/** How a run is going: how many are through, and how many did not arrive. */
export interface BatchProgress {
    done: number;
    total: number;
    failed: number;
}

/**
 * The wallpapers whose file is not on this device yet.
 *
 * A solid colour has no file, and two entries can share one — the same
 * photograph cropped for a phone and for a desktop — so the same transfer is
 * asked for once.
 */
export function missingWallpapers<T extends FetchableWallpaper>(
    wallpapers: readonly T[],
    installed: ReadonlySet<string>,
    fileNameOf: (imageUrl: string) => string
): T[] {
    const wanted = new Set<string>();
    return wallpapers.filter((wallpaper) => {
        if (!wallpaper.imageUrl) return false;
        const file = fileNameOf(wallpaper.imageUrl);
        if (installed.has(file) || wanted.has(file)) return false;
        wanted.add(file);
        return true;
    });
}

/**
 * What the button says.
 *
 * Before: how many there are to fetch, because that is the one thing worth
 * knowing before pressing. During: how far along. After a run that lost some,
 * how many — a failure in the middle stops nothing, one photograph out of nine
 * is no reason to abandon the other eight, but it is said rather than passed
 * over.
 */
export function batchNote(
    progress: BatchProgress | null,
    missing: number
): string | null {
    if (progress && progress.done < progress.total) {
        return `Téléchargement… ${progress.done}/${progress.total}`;
    }
    if (progress && progress.failed > 0) {
        return progress.failed === 1
            ? "1 fond n'a pas pu être téléchargé — appuyez pour réessayer"
            : `${progress.failed} fonds n'ont pas pu être téléchargés — appuyez pour réessayer`;
    }
    return missing > 0 ? `Tout télécharger (${missing})` : null;
}
