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

/** Where the grid is scrolled for `dayIndex` to sit against the hours rail. */
export function scrollLeftForDay(
    dayIndex: number,
    columnWidth: number
): number {
    if (!(columnWidth > 0)) return 0;
    return dayIndex * columnWidth + COLUMN_SEAM_PX;
}
