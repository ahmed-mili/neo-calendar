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
 * The width of the line that closes the grid on its left.
 *
 * The hours rail draws it on its own right edge (`.nc-left-rail-scrollable`),
 * and every day column draws one on its left (`.nc-timegrid-day`). Land a day
 * exactly on the seam and BOTH are painted, a pixel apart: the grid opens on a
 * doubled rule where every other separator is a single one. One pixel further
 * right and the column's own border passes behind the rail's — clipped away by
 * the scroller — leaving the one line the two were always meant to be.
 *
 * Kept in step with the `border-left` of `.nc-timegrid-day` in CalendarGrid.css.
 */
export const COLUMN_SEAM_PX = 1;

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
 * How wide one day column really is, in fractional pixels.
 *
 * Never `offsetWidth`: it is rounded to whole pixels, and the position the grid
 * opens on is three columns of it (the buffer). Three roundings the same way put
 * the first day several pixels off the rail — which is exactly the drift this
 * measurement exists to avoid. `getBoundingClientRect` keeps the fraction.
 */
export function measureColumnWidth(
    scroller: HTMLElement,
    daysPerView: number
): number {
    const column = scroller.querySelector<HTMLElement>(".nc-timegrid-day");
    const measured = column ? column.getBoundingClientRect().width : 0;
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
