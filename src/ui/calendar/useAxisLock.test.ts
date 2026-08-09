import { AXIS_LOCK_PX, lockedAxis } from "./useAxisLock";

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
