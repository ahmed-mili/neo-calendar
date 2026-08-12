import { useEffect, useRef } from "react";
import {
    HOUR_HEIGHT,
    clampHourHeight,
    currentHourHeight,
    setHourHeight,
} from "./CalendarUtils";
import { measureColumnWidth, offsetToNearestDay } from "./gridColumns";

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
 * Across the days one swipe is one day, and the grid never goes anywhere it
 * will have to come back from.
 *
 * Free scrolling with a snap at the end was tried, and it is the snap that was
 * wrong in the hand: a throw went where its momentum took it — a day and a
 * half, two and a bit — and the grid then walked BACKWARDS to the nearest day.
 * Every swipe risked ending in a small reversal, which reads as the grid
 * arguing with the hand that moved it. So the drag follows the finger as far as
 * the day it is turning to and no further, the release carries on in the same
 * direction, and nothing is ever given back. Half a Saturday beside half a
 * Monday is still nobody's week; it is simply no longer arrived at first. The
 * setting drops the paging entirely for anyone who wants the days loose.
 *
 * Down the hours nothing has changed: the finger is free, a throw carries its
 * momentum, and there is nothing to land on because an hour is not a page.
 *
 * Nothing here ever teleports. Every movement of this grid is a difference
 * applied inside a frame, never a position assigned — including the corrections
 * that end an animation. Two things make that a rule rather than a preference:
 * the day range is re-based under us whenever the infinite scroll shifts it, so
 * an absolute target is measured from a page that has since moved; and a state
 * reached without a transition reads as a fault even when the state is right.
 * A residual larger than rounding is movement, and movement is animated.
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

/** How much of a day a swipe has to cover before it turns the page. */
export const PAGE_COMMIT_RATIO = 0.2;

/** A flick faster than this (px/ms) turns the page however short it was. */
export const PAGE_FLING_VELOCITY = 0.25;

/**
 * How far the grid is allowed to follow one swipe: one day, and not a pixel
 * more.
 *
 * Everything past that would have to be given back, and giving it back is the
 * thing to avoid — see `pagesTurnedBy`. The finger keeps going; the grid has
 * already arrived where the gesture is taking it.
 */
export function cappedPageStep(
    travelled: number,
    step: number,
    pageWidth: number
): number {
    if (!(pageWidth > 0)) return step;
    const wanted = travelled + step;
    const capped = Math.min(pageWidth, Math.max(-pageWidth, wanted));
    return capped - travelled;
}

/**
 * How many days one swipe turns: one, or none.
 *
 * A carousel came first here, then free scrolling with a snap at the end, and
 * the snap is what was wrong in the hand. A throw went where its momentum took
 * it — a day and a half, two and a bit — and the grid then walked BACKWARDS to
 * the nearest day. Every swipe risked ending in a small reversal, which reads
 * as the grid arguing with the hand that moved it. Notion Calendar never does
 * that, and the reason is that it never goes anywhere it will have to come back
 * from: a swipe is a decision to turn the page, so the page turns, once, and
 * the movement only ever runs in the direction the finger asked for.
 *
 * What decides is the intent, not the distance covered: a short flick counts,
 * and so does a slow, deliberate drag past a fifth of the day. Anything less
 * was hesitation, and the day it started on is where it stays.
 *
 * `travel` and `velocity` are in scroll space — positive is forward through the
 * days — so the caller flips the sign of the finger, which moves the other way.
 */
export function pagesTurnedBy(
    travel: number,
    velocity: number,
    pageWidth: number,
    commitRatio = PAGE_COMMIT_RATIO,
    flingVelocity = PAGE_FLING_VELOCITY
): -1 | 0 | 1 {
    if (!(pageWidth > 0)) return 0;

    const flung = Math.abs(velocity) >= flingVelocity;
    const dragged = Math.abs(travel) >= pageWidth * commitRatio;
    if (!flung && !dragged) return 0;

    // A flick says which way better than the distance does: the last thing the
    // hand did is the thing it meant. Without one, the ground covered decides.
    const direction = flung ? Math.sign(velocity) : Math.sign(travel);
    if (direction === 0) return 0;
    return direction > 0 ? 1 : -1;
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
        /** Measured once per axis per gesture: reading them forces layout. */
        let extents: { x?: number; y?: number } = {};
        let samples: TravelSample[] = [];
        let frame = 0;
        /** How far across the days this gesture has taken the grid so far, and
            how wide the day it is turning is. Both are the gesture's own: the
            page it lands on is decided from what the FINGER did, never from an
            offset read back off the element — the day range is re-based under
            us mid-gesture, and an absolute reading would be a day out. */
        let pageTravel = 0;
        let pageWidth = 0;
        /** How far off a whole day the grid already was when the finger landed
            — nothing, unless the gesture interrupted the last one settling. */
        let pageResidual = 0;

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

        /**
         * How wide one day is, measured the way the infinite scroll measures
         * it — same element, same fallback.
         *
         * Two notions of a day's width in one feature is how they come to
         * disagree: the scroll re-bases scrollLeft by whole days of ITS width,
         * and a snap to whole days of a slightly different width then has
         * somewhere to pull to. That pull is a jump.
         */
        const measureColumn = () =>
            measureColumnWidth(
                element,
                optionsRef.current.daysPerView ?? 0
            );

        const measureExtent = (on: ScrollAxis) =>
            on === "y"
                ? element.scrollHeight - element.clientHeight
                : element.scrollWidth - element.clientWidth;

        const extentFor = (on: ScrollAxis): number =>
            (extents[on] ??= measureExtent(on));

        /** Anything that changes the layout invalidates both. */
        const forgetExtents = () => {
            extents = {};
        };

        /**
         * Moves one axis, and says how far it actually went — zero once it has
         * nothing left to give.
         *
         * The extent is the one belonging to the axis being moved, and not
         * whichever the gesture locked. They are not interchangeable: settling
         * the days runs after a vertical swipe too, and clamping a horizontal
         * offset against the height of a day put the grid somewhere it had
         * never been asked to go.
         */
        const scrollAxisBy = (on: ScrollAxis, distance: number): number => {
            const from = on === "y" ? element.scrollTop : element.scrollLeft;
            const to = clampScroll(from + distance, extentFor(on));
            if (on === "y") element.scrollTop = to;
            else element.scrollLeft = to;
            return to - from;
        };

        /** Are the days turned a page at a time, or scrolled through freely? */
        const paging = () => {
            const { daysPerView = 0, freeScroll = false } = optionsRef.current;
            return !freeScroll && daysPerView > 0;
        };

        const drawDrag = () => {
            frame = 0;
            if (!axis) return;

            const travel = pointer - answered;
            answered = pointer;

            if (axis === "x" && paging()) {
                // The grid follows the finger up to the day it is turning to,
                // and stops there. Past that it would only be carried somewhere
                // it has to be brought back from.
                pageTravel += scrollAxisBy(
                    axis,
                    cappedPageStep(pageTravel, -travel, pageWidth)
                );
                return;
            }

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
            forgetExtents();
            element.scrollTop = scrollForAnchor(
                pinch.anchorHours,
                hourHeight,
                pinch.midY - pinch.top,
                element.scrollHeight - element.clientHeight
            );

            optionsRef.current.onScaleChange?.();
        };

        /**
         * Slides the days sideways by `distance`, and runs `andThen` when it
         * gets there.
         *
         * Relative, like everything else that moves this grid: an animation
         * aimed at an absolute offset is measured from a page that the
         * day-shifting can move out from under it mid-flight.
         */
        const slideDays = (distance: number, andThen?: () => void) => {
            const startedAt = performance.now();
            let moved = 0;
            const step = (now: number) => {
                const progress = Math.min(1, (now - startedAt) / SETTLE_MS);
                const wanted = distance * easeOutCubic(progress);
                scrollAxisBy("x", wanted - moved);
                moved = wanted;
                if (progress < 1) {
                    frame = requestAnimationFrame(step);
                    return;
                }
                frame = 0;
                andThen?.();
            };
            frame = requestAnimationFrame(step);
        };

        /**
         * Puts the grid back on a whole day once it has come to rest.
         *
         * Only ever horizontal: the hours are continuous, there is nothing to
         * land on there. Runs after everything else has stopped, so it never
         * competes with a finger or a fling.
         *
         * The distance is MEASURED off the column that is nearest the rail, not
         * worked out from a day's width (see offsetToDay): after a page has been
         * turned there is a fraction of a pixel left at most, and it is that
         * fraction — not a day — that decides whether the grid opens on one line
         * or two.
         */
        const settleOnDays = () => {
            if (!paging()) return;

            const distance = offsetToNearestDay(element);
            // Under half a pixel is already home; animating it would only cost
            // a frame and a flicker.
            if (distance === null || Math.abs(distance) < 0.5) return;
            slideDays(distance);
        };

        /**
         * Finishes the swipe: one day on, one day back, or the day it started
         * on — and always by carrying on the way the finger was already going.
         */
        const turnPage = (scrollVelocity: number) => {
            const turned = pagesTurnedBy(
                pageTravel,
                scrollVelocity,
                pageWidth
            );
            // A gesture that interrupted the last one settling started between
            // two days; the day it is going to is one page from where that one
            // WOULD have landed, not from where the finger happened to catch it.
            const remaining = pageResidual + turned * pageWidth - pageTravel;
            pageTravel = 0;
            pageResidual = 0;

            // The page is a measured day wide, give or take the fraction a flex
            // layout keeps to itself, so the grid lands on the day and THEN has
            // its last fraction of a pixel taken off it.
            if (Math.abs(remaining) < 0.5) {
                settleOnDays();
                return;
            }
            slideDays(remaining, settleOnDays);
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
            pageTravel = 0;
            forgetExtents();

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
                // Start from where the gesture was recognised, so the pixels
                // spent deciding are not also scrolled through.
                pointer = answered =
                    axis === "y" ? touch.clientY : touch.clientX;
                samples = [{ position: pointer, at: event.timeStamp }];
                // Once per gesture, and only for the one that needs them: both
                // are layout reads, and the drag is capped against the day's
                // width on every frame.
                pageTravel = 0;
                pageWidth = axis === "x" ? measureColumn() : 0;
                pageResidual =
                    axis === "x" && paging()
                        ? offsetToNearestDay(element) ?? 0
                        : 0;

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

            const last = samples[samples.length - 1];
            // A finger that came to rest before lifting was placing the grid,
            // not throwing it.
            const thrown =
                last && event.timeStamp - last.at <= FLING_TIMEOUT_MS;
            // Finger speed; scroll runs the other way.
            const velocity = thrown ? velocityFrom(samples) : 0;

            const travel = pointer - answered;
            answered = pointer;
            if (releasing === "x" && paging()) {
                pageTravel += scrollAxisBy(
                    releasing,
                    cappedPageStep(pageTravel, -travel, pageWidth)
                );
                // No glide across the days: a throw that carries its own
                // momentum lands wherever the momentum runs out, and the grid
                // then has to walk back to the nearest day. The swipe turns one
                // page instead, in the direction it was already going.
                turnPage(-velocity);
                return;
            }
            scrollAxisBy(releasing, -travel);

            if (stillGliding(velocity)) {
                glide(releasing, velocity);
                return;
            }

            // Whichever way the gesture went, the grid has stopped moving and
            // has to be looking at whole days when it does.
            settleOnDays();
        };

        const onTouchCancel = () => {
            const releasing = axis;
            stopFrame();
            tracking = false;
            axis = null;
            pinch = null;
            // A gesture taken away mid-swipe — the system claiming it for a
            // back-swipe, a call arriving — is still a gesture that asked for
            // something. It finishes the page it had committed to rather than
            // being dropped onto whichever day is nearest, which could be the
            // one it was leaving.
            if (releasing === "x" && paging()) {
                turnPage(0);
                return;
            }
            settleOnDays();
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
