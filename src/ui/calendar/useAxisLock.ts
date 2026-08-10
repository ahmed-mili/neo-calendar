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
 * Across the days is a page turn rather than a scroll. A swipe is a decision
 * between three days — the one before, the one shown, the one after — so the
 * grid moves one day at a time and the drag is held to that day, with what is
 * dragged past it felt but not followed. A day rather than a screenful: in the
 * one-day view the two are the same, but in a two-day view a screenful moves
 * two days at once and half the alignments can never be reached. Free scrolling
 * that tidies itself up afterwards was the first attempt; a carousel is what a
 * day view actually is. The setting turns it back into a scroll for anyone who
 * wants that.
 *
 * The page animation moves the grid by a difference each frame rather than
 * towards a position, and so does the drag. The infinite scroll re-bases
 * scrollLeft whenever it shifts the day range, which it does mid-flight: an
 * animation aimed at an absolute offset would be measured from a page that had
 * moved under it. A whole-day snap at the end absorbs the rounding.
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

/** The shortest and longest a page turn may take. */
export const MIN_PAGE_MS = 90;
export const MAX_PAGE_MS = 320;

/** The slowest a page will travel, px/ms, when the finger gave it no speed. */
export const PAGE_BASE_SPEED = 1.2;

/** How far into the next page a drag must reach for the release to keep going. */
export const PAGE_COMMIT_FRACTION = 0.25;

/** A flick this fast (px/ms of scroll) turns the page whatever it travelled. */
export const PAGE_FLICK_VELOCITY = 0.35;

/** What is left of a drag once it is already a page from where it started. */
export const PAGE_RESISTANCE = 0.35;

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

/**
 * How long a page turn should take, given what is left to travel and how fast
 * the finger was going when it let go.
 *
 * A fixed duration is what makes a carousel feel heavy: released a hair from
 * the edge, the last few pixels still took the full animation, and a hard
 * flick was slowed down to the same pace as a lazy drag. Distance over speed
 * keeps the grid moving at roughly the rate the hand asked for, and the floor
 * on speed stops a page with nowhere to go from crawling.
 */
export function pageDuration(distance: number, velocity: number): number {
    const speed = Math.max(Math.abs(velocity), PAGE_BASE_SPEED);
    return Math.min(
        MAX_PAGE_MS,
        Math.max(MIN_PAGE_MS, Math.abs(distance) / speed)
    );
}

/**
 * How wide one page of the carousel is: one day, whatever the view.
 *
 * In the one-day view a day and a screenful are the same thing, which is where
 * the idea came from. They are not the same anywhere else: in a two-day view a
 * screenful moves two days per swipe, and half the alignments become
 * unreachable — starting on Monday-Tuesday, Tuesday-Wednesday can never be
 * shown. The day is the unit the grid is made of, so it is the unit it turns.
 *
 * Zero means there is nothing to page: a view with no days in it yet.
 */
export function pageWidthFor(
    viewportWidth: number,
    daysPerView: number
): number {
    if (!(daysPerView > 0) || !(viewportWidth > 0)) return 0;
    return viewportWidth / daysPerView;
}

/**
 * Which page a swipe lands on, relative to the one it started from.
 *
 * The days move a screenful at a time, like turning a page, rather than
 * scrolling freely and being tidied up afterwards: a swipe is a decision
 * between three days, not a distance.
 *
 * A flick decides on its own, however short — a quick one across a corner of
 * the screen is still someone asking for the next day. Otherwise it is how far
 * the page came: a quarter of the way over and it keeps going, less than that
 * and it falls back where it was.
 *
 * @param travelFraction how far the page moved, as a share of its width, in
 *                       scroll terms — positive is towards later days
 * @param velocity       the same direction, in px/ms
 */
export function pagedStep(
    travelFraction: number,
    velocity: number
): -1 | 0 | 1 {
    if (velocity >= PAGE_FLICK_VELOCITY) return 1;
    if (velocity <= -PAGE_FLICK_VELOCITY) return -1;
    if (travelFraction >= PAGE_COMMIT_FRACTION) return 1;
    if (travelFraction <= -PAGE_COMMIT_FRACTION) return -1;
    return 0;
}

/**
 * A drag held to one page, with the rest of it felt but not followed.
 *
 * Past a full page the finger keeps moving and the days barely do. Stopping
 * dead there would read as broken; letting it run would let one swipe cross a
 * week, which is the thing being replaced.
 */
export function resistedTravel(
    travel: number,
    pageWidth: number,
    resistance = PAGE_RESISTANCE
): number {
    if (pageWidth <= 0) return travel;
    const beyond = Math.abs(travel) - pageWidth;
    if (beyond <= 0) return travel;
    return Math.sign(travel) * (pageWidth + beyond * resistance);
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

        /** Set while a horizontal drag is turning pages rather than scrolling. */
        let page: {
            width: number;
            /** How far the drag has asked to move, before resistance. */
            asked: number;
            /** How far the grid has actually been moved for it. */
            applied: number;
        } | null = null;

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

            if (page) {
                // Held to one page, and moved by the difference each frame
                // rather than to a position: the infinite scroll re-bases
                // scrollLeft under us whenever it shifts the day range, and an
                // absolute target would be measured from a page that moved.
                const wanted = resistedTravel(page.asked, page.width);
                scrollAxisBy("x", wanted - page.applied);
                page.applied = wanted;
                return;
            }

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

        /**
         * Carries the grid the rest of the way to a page, or back to the one it
         * came from.
         *
         * Relative, frame by frame, for the same reason the drag is: the day
         * range can be re-based mid-flight, and an animation aimed at an
         * absolute offset would finish somewhere else entirely. It lands on a
         * whole day at the end, which also absorbs the rounding.
         */
        const turnPage = (distance: number, velocity: number) => {
            const { daysPerView = 0 } = optionsRef.current;
            const columnWidth =
                daysPerView > 0 ? element.clientWidth / daysPerView : 0;

            const land = () => {
                frame = 0;
                delete host.dataset.ncGliding;
                element.scrollLeft = snappedScroll(
                    element.scrollLeft,
                    columnWidth,
                    element.scrollWidth - element.clientWidth
                );
            };

            if (Math.abs(distance) < 0.5) {
                land();
                return;
            }

            host.dataset.ncGliding = "true";
            const startedAt = performance.now();
            const duration = pageDuration(distance, velocity);
            let moved = 0;

            const step = (now: number) => {
                const progress = Math.min(1, (now - startedAt) / duration);
                const wanted = distance * easeOutCubic(progress);
                scrollAxisBy("x", wanted - moved);
                moved = wanted;

                if (progress < 1) {
                    frame = requestAnimationFrame(step);
                    return;
                }
                land();
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

                // Across the days is a page turn, not a scroll — unless free
                // scrolling is on, where it stays a scroll.
                //
                // A page is a DAY, not a screenful. In the one-day view they
                // are the same thing, which is where the idea came from; in a
                // two- or three-day view a screenful jumps that many days at
                // once, and every alignment in between becomes unreachable —
                // starting on Monday-Tuesday you could never see
                // Tuesday-Wednesday.
                const pageWidth = pageWidthFor(
                    element.clientWidth,
                    optionsRef.current.daysPerView ?? 0
                );
                page =
                    axis === "x" &&
                    !optionsRef.current.freeScroll &&
                    pageWidth > 0
                        ? { width: pageWidth, asked: 0, applied: 0 }
                        : null;
                return;
            }

            pointer = axis === "y" ? touch.clientY : touch.clientX;
            samples.push({ position: pointer, at: event.timeStamp });
            if (samples.length > 8) samples.shift();

            // Scroll runs the other way to the finger: a page comes in from the
            // right when the hand goes left.
            if (page) page.asked = answered - pointer;

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
            const turning = page;
            tracking = false;
            axis = null;
            page = null;
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

            if (turning) {
                turning.asked = answered - pointer;
                const wanted = resistedTravel(turning.asked, turning.width);
                scrollAxisBy("x", wanted - turning.applied);
                turning.applied = wanted;

                const step = pagedStep(
                    turning.width > 0 ? wanted / turning.width : 0,
                    -velocity
                );
                turnPage(step * turning.width - wanted, -velocity);
                return;
            }

            const travel = pointer - answered;
            answered = pointer;
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
            stopFrame();
            tracking = false;
            axis = null;
            page = null;
            pinch = null;
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
