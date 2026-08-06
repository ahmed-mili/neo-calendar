import {
    canStartDrawerGesture,
    drawerDragProgress,
    isVerticalGesture,
    settleDrawerOpen,
    EDGE_ZONE_PX,
} from "./useDrawerSwipe";

const WIDTH = 300;

describe("canStartDrawerGesture", () => {
    it("accepts a touch inside the left edge zone when the drawer is closed", () => {
        expect(
            canStartDrawerGesture({ x: EDGE_ZONE_PX - 1, isOpen: false })
        ).toBe(true);
    });

    it("ignores a touch away from the edge when the drawer is closed", () => {
        // Without this the gesture would fight the grid's own scrolling and
        // drag-to-create anywhere on the canvas.
        expect(
            canStartDrawerGesture({ x: EDGE_ZONE_PX + 1, isOpen: false })
        ).toBe(false);
    });

    it("accepts a touch anywhere once the drawer is open", () => {
        expect(canStartDrawerGesture({ x: 900, isOpen: true })).toBe(true);
    });
});

describe("isVerticalGesture", () => {
    it("claims a mostly vertical move so the grid keeps scrolling", () => {
        expect(isVerticalGesture(4, 30)).toBe(true);
    });

    it("leaves a mostly horizontal move to the drawer", () => {
        expect(isVerticalGesture(30, 4)).toBe(false);
    });

    it("treats an upward move the same as a downward one", () => {
        expect(isVerticalGesture(4, -30)).toBe(true);
    });
});

describe("drawerDragProgress", () => {
    it("maps a pull from the edge onto the drawer width", () => {
        expect(
            drawerDragProgress({
                startX: 10,
                currentX: 160,
                drawerWidth: WIDTH,
                startedOpen: false,
            })
        ).toBeCloseTo(0.5);
    });

    it("stops at fully open however far past the width the finger goes", () => {
        expect(
            drawerDragProgress({
                startX: 10,
                currentX: 900,
                drawerWidth: WIDTH,
                startedOpen: false,
            })
        ).toBe(1);
    });

    it("never goes below closed when the finger moves backwards", () => {
        expect(
            drawerDragProgress({
                startX: 10,
                currentX: -200,
                drawerWidth: WIDTH,
                startedOpen: false,
            })
        ).toBe(0);
    });

    it("starts from fully open when the drag begins on an open drawer", () => {
        expect(
            drawerDragProgress({
                startX: 200,
                currentX: 200,
                drawerWidth: WIDTH,
                startedOpen: true,
            })
        ).toBe(1);
    });

    it("closes proportionally as an open drawer is pushed left", () => {
        expect(
            drawerDragProgress({
                startX: 200,
                currentX: 50,
                drawerWidth: WIDTH,
                startedOpen: true,
            })
        ).toBeCloseTo(0.5);
    });
});

describe("settleDrawerOpen", () => {
    it("opens when the drawer was pulled past halfway", () => {
        expect(settleDrawerOpen({ progress: 0.6, velocity: 0 })).toBe(true);
    });

    it("falls back closed when the drawer was barely pulled", () => {
        expect(settleDrawerOpen({ progress: 0.2, velocity: 0 })).toBe(false);
    });

    it("opens on a quick flick even though the finger stopped short", () => {
        expect(settleDrawerOpen({ progress: 0.2, velocity: 1.2 })).toBe(true);
    });

    it("closes on a quick flick back even though the drawer is mostly out", () => {
        expect(settleDrawerOpen({ progress: 0.8, velocity: -1.2 })).toBe(false);
    });

    it("ignores a slow drift that never reaches the flick threshold", () => {
        expect(settleDrawerOpen({ progress: 0.8, velocity: -0.1 })).toBe(true);
    });
});
