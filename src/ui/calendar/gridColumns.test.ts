import {
    COLUMN_SEAM_PX,
    measureColumnWidth,
    offsetToDay,
    offsetToNearestDay,
    pageWidthFor,
    scrollLeftForDay,
} from "./gridColumns";

describe("pageWidthFor", () => {
    it("turns one day at a time, whatever the view shows", () => {
        // 1-day view: a page and a screenful are the same thing.
        expect(pageWidthFor(412, 1)).toBe(412);
        // 2-day and 3-day views: still one day per swipe, so every pairing of
        // days can be reached. A screenful here would skip half of them.
        expect(pageWidthFor(412, 2)).toBe(206);
        expect(pageWidthFor(420, 3)).toBe(140);
        expect(pageWidthFor(700, 7)).toBe(100);
    });

    it("says there is nothing to page rather than divide by nothing", () => {
        expect(pageWidthFor(412, 0)).toBe(0);
        expect(pageWidthFor(412, -1)).toBe(0);
        expect(pageWidthFor(0, 3)).toBe(0);
    });
});

/** A scroller whose one day column measures `width`, fraction included. */
function scrollerWith(width: number | null, clientWidth = 400): HTMLElement {
    return {
        clientWidth,
        querySelector: () =>
            width === null
                ? null
                : ({
                      getBoundingClientRect: () => ({ width }),
                  } as unknown as HTMLElement),
    } as unknown as HTMLElement;
}

describe("measureColumnWidth", () => {
    it("keeps the fraction a whole-pixel measurement would round away", () => {
        expect(measureColumnWidth(scrollerWith(137.4), 2)).toBeCloseTo(
            137.4,
            5
        );
    });

    it("falls back to the viewport when there is no column to measure", () => {
        expect(measureColumnWidth(scrollerWith(null, 412), 2)).toBe(206);
        expect(measureColumnWidth(scrollerWith(0, 412), 2)).toBe(206);
    });

    it("has nothing to report when the view holds no days", () => {
        expect(measureColumnWidth(scrollerWith(null, 412), 0)).toBe(0);
    });
});

describe("scrollLeftForDay", () => {
    // Three buffer days of 137.4px are 412.2px, which a whole-pixel measurement
    // would have called 411 — three pixels of the day showing on the wrong side
    // of the rail. The seam is the pixel the rail's own line occupies.
    it("puts the day against the rail, behind the line the rail draws", () => {
        expect(scrollLeftForDay(3, 137.4)).toBeCloseTo(
            412.2 + COLUMN_SEAM_PX,
            5
        );
        expect(scrollLeftForDay(0, 137.4)).toBe(COLUMN_SEAM_PX);
    });

    it("stays at the start rather than scroll by a column of no width", () => {
        expect(scrollLeftForDay(3, 0)).toBe(0);
        expect(scrollLeftForDay(3, Number.NaN)).toBe(0);
    });
});

/** A grid whose columns really are where `edges` says, relative to its own
    left edge — the only thing the alignment is allowed to believe. */
function gridShowing(edges: number[], origin = 64): HTMLElement {
    return {
        getBoundingClientRect: () => ({ left: origin }),
        querySelectorAll: () =>
            edges.map(
                (edge) =>
                    ({
                        getBoundingClientRect: () => ({ left: origin + edge }),
                    } as unknown as HTMLElement)
            ),
    } as unknown as HTMLElement;
}

describe("offsetToDay", () => {
    // The column sits 412.2px along, and has to end up one pixel PAST the
    // grid's left edge so its own left border passes behind the rail's.
    it("moves the day onto the rail, border and all", () => {
        const grid = gridShowing([-824.4, -412.2, 0, 412.2, 824.4]);
        expect(offsetToDay(grid, 3)).toBe(Math.ceil(412.2 + COLUMN_SEAM_PX));
    });

    it("says how far BACK a day that has gone past the rail is", () => {
        const grid = gridShowing([-137.4, 0, 137.4]);
        expect(offsetToDay(grid, 0)).toBe(Math.ceil(-137.4 + COLUMN_SEAM_PX));
    });

    // A screen cannot be scrolled to a fraction of one of its own pixels, and
    // rounding the wrong way leaves a sliver of the day's border showing beside
    // the rail's. Up, always: that is the way that tucks it out of sight.
    it("lands on a whole device pixel, on the side that hides the line", () => {
        const grid = gridShowing([0, 200.4]);
        expect(offsetToDay(grid, 1)).toBe(202);
    });

    it("has nothing to measure before the columns are on the page", () => {
        expect(offsetToDay(gridShowing([]), 3)).toBeNull();
        expect(offsetToDay(gridShowing([0, 137]), 9)).toBeNull();
    });
});

describe("offsetToNearestDay", () => {
    it("takes the shortest way out of a position between two days", () => {
        // A third of a day past Tuesday: back to Tuesday, not on to Wednesday.
        const grid = gridShowing([-133, -3, 377]);
        expect(offsetToNearestDay(grid)).toBe(-3 + COLUMN_SEAM_PX);
    });

    it("goes forward when the day ahead is the closer one", () => {
        const grid = gridShowing([-377, -373, 7]);
        expect(offsetToNearestDay(grid)).toBe(7 + COLUMN_SEAM_PX);
    });

    it("has nothing to say about a grid with no days on it", () => {
        expect(offsetToNearestDay(gridShowing([]))).toBeNull();
    });
});
