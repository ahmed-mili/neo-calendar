import {
    AXIS_LOCK_PX,
    FRICTION_PER_FRAME,
    MIN_GLIDE_VELOCITY,
    GestureNode,
    claimsGesture,
    clampScroll,
    decayedVelocity,
    easeOutCubic,
    cappedPageStep,
    pagesTurnedBy,
    VELOCITY_WINDOW_MS,
    lockedAxis,
    pinchedHourHeight,
    scrollForAnchor,
    stillGliding,
    velocityFrom,
} from "./useAxisLock";
import { MAX_HOUR_HEIGHT, MIN_HOUR_HEIGHT } from "./calendarConstants";

describe("lockedAxis", () => {
    it("waits while the gesture is still short in both directions", () => {
        expect(lockedAxis(0, 0)).toBeNull();
        expect(lockedAxis(AXIS_LOCK_PX - 1, AXIS_LOCK_PX - 1)).toBeNull();
        expect(lockedAxis(-(AXIS_LOCK_PX - 1), AXIS_LOCK_PX - 1)).toBeNull();
    });

    it("commits as soon as either direction clears the threshold", () => {
        expect(lockedAxis(0, AXIS_LOCK_PX)).toBe("y");
        expect(lockedAxis(AXIS_LOCK_PX, 0)).toBe("x");
    });

    it("follows the longer direction, whichever way it points", () => {
        expect(lockedAxis(4, 30)).toBe("y");
        expect(lockedAxis(-4, -30)).toBe("y");
        expect(lockedAxis(30, 4)).toBe("x");
        expect(lockedAxis(-30, 4)).toBe("x");
    });

    it("gives a tie to the hours, not the days", () => {
        expect(lockedAxis(20, 20)).toBe("y");
        expect(lockedAxis(-20, 20)).toBe("y");
    });

    it("reads a mostly-vertical swipe as vertical, which is the whole point", () => {
        // A finger sliding down the hours drifts sideways a little. Before the
        // lock, the grid answered that drift and the days crept along with it.
        expect(lockedAxis(9, 120)).toBe("y");
    });
});

describe("clampScroll", () => {
    it("keeps the offset inside the content", () => {
        expect(clampScroll(-40, 1000)).toBe(0);
        expect(clampScroll(1400, 1000)).toBe(1000);
        expect(clampScroll(320, 1000)).toBe(320);
    });

    it("pins to zero when there is nothing to scroll", () => {
        // A grid narrower than its viewport has a negative scrollWidth margin.
        expect(clampScroll(50, 0)).toBe(0);
        expect(clampScroll(50, -12)).toBe(0);
    });
});

describe("decayedVelocity", () => {
    it("loses one frame's friction over one frame", () => {
        expect(decayedVelocity(1, 16.7)).toBeCloseTo(FRICTION_PER_FRAME, 5);
    });

    it("charges a dropped frame the decay it slept through", () => {
        const twoFrames = decayedVelocity(1, 33.4);
        const oneThenAnother = decayedVelocity(decayedVelocity(1, 16.7), 16.7);
        expect(twoFrames).toBeCloseTo(oneThenAnother, 5);
    });

    it("slows without ever reversing", () => {
        expect(decayedVelocity(-2, 100)).toBeLessThan(0);
        expect(decayedVelocity(-2, 100)).toBeGreaterThan(-2);
    });
});

describe("stillGliding", () => {
    it("stops a glide that has run down, either way", () => {
        expect(stillGliding(MIN_GLIDE_VELOCITY / 2)).toBe(false);
        expect(stillGliding(-MIN_GLIDE_VELOCITY / 2)).toBe(false);
        expect(stillGliding(MIN_GLIDE_VELOCITY)).toBe(true);
        expect(stillGliding(-3)).toBe(true);
    });
});

describe("claimsGesture", () => {
    /** grip → chip → day column → scroller */
    const build = () => {
        const scroller: GestureNode = { parentElement: null };
        const day: GestureNode = { parentElement: scroller };
        const chip: GestureNode = { parentElement: day };
        const grip: GestureNode = { parentElement: chip };
        return { scroller, day, chip, grip };
    };

    const styled =
        (claimed: GestureNode[]) =>
        (node: GestureNode): string =>
            claimed.includes(node) ? "none" : "auto";

    it("leaves the grid to scroll under a plain touch", () => {
        const { scroller, day } = build();
        expect(claimsGesture(day, scroller, styled([]))).toBe(false);
    });

    it("yields to a grip that asked for the gesture", () => {
        const { scroller, grip } = build();
        expect(claimsGesture(grip, scroller, styled([grip]))).toBe(true);
    });

    it("yields when the claim is on an ancestor of what was touched", () => {
        const { scroller, chip, grip } = build();
        expect(claimsGesture(grip, scroller, styled([chip]))).toBe(true);
    });

    it("does not read the scroller's own claim as someone else's", () => {
        // The hook sets touch-action: none on the scroller itself — that is the
        // browser being kept out, not a child asking for the gesture.
        const { scroller, day } = build();
        expect(claimsGesture(day, scroller, styled([scroller]))).toBe(false);
    });

    it("survives a touch with no element behind it", () => {
        const { scroller } = build();
        expect(claimsGesture(null, scroller, styled([]))).toBe(false);
    });

    it("stops at a node that is not in the grid at all", () => {
        const { scroller } = build();
        const stray: GestureNode = { parentElement: null };
        expect(claimsGesture(stray, scroller, styled([]))).toBe(false);
    });
});

describe("velocityFrom", () => {
    it("has no speed to report from a single touch", () => {
        expect(velocityFrom([])).toBe(0);
        expect(velocityFrom([{ position: 100, at: 0 }])).toBe(0);
    });

    it("measures across the window, not the newest pair", () => {
        // Steady 1px/ms with one jittery sample at the end: reading only the
        // last pair would call this a fling four times too fast.
        const samples = [
            { position: 0, at: 0 },
            { position: 20, at: 20 },
            { position: 40, at: 40 },
            { position: 64, at: 46 },
        ];
        expect(velocityFrom(samples)).toBeCloseTo(64 / 46, 5);
    });

    it("ignores samples older than the window", () => {
        const samples = [
            { position: 0, at: 0 },
            { position: 500, at: VELOCITY_WINDOW_MS + 40 },
            { position: 540, at: VELOCITY_WINDOW_MS + 80 },
        ];
        expect(velocityFrom(samples)).toBeCloseTo(1, 5);
    });

    it("gives no speed to a finger that came to rest", () => {
        // Everything but the last position is outside the window, so there is
        // no interval left to divide by.
        const samples = [
            { position: 0, at: 0 },
            { position: 300, at: 300 },
            { position: 300, at: 300 + VELOCITY_WINDOW_MS + 1 },
        ];
        expect(velocityFrom(samples)).toBe(0);
    });

    it("keeps the direction of travel", () => {
        expect(
            velocityFrom([
                { position: 200, at: 0 },
                { position: 100, at: 50 },
            ])
        ).toBeCloseTo(-2, 5);
    });
});

describe("pinchedHourHeight", () => {
    it("grows and shrinks the hour with the fingers", () => {
        expect(pinchedHourHeight(60, 100, 200)).toBe(120);
        expect(pinchedHourHeight(120, 200, 100)).toBe(60);
    });

    it("stops at the ends of the range instead of running past them", () => {
        expect(pinchedHourHeight(60, 100, 10000)).toBe(MAX_HOUR_HEIGHT);
        expect(pinchedHourHeight(60, 10000, 100)).toBe(MIN_HOUR_HEIGHT);
    });

    it("holds still rather than divide by two fingers on top of each other", () => {
        // Two touch points a few pixels apart are mostly noise, and the ratio
        // between two small numbers swings wildly.
        expect(pinchedHourHeight(60, 4, 200)).toBe(60);
        expect(pinchedHourHeight(60, 200, 4)).toBe(60);
        expect(pinchedHourHeight(60, 0, 0)).toBe(60);
    });

    it("reports the bound it settled on, even when asked to hold", () => {
        // A pinch that begins outside the range must not preserve the outside
        // value just because the fingers were too close to read.
        expect(pinchedHourHeight(9000, 4, 4)).toBe(MAX_HOUR_HEIGHT);
    });
});

describe("scrollForAnchor", () => {
    /** 09:00 sits 200px below the top of the viewport. */
    const anchor = 9;
    const offset = 200;

    it("keeps the anchored hour where the fingers are", () => {
        expect(scrollForAnchor(anchor, 60, offset, 5000)).toBe(9 * 60 - 200);
        expect(scrollForAnchor(anchor, 120, offset, 5000)).toBe(9 * 120 - 200);
    });

    it("never scrolls past the ends of the day", () => {
        // Zooming right out puts the whole day on screen: there is nowhere to
        // scroll to, however far down the fingers are.
        expect(scrollForAnchor(1, 32, 600, 0)).toBe(0);
        expect(scrollForAnchor(23, 320, 0, 4000)).toBe(4000);
    });
});

describe("cappedPageStep", () => {
    /** A day, on a phone. */
    const page = 380;

    it("follows the finger while there is still day to cover", () => {
        expect(cappedPageStep(0, 40, page)).toBe(40);
        expect(cappedPageStep(200, 100, page)).toBe(100);
    });

    // Everything past a day would have to be given back, and giving it back is
    // the reversal this exists to remove.
    it("stops at the day it is turning to", () => {
        expect(cappedPageStep(300, 200, page)).toBe(80);
        expect(cappedPageStep(page, 50, page)).toBe(0);
        expect(cappedPageStep(-300, -200, page)).toBe(-80);
    });

    it("lets the finger come back the way it went", () => {
        expect(cappedPageStep(page, -120, page)).toBe(-120);
    });

    it("leaves the movement alone when there is no day to measure", () => {
        expect(cappedPageStep(0, 40, 0)).toBe(40);
    });
});

describe("pagesTurnedBy", () => {
    const page = 380;
    const still = 0;

    it("turns the page on a deliberate drag", () => {
        expect(pagesTurnedBy(page * 0.3, still, page)).toBe(1);
        expect(pagesTurnedBy(-page * 0.3, still, page)).toBe(-1);
    });

    it("turns the page on a flick that covered almost nothing", () => {
        expect(pagesTurnedBy(6, 0.9, page)).toBe(1);
        expect(pagesTurnedBy(-6, -0.9, page)).toBe(-1);
    });

    it("stays where it was when the hand hesitated", () => {
        expect(pagesTurnedBy(page * 0.1, 0.05, page)).toBe(0);
        expect(pagesTurnedBy(0, 0, page)).toBe(0);
    });

    // The last thing the hand did is the thing it meant: a drag forward that
    // was flicked back at the end goes back.
    it("follows the flick rather than the ground covered", () => {
        expect(pagesTurnedBy(page * 0.4, -0.8, page)).toBe(-1);
    });

    it("never turns more than one day, however hard the throw", () => {
        expect(pagesTurnedBy(page, 12, page)).toBe(1);
        expect(pagesTurnedBy(-page, -12, page)).toBe(-1);
    });

    it("has no page to turn without a day to measure", () => {
        expect(pagesTurnedBy(500, 3, 0)).toBe(0);
    });
});

describe("easeOutCubic", () => {
    it("runs from where it started to where it is going", () => {
        expect(easeOutCubic(0)).toBe(0);
        expect(easeOutCubic(1)).toBe(1);
    });

    it("is most of the way there at the halfway point", () => {
        // Fast first, easing in at the end — the shape of something settling.
        expect(easeOutCubic(0.5)).toBeCloseTo(0.875, 5);
        expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
    });
});
