import { readFileSync } from "fs";
import { resolve } from "path";
import {
    canStartDrawerGesture,
    drawerDragProgress,
    drawerVisualProgress,
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

    it("continues from an interrupted partial settle without jumping", () => {
        expect(
            drawerDragProgress({
                startX: 100,
                currentX: 130,
                drawerWidth: WIDTH,
                startProgress: 0.4,
            })
        ).toBeCloseTo(0.5);
    });
});

describe("drawerVisualProgress", () => {
    it("maps the off-screen, partial and open positions", () => {
        expect(drawerVisualProgress(-WIDTH, WIDTH)).toBe(0);
        expect(drawerVisualProgress(-WIDTH / 2, WIDTH)).toBe(0.5);
        expect(drawerVisualProgress(0, WIDTH)).toBe(1);
    });

    it("clamps overshoot and rejects an invalid width", () => {
        expect(drawerVisualProgress(40, WIDTH)).toBe(1);
        expect(drawerVisualProgress(-WIDTH * 2, WIDTH)).toBe(0);
        expect(drawerVisualProgress(-10, 0)).toBe(0);
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

describe("Android drawer animation ownership", () => {
    it("uses one transition and never re-attaches an entry keyframe", () => {
        const css = readFileSync(
            resolve(__dirname, "../../../apps/android/src/mobile.css"),
            "utf8"
        );
        const gestureCss = css.slice(
            css.indexOf("NEO ANDROID DRAWER GESTURE V10 START"),
            css.indexOf("NEO ANDROID DRAWER GESTURE V10 END")
        );
        expect(gestureCss).not.toContain("animation: nc-drawer-slide-in");
        expect(gestureCss).toContain("visibility 0s linear 300ms");

        const openRule = gestureCss.match(
            /body\.nc-platform-android \.nc-sidebar:not\(\.nc-sidebar-collapsed\) \{([\s\S]*?)\}/
        )?.[1];
        expect(openRule).toContain(
            "background: var(--background-secondary, #181825) !important"
        );
        expect(openRule).toContain("backdrop-filter: none !important");
    });
});
