import { useEffect, useRef } from "react";
import {
    HOUR_HEIGHT,
    clampHourHeight,
    currentHourHeight,
    setHourHeight,
} from "./CalendarUtils";

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
 *
 * A second finger is a pinch. Zooming costs one number per frame — the height
 * of an hour, written on the grid as `--nc-hour-height` — because every
 * vertical measure in the grid is laid out in terms of it. Nothing re-renders
 * while the fingers move; the browser re-measures what it already knows how to
 * re-measure, which is the whole reason a pinch can keep up with a hand. What
 * the frame does spend is one scroll correction, so the hour under the fingers
 * stays under the fingers instead of sliding away as everything grows.
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

/** Two fingers closer together than this are treated as one point. */
export const MIN_PINCH_SPAN_PX = 24;

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

/** How long the grid takes to slide back onto whole days. */
export const SETTLE_MS = 220;

/** Fast at first, easing in at the end, like something coming to rest. */
export function easeOutCubic(progress: number): number {
    const left = 1 - progress;
    return 1 - left * left * left;
}

/**
 * Where a grid left between two days should come to rest.
 *
 * Half a column of Saturday next to half a column of Monday is nobody's week:
 * the days are the unit, so that is what the grid stops on.
 */
export function snappedScroll(
    scrollLeft: number,
    columnWidth: number,
    maxScroll: number
): number {
    if (!(columnWidth > 0)) return clampScroll(scrollLeft, maxScroll);
    return clampScroll(
        Math.round(scrollLeft / columnWidth) * columnWidth,
        maxScroll
    );
}

export interface Span {
    /** Distance between the two fingers. */
    length: number;
    /** Halfway between them, in viewport coordinates. */
    midY: number;
}

export function spanOf(a: Touch, b: Touch): Span {
    return {
        length: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        midY: (a.clientY + b.clientY) / 2,
    };
}

/**
 * How tall an hour becomes when two fingers that started `from` apart are now
 * `to` apart.
 *
 * Fingers too close together are ignored rather than divided by: two touch
 * points a few pixels apart are mostly noise, and the ratio between two small
 * numbers swings wildly.
 */
export function pinchedHourHeight(
    startHourHeight: number,
    from: number,
    to: number
): number {
    if (from < MIN_PINCH_SPAN_PX || to < MIN_PINCH_SPAN_PX) {
        return clampHourHeight(startHourHeight);
    }
    return clampHourHeight((startHourHeight * to) / from);
}

/**
 * Where to scroll so the moment under the fingers stays under the fingers.
 *
 * Without this the grid zooms around its top edge and the hour being looked at
 * slides away, which is what makes a pinch feel like it is fighting back.
 *
 * @param anchorHours the hour of the day that was under the fingers when the
 *                    pinch began
 * @param offsetY     how far the fingers sit below the top of the viewport
 */
export function scrollForAnchor(
    anchorHours: number,
    hourHeight: number,
    offsetY: number,
    maxScroll: number
): number {
    return clampScroll(anchorHours * hourHeight - offsetY, maxScroll);
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

export interface AxisLockOptions {
    /** How many day columns fill the viewport. 0 leaves the grid unsnapped. */
    daysPerView?: number;
    /** Let the grid rest between two days instead of on whole ones. */
    freeScroll?: boolean;
    /** Called when a pinch has changed the hour height, inside the frame that
        changed it, for anything measured in pixels that a render would
        otherwise have refreshed. */
    onScaleChange?: () => void;
}

export function useAxisLock(
    ref: React.RefObject<HTMLElement>,
    hostRef: React.RefObject<HTMLElement>,
    enabled = true,
    options: AxisLockOptions = {}
): void {
    // Read through a ref so a changed setting never has to tear down and
    // rebind the listeners mid-gesture.
    const optionsRef = useRef(options);
    optionsRef.current = options;

    useEffect(() => {
        const element = ref.current;
        const host = hostRef.current;
        if (!enabled || !element || !host) return;

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

        /** Set for as long as two fingers are on the grid. */
        let pinch: {
            startSpan: number;
            startHourHeight: number;
            anchorHours: number;
            top: number;
            midY: number;
        } | null = null;

        const stopFrame = () => {
            if (frame) cancelAnimationFrame(frame);
            frame = 0;
            delete host.dataset.ncGliding;
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

        const beginPinch = (touches: TouchList) => {
            stopFrame();
            tracking = false;
            axis = null;

            const span = spanOf(touches[0], touches[1]);
            const top = element.getBoundingClientRect().top;
            const hourHeight = currentHourHeight();

            pinch = {
                startSpan: span.length,
                startHourHeight: hourHeight,
                // The moment the fingers came down on, which is what has to
                // stay put while everything around it grows.
                anchorHours:
                    (element.scrollTop + span.midY - top) / hourHeight,
                top,
                midY: span.midY,
            };
        };

        /** One number written, one scroll corrected, once per frame. */
        const drawPinch = () => {
            frame = 0;
            if (!pinch) return;

            const hourHeight = currentHourHeight();
            host.style.setProperty("--nc-hour-height", `${hourHeight}px`);

            // Reading the height back settles the layout the line above just
            // invalidated — deliberately, and exactly once, because the scroll
            // correction below has to be measured against the new day.
            element.scrollTop = scrollForAnchor(
                pinch.anchorHours,
                hourHeight,
                pinch.midY - pinch.top,
                element.scrollHeight - element.clientHeight
            );

            optionsRef.current.onScaleChange?.();
        };

        /**
         * Slides the grid back onto whole days once it has come to rest.
         *
         * Only ever horizontal: the hours are continuous, there is nothing to
         * land on there. Runs after everything else has stopped, so it never
         * competes with a finger or a fling.
         */
        const settleOnDays = () => {
            const { daysPerView = 0, freeScroll = false } = optionsRef.current;
            if (freeScroll || daysPerView <= 0) return;

            const columnWidth = element.clientWidth / daysPerView;
            const from = element.scrollLeft;
            const to = snappedScroll(
                from,
                columnWidth,
                element.scrollWidth - element.clientWidth
            );
            // Under half a pixel is already home; animating it would only cost
            // a frame and a flicker.
            if (Math.abs(to - from) < 0.5) return;

            const startedAt = performance.now();
            const step = (now: number) => {
                const progress = Math.min(1, (now - startedAt) / SETTLE_MS);
                element.scrollLeft =
                    from + (to - from) * easeOutCubic(progress);
                frame = progress < 1 ? requestAnimationFrame(step) : 0;
            };
            frame = requestAnimationFrame(step);
        };

        const glide = (on: ScrollAxis, initial: number) => {
            let velocity = initial;
            let previous = performance.now();

            // Published so a press landing on the moving grid can be read as
            // the brake it is, rather than as a tap on whatever hour happened
            // to be sliding past.
            host.dataset.ncGliding = "true";

            const step = (now: number) => {
                // A long gap — a backgrounded tab, a stalled frame — would
                // otherwise be paid off in one jump.
                const elapsed = Math.min(now - previous, 50);
                previous = now;
                const moved = scrollAxisBy(on, -velocity * elapsed);
                velocity = decayedVelocity(velocity, elapsed);
                if (moved && stillGliding(velocity)) {
                    frame = requestAnimationFrame(step);
                    return;
                }
                frame = 0;
                delete host.dataset.ncGliding;
                settleOnDays();
            };

            frame = requestAnimationFrame(step);
        };

        const onTouchStart = (event: TouchEvent) => {
            stopFrame();
            axis = null;
            samples = [];

            if (event.touches.length >= 2) {
                beginPinch(event.touches);
                return;
            }

            pinch = null;
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
            if (event.touches.length >= 2) {
                // A second finger arriving mid-scroll turns the gesture into a
                // pinch from where it stands.
                if (!pinch) beginPinch(event.touches);
                else {
                    const span = spanOf(event.touches[0], event.touches[1]);
                    pinch.midY = span.midY;
                    setHourHeight(
                        pinchedHourHeight(
                            pinch.startHourHeight,
                            pinch.startSpan,
                            span.length
                        )
                    );
                    if (!frame) frame = requestAnimationFrame(drawPinch);
                }
                return;
            }

            if (!tracking) return;

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
            if (pinch) {
                // A finger lifted out of a pinch leaves the other one resting
                // on the grid, not scrolling with it. Nothing moves again until
                // the hand comes off and a fresh gesture starts.
                if (event.touches.length === 0) pinch = null;
                tracking = false;
                axis = null;
                return;
            }

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
            const thrown =
                last && event.timeStamp - last.at <= FLING_TIMEOUT_MS;
            const velocity = thrown ? velocityFrom(samples) : 0;

            if (stillGliding(velocity)) {
                glide(releasing, velocity);
                return;
            }

            // Whichever way the gesture went, the grid has stopped moving and
            // has to be looking at whole days when it does.
            settleOnDays();
        };

        const onTouchCancel = () => {
            stopFrame();
            tracking = false;
            axis = null;
            pinch = null;
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
            // Both together, or the grid would measure itself in hours of one
            // height and lay itself out in hours of another.
            delete host.dataset.ncGliding;
            host.style.removeProperty("--nc-hour-height");
            setHourHeight(HOUR_HEIGHT);
            element.removeEventListener("touchstart", onTouchStart);
            element.removeEventListener("touchmove", onTouchMove);
            element.removeEventListener("touchend", onTouchEnd);
            element.removeEventListener("touchcancel", onTouchCancel);
        };
    }, [ref, hostRef, enabled]);
}
