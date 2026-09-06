/**
 * Where a day column sits, and where the grid has to be scrolled for it to land
 * on the rail.
 *
 * Two features move the grid sideways — the virtualized scroll that re-bases the
 * range (useInfiniteScroll) and the settle that puts the grid back on whole days
 * (useAxisLock) — and both have to agree on the same two numbers, or one pulls
 * against the other by the difference.
 */

/**
 * How far past the seam a day is parked, so only one line is painted there.
 *
 * The hours rail draws the grid's left line on its own right edge
 * (`.nc-left-rail-scrollable`), and every day column draws one on its left
 * (`.nc-timegrid-day`). Land a day exactly on the seam and BOTH are painted, a
 * pixel apart: the grid opens on a doubled rule where every other separator is
 * a single one. Scroll a little further and the column's own border passes
 * behind the rail's, clipped away by the scroller, leaving the one line the two
 * were always meant to be.
 *
 * TWO pixels, not the one the border is wide, and that is measured rather than
 * reasoned: on a phone at 3× the doubled line was still there with the day at
 * −0.17, and gone with it at −1.96. A border that ends exactly on the clip is a
 * boundary case, and a boundary case at a third of a pixel is a coin toss — the
 * sliver that gets through is thin, but a thin second line is the whole
 * complaint. The extra pixel costs the first day one pixel of its own content,
 * off the edge of the screen, where nothing is.
 */
export const COLUMN_SEAM_PX = 2;

/**
 * How wide one day is, for when the columns cannot be measured directly.
 *
 * Zero means there is nothing to land on: a view with no days in it yet.
 */
export function pageWidthFor(
    viewportWidth: number,
    daysPerView: number
): number {
    if (!(daysPerView > 0) || !(viewportWidth > 0)) return 0;
    return viewportWidth / daysPerView;
}

/**
 * How wide one day is: the distance from one column to the next.
 *
 * The PITCH, and not the width of a column, even though the two are the same
 * number as long as every column is identical. They were not: the first one had
 * its left border dropped, which made it a pixel narrower than the rest, and
 * this function reads whichever column it finds first. A day's width is used to
 * re-base the range by whole days, so that pixel came off the grid on every
 * shift and left the day short of the rail — the doubled line, arriving one
 * swipe at a time. Two columns cannot lie about the distance between them.
 *
 * Never `offsetWidth` either: it is rounded to whole pixels, and the position
 * the grid opens on is three days of it. `getBoundingClientRect` keeps the
 * fraction.
 */
export function measureColumnWidth(
    scroller: HTMLElement,
    daysPerView: number
): number {
    const columns = scroller.querySelectorAll<HTMLElement>(".nc-timegrid-day");
    if (columns.length >= 2) {
        const pitch =
            columns[1].getBoundingClientRect().left -
            columns[0].getBoundingClientRect().left;
        if (pitch > 0) return pitch;
    }
    const measured = columns.length
        ? columns[0].getBoundingClientRect().width
        : 0;
    if (measured > 0) return measured;
    return pageWidthFor(scroller.clientWidth, daysPerView);
}

/** Where the grid is scrolled for `dayIndex` to sit against the hours rail.
 *
 *  The arithmetic answer, for the one moment there is nothing to measure: the
 *  columns are not in the document yet. Everywhere else, ask them — see
 *  `offsetToDay` for why the arithmetic is not to be trusted on its own. */
export function scrollLeftForDay(
    dayIndex: number,
    columnWidth: number
): number {
    if (!(columnWidth > 0)) return 0;
    return dayIndex * columnWidth + COLUMN_SEAM_PX;
}

/**
 * A day column's left edge, relative to the grid's left edge, for every column
 * on the page. Empty when the grid holds no days yet.
 */
function columnEdges(scroller: HTMLElement): number[] {
    const columns = scroller.querySelectorAll<HTMLElement>(".nc-timegrid-day");
    if (!columns.length) return [];
    const origin = scroller.getBoundingClientRect().left;
    return Array.from(
        columns,
        (column) => column.getBoundingClientRect().left - origin
    );
}

/**
 * Nudged onto a device pixel, on the side that hides the line.
 *
 * A screen at 2.75× cannot place a scroll offset on any fraction it is asked
 * for: the browser lands on a whole device pixel, and rounding the wrong way
 * leaves a sliver of the day's own border showing beside the rail's — which,
 * from a hand's distance, is the doubled line all over again, thinner. Rounding
 * up always moves the grid a hair FURTHER right, which is the direction that
 * tucks the border away.
 */
function ontoDevicePixel(distance: number): number {
    const ratio =
        typeof window !== "undefined" && window.devicePixelRatio > 0
            ? window.devicePixelRatio
            : 1;
    return Math.ceil(distance * ratio) / ratio;
}

/**
 * How far the grid has to move for `dayIndex` to sit against the hours rail.
 *
 * MEASURED, never computed. Where a column actually is depends on things this
 * module cannot see and should not have to: whether a box counts its border in
 * its width, a floor width that stops the columns being shared out evenly, the
 * sub-pixel rounding of a flex layout on the device it is running on. Reading
 * the arithmetic instead was worth several pixels at the left edge, and every
 * one of them showed as the grid opening on two lines instead of one.
 *
 * Null when there is nothing to measure — the columns are not on the page yet.
 */
export function offsetToDay(
    scroller: HTMLElement,
    dayIndex: number
): number | null {
    const edges = columnEdges(scroller);
    const edge = edges[dayIndex];
    if (edge === undefined) return null;
    return ontoDevicePixel(edge + COLUMN_SEAM_PX);
}

/** Ce qu'il faut voir d'une colonne pour dire qu'elle est à l'écran.
 *
 *  Un cheveu de colonne qui dépasse du bord n'est pas une colonne affichée :
 *  c'est l'arrondi du défilement. Au-delà, une barre y est bel et bien peinte,
 *  et la bande doit lui faire de la place. */
const VISIBLE_COLUMN_MIN_PX = 2;

/**
 * Les colonnes de jour RÉELLEMENT peintes à l'écran, premières et dernières
 * incluses, en index de la liste rendue (dates étendues, tampons compris).
 *
 * Le défilement horizontal est continu et virtualisé : la plage logique de
 * jours ne se décale qu'une fois un seuil franchi, si bien qu'entre deux
 * rebasages une colonne du tampon est visible pour de bon. Se fier à la plage
 * logique, c'est traiter comme hors écran des jours que l'utilisateur regarde.
 *
 * Mesuré, jamais calculé : `columnEdges` donne déjà chaque bord relativement au
 * conteneur, donc après défilement — il n'y a pas de `scrollLeft` à ajouter.
 *
 * Null quand il n'y a rien à mesurer (aucune colonne, ou pas de largeur).
 */
export function visibleColumnRange(
    scroller: HTMLElement
): { first: number; last: number } | null {
    const edges = columnEdges(scroller);
    if (!edges.length) return null;
    const viewport = scroller.clientWidth;
    if (!(viewport > 0)) return null;

    // La dernière colonne n'a pas de voisine pour donner sa largeur : elle
    // reprend le pas des deux premières, à défaut la fenêtre entière.
    const pitch = edges.length >= 2 ? edges[1] - edges[0] : viewport;

    let first = -1;
    let last = -1;
    for (let i = 0; i < edges.length; i++) {
        const left = edges[i];
        const right = i + 1 < edges.length ? edges[i + 1] : left + pitch;
        const shown = Math.min(right, viewport) - Math.max(left, 0);
        if (shown < VISIBLE_COLUMN_MIN_PX) continue;
        if (first === -1) first = i;
        last = i;
    }
    return first === -1 ? null : { first, last };
}

/**
 * How far the grid has to move for the NEAREST day to sit against the rail —
 * the shortest way out of a position between two days.
 */
export function offsetToNearestDay(scroller: HTMLElement): number | null {
    const edges = columnEdges(scroller);
    if (!edges.length) return null;
    let shortest: number | null = null;
    for (const edge of edges) {
        const distance = edge + COLUMN_SEAM_PX;
        if (shortest === null || Math.abs(distance) < Math.abs(shortest)) {
            shortest = distance;
        }
    }
    return shortest === null ? null : ontoDevicePixel(shortest);
}
