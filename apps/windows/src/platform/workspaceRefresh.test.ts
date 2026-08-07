import { shouldReloadOnWake, WAKE_RELOAD_GAP_MS } from "./workspaceRefresh";

describe("shouldReloadOnWake", () => {
    // Coming back to the app is the moment a file synced from the other device
    // has to appear. Before this, an Android user had to quit and relaunch.
    it("reloads when the app has just come back into view", () => {
        expect(
            shouldReloadOnWake({ lastReloadAt: 0, now: WAKE_RELOAD_GAP_MS + 1 })
        ).toBe(true);
    });

    // Returning to the foreground fires both visibilitychange and focus in some
    // WebViews, and re-reading the whole vault twice for one wake is wasteful.
    it("ignores a second wake arriving in the same instant", () => {
        expect(shouldReloadOnWake({ lastReloadAt: 1000, now: 1010 })).toBe(
            false
        );
    });

    it("reloads again once the quiet period has passed", () => {
        expect(
            shouldReloadOnWake({
                lastReloadAt: 1000,
                now: 1000 + WAKE_RELOAD_GAP_MS + 1,
            })
        ).toBe(true);
    });

    it("reloads on the very first wake, before anything has been read", () => {
        expect(shouldReloadOnWake({ lastReloadAt: null, now: 5 })).toBe(true);
    });

    // A clock that jumps backwards — a timezone change, an NTP correction —
    // must not lock reloading out until it catches up.
    it("reloads when the clock has moved backwards", () => {
        expect(shouldReloadOnWake({ lastReloadAt: 9000, now: 100 })).toBe(true);
    });
});
