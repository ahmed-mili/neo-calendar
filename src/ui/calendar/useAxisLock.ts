import { useEffect } from "react";

/**
 * One direction at a time in the time grid.
 *
 * The grid scrolls both ways: down through the hours, across through the days.
 * A finger is never exactly vertical, so a swipe down also drifted sideways and
 * the grid answered both — days slid a little every time you moved through the
 * hours, and a circular finger sent the view wandering in two directions at
 * once.
 *
 * Asking the browser to scroll and then putting the other axis back does not
 * work, and it is worth saying why: a touch scroll runs on the compositor
 * thread. By the time a `scroll` event reaches us the frame is already drawn,
 * and the gesture still in progress overwrites whatever we assign. `touch-action`
 * can constrain an axis, but it is latched when the gesture begins — before
 * there is any direction to read — so it cannot be chosen per gesture either.
 *
 * So on the phone the grid does its own scrolling. `touch-action: none` keeps
 * the browser out of it, the first few pixels of the gesture decide the axis,
 * and only that axis moves — during the drag and during the glide that follows
 * it. Nothing can push the other one, because nothing else is driving.
 *
 * The offsets are read fresh from the element every frame rather than tracked
 * here, so the day-shifting of the infinite scroll and the midnight clamp stay
 * in charge of where the grid actually sits.
 */

/** Travel before the gesture has said which way it is going. */
export const AXIS_LOCK_PX = 8;

/** What is left of the glide's speed after one frame. */
export const FRICTION_PER_FRAME = 0.94;

/** Slower than this (px/ms) and the glide is over — about 40px per second. */
export const MIN_GLIDE_VELOCITY = 0.04;

/** A finger that paused this long before lifting was placing, not throwing. */
export const FLING_TIMEOUT_MS = 90;

const FRAME_MS = 16.7;

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

/** Keeps a scroll offset inside the content, with no rubber band past the end. */
export function clampScroll(value: number, max: number): number {
    if (max <= 0) return 0;
    return Math.min(Math.max(value, 0), max);
}

/**
 * What a glide's speed has decayed to after `elapsedMs`.
 *
 * Framed as time rather than frames so a dropped frame slows the glide by the
 * same amount it would have lost had it been drawn.
 */
export function decayedVelocity(
    velocity: number,
    elapsedMs: number,
    friction = FRICTION_PER_FRAME
): number {
    return velocity * Math.pow(friction, elapsedMs / FRAME_MS);
}

export function stillGliding(velocity: number): boolean {
    return Math.abs(velocity) >= MIN_GLIDE_VELOCITY;
}

/**
 * Whether the gesture belongs to something the finger landed on rather than to
 * the grid underneath it. A resize grip declares `touch-action: none` to claim
 * the gesture for itself; scrolling the grid under it would fight the very drag
 * it asked for.
 */
export interface GestureNode {
    readonly parentElement: GestureNode | null;
}

export function claimsGesture<T extends GestureNode>(
    target: T | null,
    scroller: GestureNode,
    touchActionOf: (node: GestureNode) => string
): boolean {
    let node: GestureNode | null = target;
    while (node && node !== scroller) {
        if (touchActionOf(node) === "none") return true;
        node = node.parentElement;
    }
    return false;
}

export function useAxisLock(
    ref: React.RefObject<HTMLElement>,
    enabled = true
): void {
    useEffect(() => {
        const element = ref.current;
        if (!enabled || !element) return;

        // Set here rather than in the stylesheet so the two can never disagree:
        // the browser only stops scrolling this element while the code that
        // scrolls it instead is installed.
        const inheritedTouchAction = element.style.touchAction;
        element.style.touchAction = "none";

        let axis: ScrollAxis | null = null;
        let tracking = false;
        let startX = 0;
        let startY = 0;
        let lastX = 0;
        let lastY = 0;
        let lastMoveAt = 0;
        let velocity = 0;
        let frame = 0;

        const stopGlide = () => {
            if (frame) cancelAnimationFrame(frame);
            frame = 0;
        };

        const maxScroll = (on: ScrollAxis) =>
            on === "y"
                ? element.scrollHeight - element.clientHeight
                : element.scrollWidth - element.clientWidth;

        /** Moves one axis; false once it has nothing left to give. */
        const scrollAxisBy = (on: ScrollAxis, distance: number): boolean => {
            const from = on === "y" ? element.scrollTop : element.scrollLeft;
            const to = clampScroll(from + distance, maxScroll(on));
            if (on === "y") element.scrollTop = to;
            else element.scrollLeft = to;
            return to !== from;
        };

        const glide = (on: ScrollAxis) => {
            let previous = performance.now();
            const step = (now: number) => {
                // A long gap — a backgrounded tab, a stalled frame — would
                // otherwise be paid off in one jump.
                const elapsed = Math.min(now - previous, 50);
                previous = now;
                const moved = scrollAxisBy(on, -velocity * elapsed);
                velocity = decayedVelocity(velocity, elapsed);
                frame =
                    moved && stillGliding(velocity)
                        ? requestAnimationFrame(step)
                        : 0;
            };
            frame = requestAnimationFrame(step);
        };

        const onTouchStart = (event: TouchEvent) => {
            stopGlide();
            axis = null;
            velocity = 0;
            tracking =
                event.touches.length === 1 &&
                !claimsGesture(
                    event.target instanceof Element ? event.target : null,
                    element,
                    (node) =>
                        window.getComputedStyle(node as Element).touchAction
                );
            if (!tracking) return;

            const touch = event.touches[0];
            startX = lastX = touch.clientX;
            startY = lastY = touch.clientY;
            lastMoveAt = event.timeStamp;
        };

        const onTouchMove = (event: TouchEvent) => {
            if (!tracking) return;
            // A second finger is a pinch, not a scroll; hand it back untouched.
            if (event.touches.length !== 1) {
                tracking = false;
                axis = null;
                velocity = 0;
                return;
            }

            const touch = event.touches[0];

            if (!axis) {
                axis = lockedAxis(
                    touch.clientX - startX,
                    touch.clientY - startY
                );
                if (!axis) return;
                // Measure from where the gesture was recognised, so the pixels
                // spent deciding are not also scrolled through.
                lastX = touch.clientX;
                lastY = touch.clientY;
                lastMoveAt = event.timeStamp;
                return;
            }

            const travel =
                axis === "y" ? touch.clientY - lastY : touch.clientX - lastX;
            const elapsed = event.timeStamp - lastMoveAt;

            scrollAxisBy(axis, -travel);

            if (elapsed > 0) {
                const instant = travel / elapsed;
                // Weighted towards the newest sample: a fling should follow how
                // the finger was moving as it left, not how it started.
                velocity = velocity === 0 ? instant : velocity * 0.2 + instant * 0.8;
            }

            lastX = touch.clientX;
            lastY = touch.clientY;
            lastMoveAt = event.timeStamp;
        };

        const onTouchEnd = (event: TouchEvent) => {
            const releasing = axis;
            tracking = false;
            axis = null;
            if (!releasing) return;

            // A finger that came to rest before lifting was placing the grid,
            // not throwing it — the last measured speed is stale.
            if (event.timeStamp - lastMoveAt > FLING_TIMEOUT_MS) return;
            if (stillGliding(velocity)) glide(releasing);
        };

        const onTouchCancel = () => {
            tracking = false;
            axis = null;
            velocity = 0;
        };

        element.addEventListener("touchstart", onTouchStart, { passive: true });
        element.addEventListener("touchmove", onTouchMove, { passive: true });
        element.addEventListener("touchend", onTouchEnd, { passive: true });
        element.addEventListener("touchcancel", onTouchCancel, {
            passive: true,
        });

        return () => {
            stopGlide();
            element.style.touchAction = inheritedTouchAction;
            element.removeEventListener("touchstart", onTouchStart);
            element.removeEventListener("touchmove", onTouchMove);
            element.removeEventListener("touchend", onTouchEnd);
            element.removeEventListener("touchcancel", onTouchCancel);
        };
    }, [ref, enabled]);
}
