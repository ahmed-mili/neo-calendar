import {
    COLUMN_SEAM_PX,
    measureColumnWidth,
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
