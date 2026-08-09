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
 * and the gesture still in progress overwrites whatever we assign.
 * `touch-action` can constrain an axis, but it is latched when the gesture
 * begins — before there is any direction to read — so it cannot be chosen per
 * gesture either.
 *
 * So on the phone the grid does its own scrolling. `touch-action: none` keeps
 * the browser out of it, the first few pixels of the gesture decide the axis,
 * and only that axis moves — during the drag and during the glide that follows
 * it. Nothing can push the other one, because nothing else is driving.
 *
 * Everything that moves the grid moves it once per frame, from inside a frame:
 * touches arrive faster than the screen refreshes, and writing a scroll offset
 * per touch spends the extra writes on nothing while the reads between them
 * force layout. The extents are measured once per gesture for the same reason.
 *
 * The offsets are read fresh from the element every frame rather than tracked
 * here, so the day-shifting of the infinite scroll and the midnight clamp stay
 * in charge of where the grid actually sits.
 */

/** Travel before the gesture has said which way it is going. */
export const AXIS_LOCK_PX = 8;

/** What is left of the glide's speed after one frame. */
export const FRICTION_PER_FRAME = 0.96;

/** Slower than this (px/ms) and the glide is over — about 30px per second. */
export const MIN_GLIDE_VELOCITY = 0.03;

/** A finger that paused this long before lifting was placing, not throwing. */
export const FLING_TIMEOUT_MS = 90;

/** How far back a fling's speed is measured. */
export const VELOCITY_WINDOW_MS = 80;

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

export interface TravelSample {
    /** Where the finger was along the locked axis. */
    position: number;
    at: number;
}

/**
 * How fast the finger was moving when it left, in px/ms.
 *
 * Measured across the last `windowMs` rather than from the newest pair: touch
 * points arrive irregularly, and a single short interval turns one jittery
 * sample into a fling. A finger that came to rest before lifting has nothing
 * inside the window but its final position, and gets no speed at all.
 */
export function velocityFrom(
    samples: readonly TravelSample[],
    windowMs = VELOCITY_WINDOW_MS
): number {
    if (samples.length < 2) return 0;

    const last = samples[samples.length - 1];
    let oldest = last;
    for (let index = samples.length - 2; index >= 0; index--) {
        if (last.at - samples[index].at > windowMs) break;
        oldest = samples[index];
    }

    const elapsed = last.at - oldest.at;
    return elapsed > 0 ? (last.position - oldest.position) / elapsed : 0;
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

export interface GestureNode {
    readonly parentElement: GestureNode | null;
}

/**
 * Whether the gesture belongs to something the finger landed on rather than to
 * the grid underneath it. A resize grip declares `touch-action: none` to claim
 * the gesture for itself; scrolling the grid under it would fight the very drag
 * it asked for.
 */
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
        /** Where the finger is now, along the locked axis. */
        let pointer = 0;
        /** Where the grid has been scrolled to answer it. */
        let answered = 0;
        let extent = 0;
        let samples: TravelSample[] = [];
        let frame = 0;

        const stopFrame = () => {
            if (frame) cancelAnimationFrame(frame);
            frame = 0;
        };

        const measureExtent = (on: ScrollAxis) =>
            on === "y"
                ? element.scrollHeight - element.clientHeight
                : element.scrollWidth - element.clientWidth;

        /** Moves one axis; false once it has nothing left to give. */
        const scrollAxisBy = (on: ScrollAxis, distance: number): boolean => {
            const from = on === "y" ? element.scrollTop : element.scrollLeft;
            const to = clampScroll(from + distance, extent);
            if (on === "y") element.scrollTop = to;
            else element.scrollLeft = to;
            return to !== from;
        };

        const drawDrag = () => {
            frame = 0;
            if (!axis) return;
            const travel = pointer - answered;
            answered = pointer;
            scrollAxisBy(axis, -travel);
        };

        const glide = (on: ScrollAxis, initial: number) => {
            let velocity = initial;
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
            stopFrame();
            axis = null;
            samples = [];
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
            startX = touch.clientX;
            startY = touch.clientY;
        };

        const onTouchMove = (event: TouchEvent) => {
            if (!tracking) return;
            // A second finger is a pinch, not a scroll; hand it back untouched.
            if (event.touches.length !== 1) {
                stopFrame();
                tracking = false;
                axis = null;
                return;
            }

            const touch = event.touches[0];

            if (!axis) {
                axis = lockedAxis(
                    touch.clientX - startX,
                    touch.clientY - startY
                );
                if (!axis) return;
                extent = measureExtent(axis);
                // Start from where the gesture was recognised, so the pixels
                // spent deciding are not also scrolled through.
                pointer = answered =
                    axis === "y" ? touch.clientY : touch.clientX;
                samples = [{ position: pointer, at: event.timeStamp }];
                return;
            }

            pointer = axis === "y" ? touch.clientY : touch.clientX;
            samples.push({ position: pointer, at: event.timeStamp });
            if (samples.length > 8) samples.shift();

            if (!frame) frame = requestAnimationFrame(drawDrag);
        };

        const onTouchEnd = (event: TouchEvent) => {
            const releasing = axis;
            tracking = false;
            axis = null;
            if (!releasing) return;

            // Whatever the finger asked for last is owed before it is let go.
            stopFrame();
            const travel = pointer - answered;
            answered = pointer;
            scrollAxisBy(releasing, -travel);

            const last = samples[samples.length - 1];
            // A finger that came to rest before lifting was placing the grid,
            // not throwing it.
            if (!last || event.timeStamp - last.at > FLING_TIMEOUT_MS) return;

            const velocity = velocityFrom(samples);
            if (stillGliding(velocity)) glide(releasing, velocity);
        };

        const onTouchCancel = () => {
            stopFrame();
            tracking = false;
            axis = null;
        };

        element.addEventListener("touchstart", onTouchStart, { passive: true });
        element.addEventListener("touchmove", onTouchMove, { passive: true });
        element.addEventListener("touchend", onTouchEnd, { passive: true });
        element.addEventListener("touchcancel", onTouchCancel, {
            passive: true,
        });

        return () => {
            stopFrame();
            element.style.touchAction = inheritedTouchAction;
            element.removeEventListener("touchstart", onTouchStart);
            element.removeEventListener("touchmove", onTouchMove);
            element.removeEventListener("touchend", onTouchEnd);
            element.removeEventListener("touchcancel", onTouchCancel);
        };
    }, [ref, enabled]);
}
