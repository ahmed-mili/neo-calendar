import {
    AXIS_LOCK_PX,
    FRICTION_PER_FRAME,
    MIN_GLIDE_VELOCITY,
    GestureNode,
    claimsGesture,
    clampScroll,
    decayedVelocity,
    lockedAxis,
    stillGliding,
} from "./useAxisLock";

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
