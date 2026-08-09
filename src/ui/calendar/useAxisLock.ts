import { useEffect } from "react";

/**
 * One direction at a time in the time grid.
 *
 * The grid scrolls both ways: down through the hours, across through the days.
 * A finger is never exactly vertical, so a swipe down also drifted sideways and
 * the grid answered both — days slid a little every time you moved through the
 * hours, and the view never settled where you left it.
 *
 * So the first few pixels decide, and the other axis is held still until the
 * finger lifts. The browser keeps doing the scrolling, with its own momentum
 * and rubber-banding; the locked axis is simply put back where it started, on
 * every scroll event, before anything is painted.
 *
 * Holding the other axis rather than forbidding it is deliberate. `touch-action`
 * is latched when a gesture begins, before there is any direction to read, and
 * flipping `overflow` mid-scroll interrupts the gesture the browser is already
 * running.
 */

/** Travel before the gesture has said which way it is going. */
export const AXIS_LOCK_PX = 8;

/** Quiet time after the last scroll event before the axis is unlocked. */
const SETTLE_MS = 150;

export type ScrollAxis = "x" | "y";

/**
 * Which way this movement is going, or null while it is still ambiguous.
 *
 * A tie goes to vertical: the grid is a column of hours, and scrolling through
 * time is what it is mostly asked to do.
 */
export function lockedAxis(dx: number, dy: number): ScrollAxis | null {
    if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return null;
    return Math.abs(dx) > Math.abs(dy) ? "x" : "y";
}

export function useAxisLock(
    ref: React.RefObject<HTMLElement>,
    enabled = true
): void {
    useEffect(() => {
        const element = ref.current;
        if (!enabled || !element) return;

        let axis: ScrollAxis | null = null;
        let startX = 0;
        let startY = 0;
        let heldLeft = 0;
        let heldTop = 0;
        let settleTimer = 0;

        // The lock outlives the finger on purpose: a flick keeps scrolling after
        // touchend, and releasing the axis there would let the momentum wander
        // off in the other direction. It is released once the scrolling stops,
        // so that later programmatic moves — jumping to today, shifting the day
        // window — are not mistaken for drift and undone.
        const release = () => {
            window.clearTimeout(settleTimer);
            settleTimer = 0;
            axis = null;
        };

        const releaseWhenSettled = () => {
            window.clearTimeout(settleTimer);
            settleTimer = window.setTimeout(release, SETTLE_MS);
        };

        const onTouchStart = (event: TouchEvent) => {
            // A second finger is a pinch, not a scroll; leave it alone.
            release();
            if (event.touches.length !== 1) return;
            startX = event.touches[0].clientX;
            startY = event.touches[0].clientY;
            heldLeft = element.scrollLeft;
            heldTop = element.scrollTop;
        };

        const onTouchMove = (event: TouchEvent) => {
            if (axis || event.touches.length !== 1) return;
            axis = lockedAxis(
                event.touches[0].clientX - startX,
                event.touches[0].clientY - startY
            );
        };

        // Runs before paint, so the off-axis drift is never seen.
        const onScroll = () => {
            if (!axis) return;
            if (axis === "y" && element.scrollLeft !== heldLeft) {
                element.scrollLeft = heldLeft;
            } else if (axis === "x" && element.scrollTop !== heldTop) {
                element.scrollTop = heldTop;
            }
            releaseWhenSettled();
        };

        element.addEventListener("touchstart", onTouchStart, { passive: true });
        element.addEventListener("touchmove", onTouchMove, { passive: true });
        element.addEventListener("scroll", onScroll, { passive: true });
        element.addEventListener("touchcancel", release, { passive: true });

        return () => {
            window.clearTimeout(settleTimer);
            element.removeEventListener("touchstart", onTouchStart);
            element.removeEventListener("touchmove", onTouchMove);
            element.removeEventListener("scroll", onScroll);
            element.removeEventListener("touchcancel", release);
        };
    }, [ref, enabled]);
}
