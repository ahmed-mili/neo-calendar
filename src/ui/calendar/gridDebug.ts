import { COLUMN_SEAM_PX } from "./gridColumns";

/**
 * The grid's left edge, in numbers, on the screen it is actually running on.
 *
 * Two lines a pixel or two apart cannot be argued about from here: a phone at
 * 2.75× draws them from a layout this machine never performs, and every fix so
 * far has been a hypothesis about which of them moved. So the build says what
 * it measures — where the rail ends, where the grid begins, where the nearest
 * day's own edge sits — and a photograph of the screen settles it.
 *
 * Three numbers matter, and they fail in different ways:
 *
 *   rail→grid   the gap between the end of the hours rail and the start of the
 *               scrolling grid. It must be 0. Anything else is a hole in the
 *               LAYOUT, and no amount of scrolling will ever close it.
 *   day         where the nearest day column's left edge sits, measured from
 *               the grid's own left edge. It must be −1: one pixel to the left,
 *               so the column's border is clipped away and the rail's line is
 *               the only one painted.
 *   owed        what the alignment thinks is still to be done. It must be ~0
 *               once the grid has come to rest.
 */

const READOUT_CLASS = "nc-debug-readout";
const DEBUG_CLASS = "nc-debug-lines";

function round(value: number, places = 2): string {
    return Number.isFinite(value) ? value.toFixed(places) : "—";
}

/** The column whose left edge is nearest the grid's, and how far off it is. */
function nearestColumn(scroller: HTMLElement): {
    index: number;
    offset: number;
} | null {
    const columns = scroller.querySelectorAll<HTMLElement>(".nc-timegrid-day");
    if (!columns.length) return null;
    const origin = scroller.getBoundingClientRect().left;
    let best: { index: number; offset: number } | null = null;
    columns.forEach((column, index) => {
        const offset = column.getBoundingClientRect().left - origin;
        if (!best || Math.abs(offset) < Math.abs(best.offset)) {
            best = { index, offset };
        }
    });
    return best;
}

/**
 * Colours the lines and mounts the readout. Returns the way to undo both.
 *
 * Measured on a frame of its own, and only when something moved: the point is
 * to watch the grid, not to change how it behaves while being watched.
 */
export function enableGridLineDebug(host: HTMLElement | null): () => void {
    if (!host || typeof document === "undefined") return () => undefined;

    document.documentElement.classList.add(DEBUG_CLASS);

    const readout = document.createElement("div");
    readout.className = READOUT_CLASS;
    document.body.appendChild(readout);

    let frame = 0;

    const draw = () => {
        frame = 0;
        const scroller = host.querySelector<HTMLElement>(".nc-main-scroller");
        const rail = host.querySelector<HTMLElement>(".nc-left-rail");
        if (!scroller || !rail) return;

        // The band, across the seam: the gutter beside the chevron and the band
        // of events are two elements that have to agree on where they start and
        // where they stop, or the rules that close them are drawn at two
        // different heights and the row reads as crooked.
        const gutter = host.querySelector<HTMLElement>(".nc-left-rail-allday");
        const band = host.querySelector<HTMLElement>(".nc-allday-row");
        const bandTop =
            gutter && band
                ? band.getBoundingClientRect().top -
                  gutter.getBoundingClientRect().top
                : Number.NaN;
        const bandBottom =
            gutter && band
                ? band.getBoundingClientRect().bottom -
                  gutter.getBoundingClientRect().bottom
                : Number.NaN;

        const gridLeft = scroller.getBoundingClientRect().left;
        const railRight = rail.getBoundingClientRect().right;
        const nearest = nearestColumn(scroller);
        const owed =
            nearest === null ? Number.NaN : nearest.offset + COLUMN_SEAM_PX;

        // Wanted: gap 0, day −1, owed 0. Anything else is named on the spot.
        const gap = gridLeft - railRight;
        const flag = (value: number, tolerance = 0.05) =>
            Math.abs(value) <= tolerance ? "b" : "i";

        readout.innerHTML =
            // Said by the build itself, not only by the page it came from: a
            // phone that has been carrying this for a week should not have to
            // be asked which one it is running.
            `<u>VERSION DEBUG</u>\n` +
            `dpr ${round(window.devicePixelRatio, 2)}  ` +
            `sl ${round(scroller.scrollLeft)}\n` +
            `rail→grid <${flag(gap)}>${round(gap)}</${flag(gap)}>` +
            `   (want 0)\n` +
            `day[${nearest ? nearest.index : "—"}] ` +
            `<${flag(owed)}>${round(nearest ? nearest.offset : Number.NaN)}` +
            `</${flag(owed)}>   (want ${-COLUMN_SEAM_PX})\n` +
            `owed <${flag(owed)}>${round(owed)}</${flag(owed)}>` +
            `   (want 0)\n` +
            `band ▲<${flag(bandTop)}>${round(bandTop)}</${flag(bandTop)}> ` +
            `▼<${flag(bandBottom)}>${round(bandBottom)}</${flag(bandBottom)}>` +
            `  (want 0)`;
    };

    const schedule = () => {
        if (!frame) frame = requestAnimationFrame(draw);
    };

    draw();
    const scroller = host.querySelector<HTMLElement>(".nc-main-scroller");
    scroller?.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const ticking = window.setInterval(schedule, 500);

    return () => {
        window.clearInterval(ticking);
        if (frame) cancelAnimationFrame(frame);
        scroller?.removeEventListener("scroll", schedule);
        window.removeEventListener("resize", schedule);
        readout.remove();
        document.documentElement.classList.remove(DEBUG_CLASS);
    };
}
