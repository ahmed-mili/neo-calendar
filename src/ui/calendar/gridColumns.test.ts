import {
    COLUMN_SEAM_PX,
    measureColumnWidth,
    offsetToDay,
    offsetToNearestDay,
    pageWidthFor,
    scrollLeftForDay,
    visibleColumnRange,
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

/** A grid whose columns are laid out at `edges` (from the grid's own left
    edge) and are `widths` wide — the two being allowed to disagree, which is
    the whole point: a column that has lost a border is narrower than the
    distance from it to the next one. */
function gridOfColumns(
    edges: number[],
    widths: number[] = edges.map(() => 0),
    clientWidth = 400,
    origin = 64
): HTMLElement {
    const columns = edges.map(
        (edge, index) =>
            ({
                getBoundingClientRect: () => ({
                    left: origin + edge,
                    width: widths[index],
                }),
            } as unknown as HTMLElement)
    );
    return {
        clientWidth,
        getBoundingClientRect: () => ({ left: origin }),
        querySelectorAll: () => columns,
    } as unknown as HTMLElement;
}

/** A grid whose columns really are where `edges` says. */
const gridShowing = (edges: number[], origin = 64) =>
    gridOfColumns(
        edges,
        edges.map(() => 0),
        400,
        origin
    );

describe("measureColumnWidth", () => {
    it("keeps the fraction a whole-pixel measurement would round away", () => {
        expect(
            measureColumnWidth(gridOfColumns([0, 137.4, 274.8]), 2)
        ).toBeCloseTo(137.4, 5);
    });

    // The bug, in one assertion: the first column had lost its left border and
    // was a pixel narrower than the distance from it to the next. A day's width
    // re-bases the range by whole days, so that pixel came off the grid on
    // every shift — and the seam opened one swipe at a time.
    it("measures the distance between two columns, not the width of one", () => {
        const uneven = gridOfColumns([0, 171.3, 342.6], [170.3, 171.3, 171.3]);
        expect(measureColumnWidth(uneven, 2)).toBeCloseTo(171.3, 5);
    });

    it("falls back to the one column it has, then to the viewport", () => {
        expect(measureColumnWidth(gridOfColumns([0], [137.4]), 2)).toBeCloseTo(
            137.4,
            5
        );
        expect(measureColumnWidth(gridOfColumns([], [], 412), 2)).toBe(206);
        expect(measureColumnWidth(gridOfColumns([0], [0], 412), 2)).toBe(206);
    });

    it("has nothing to report when the view holds no days", () => {
        expect(measureColumnWidth(gridOfColumns([], [], 412), 0)).toBe(0);
    });
});

describe("visibleColumnRange", () => {
    // 13 colonnes de 100px (7 jours + 3 de tampon de chaque côté) dans une
    // fenêtre de 700px, la grille posée pile sur le premier jour officiel :
    // les colonnes 3 à 9 sont à l'écran, les tampons non.
    const columnsAt = (firstEdge: number) =>
        gridOfColumns(
            Array.from({ length: 13 }, (_, i) => firstEdge + i * 100),
            Array.from({ length: 13 }, () => 100),
            700
        );

    it("rend les colonnes à l'écran quand la grille est sur son jour", () => {
        expect(visibleColumnRange(columnsAt(-300))).toEqual({
            first: 3,
            last: 9,
        });
    });

    // Le défilement continu : la grille a avancé de deux jours, mais la plage
    // logique n'a pas encore été rebasée. Les colonnes 5 à 11 — deux jours de
    // tampon compris — sont bel et bien peintes.
    it("suit le défilement jusque dans le tampon, avant tout rebasage", () => {
        expect(visibleColumnRange(columnsAt(-500))).toEqual({
            first: 5,
            last: 11,
        });
    });

    it("ignore le cheveu de colonne laissé par l'arrondi", () => {
        // La colonne 2 ne montre qu'un pixel : c'est de l'arrondi, pas un jour.
        expect(visibleColumnRange(columnsAt(-299))).toEqual({
            first: 3,
            last: 9,
        });
        // Trois pixels, en revanche, c'est une barre qu'on voit.
        expect(visibleColumnRange(columnsAt(-297))).toEqual({
            first: 2,
            last: 9,
        });
    });

    it("n'a rien à dire sans colonne ni sans largeur", () => {
        expect(visibleColumnRange(gridOfColumns([], [], 700))).toBeNull();
        expect(visibleColumnRange(gridOfColumns([0, 100], [100, 100], 0))).toBe(
            null
        );
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
        expect(offsetToDay(grid, 1)).toBe(Math.ceil(200.4 + COLUMN_SEAM_PX));
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
