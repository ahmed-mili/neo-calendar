import * as React from "react";
import { useEffect, useLayoutEffect } from "react";
import { swallowNextClick } from "./swallowNextClick";

/**
 * The event sheet follows the finger.
 *
 * The grab handle drawn across the top of the sheet on Android was decoration:
 * it promised a sheet that could be pulled about, and nothing happened. This
 * gives it the gesture it advertises — up to fill the screen, down to send it
 * back, down again to dismiss it.
 *
 * Position is written straight onto the element as a transform, frame by frame,
 * for the same reason the drawer does it (see useDrawerSwipe): React state
 * re-renders the tree on every frame of a drag, and a custom property on <body>
 * invalidates the style of every node in the document. A transform on one
 * already-promoted element costs neither.
 */

/**
 * Where the sheet can come to rest.
 *
 * Three of them are open, which is what the handle across the top says: `low`
 * is where the sheet stands when nothing has moved it, `half` is the middle,
 * and `full` fills the screen.
 */
export type SheetAnchor = "full" | "half" | "low" | "closed";

/** Past this speed (px/ms) the flick decides on its own, whatever distance the
    finger covered. Below it the nearest anchor wins. */
export const FLICK_VELOCITY = 0.5;

/** Below this the move is still ambiguous, so neither the sheet nor whatever is
    under the finger claims it. */
const DIRECTION_LOCK_PX = 6;

/** How long the sheet takes to reach its anchor once released. Matched in
    mobile.css so a release and a tap-to-close read as the same movement. */
const SETTLE_MS = 300;

const EASING = "cubic-bezier(0.05, 0.7, 0.1, 1)";

/** Written by the drag, read by mobile.css as the sheet's translation. */
const OFFSET_PROPERTY = "--nc-sheet-offset";

/** Where the sheet stands when nothing is holding it. */
const REST_PROPERTY = "--nc-sheet-rest-offset";

/** On the body while a finger is actually moving the sheet. */
const DRAGGING_CLASS = "nc-sheet-dragging";

/**
 * Which anchor a release settles on.
 *
 * `offset` is how far the sheet currently sits below its fully-open position,
 * in pixels: 0 is filling the screen, `restOffset` is its lowest open anchor,
 * and `height` is entirely off the bottom.
 */
export function settleSheet({
    offset,
    restOffset,
    height,
    velocity,
}: {
    offset: number;
    restOffset: number;
    height: number;
    velocity: number;
}): SheetAnchor {
    const ladder = anchorLadder({ restOffset, height });
    const nearest = ladder.reduce(
        (best, rung, index) =>
            Math.abs(rung.offset - offset) <
            Math.abs(ladder[best].offset - offset)
                ? index
                : best,
        0
    );

    // A flick moves the sheet one step in the direction it was thrown, rather
    // than to the nearest anchor: throwing a sheet downwards from the top and
    // watching it dismiss itself is how a sheet loses someone's work.
    if (velocity > FLICK_VELOCITY) {
        return ladder[Math.min(nearest + 1, ladder.length - 1)].anchor;
    }
    if (velocity < -FLICK_VELOCITY) {
        return ladder[Math.max(nearest - 1, 0)].anchor;
    }

    return ladder[nearest].anchor;
}

/**
 * How much of a sheet is left showing at its lowest.
 *
 * A strip, not a third of the screen: a chevron and the title, enough to say
 * the sheet is still there and to pull it back up, with the calendar underneath
 * otherwise free to be read. Google Calendar leaves exactly this, and the
 * lowest anchor is the only state in which the grid can be looked at while an
 * event is open — standing at half the screen, it was not one.
 */
export const SHEET_PEEK = 96;

/** Every anchor with the translation that puts the sheet there, top first. */
function anchorLadder({
    restOffset,
    height,
}: {
    restOffset: number;
    height: number;
}): { anchor: SheetAnchor; offset: number }[] {
    return [
        { anchor: "full" as const, offset: 0 },
        { anchor: "half" as const, offset: restOffset },
        // Never above the middle: a sheet no taller than the strip has nowhere
        // lower to stand than where it already is.
        {
            anchor: "low" as const,
            offset: Math.max(restOffset, height - SHEET_PEEK),
        },
        { anchor: "closed" as const, offset: height },
    ];
}

/**
 * Where a press on the handle sends the sheet.
 *
 * Up a rung, and back to the middle from the top: pressing settles into an
 * alternation between the middle and the top. The lowest anchor is somewhere
 * a finger drags to, never somewhere a press can strand you — a control that
 * grows a sheet must not, on its third press, shrink it to a strip.
 */
export function nextAnchorOnTap(anchor: SheetAnchor): SheetAnchor {
    if (anchor === "low") return "half";
    if (anchor === "half") return "full";
    return "half";
}

/** What the handle is drawn as, which is also what pressing it will do. */
export function sheetHandleGlyph(anchor: SheetAnchor): "up" | "bar" | "down" {
    if (anchor === "low") return "up";
    if (anchor === "full") return "down";
    return "bar";
}

/** The translation, in pixels, that puts the sheet at a given anchor. */
export function offsetForAnchor({
    anchor,
    restOffset,
    height,
}: {
    anchor: SheetAnchor;
    restOffset: number;
    height: number;
}): number {
    return (
        anchorLadder({ restOffset, height }).find(
            (rung) => rung.anchor === anchor
        )?.offset ?? height
    );
}

/** The header carries the close and menu buttons; a touch on one of them is
    that button's, or the sheet would swallow every tap on its own controls. */
const CONTROL_SELECTOR = "button, a, input, textarea, select, [role='button']";

/** The handle is a button too, and the one every finger reaches for. */
export const SHEET_HANDLE_SELECTOR = ".nc-sheet-handle";

/**
 * A touch that lands on a control is that control's, not the sheet's.
 *
 * Except the handle. It is a button — pressing it moves the sheet one anchor —
 * and it is also the bar everybody drags. Handing it to the control rule would
 * take away the gesture it has advertised since before it could be pressed at
 * all, so it is named back in.
 */
export function isDragHandleTarget(target: EventTarget | null): boolean {
    // Duck-typed rather than `instanceof Element`: the constructor only exists
    // where a DOM does, and this decision is worth testing without one.
    const element = target as {
        closest?: (selector: string) => unknown;
    } | null;
    if (!element || typeof element.closest !== "function") return false;
    if (element.closest(SHEET_HANDLE_SELECTOR)) return true;
    return !element.closest(CONTROL_SELECTOR);
}

/**
 * Whether a drag that began OUTSIDE the header should move the sheet.
 *
 * A sheet you can only move by its thin header does not feel like a sheet; it
 * feels like a header with a list glued underneath. So the whole surface drags
 * — but only where that cannot steal a scroll: downward, and only once the
 * content is already at its top. Push down on a list that has more above it and
 * you meant to scroll it back; push down on one already at the top and there is
 * nothing left to scroll, so you meant the sheet.
 */
export const dragsSheetFromBody = (scrollTop: number, dy: number): boolean =>
    scrollTop <= 0 && dy > 0;

/**
 * How far the scroller under this touch has been scrolled.
 *
 * Walks up to the sheet looking for whatever actually scrolls; a touch landing
 * on a non-scrolling row still has to answer for the list containing it.
 */
export function scrollTopUnder(
    target: EventTarget | null,
    sheet: HTMLElement
): number {
    let node = target as HTMLElement | null;
    while (node && node !== sheet.parentElement) {
        if (node.scrollHeight > node.clientHeight + 1) return node.scrollTop;
        node = node.parentElement;
    }
    return 0;
}

/**
 * How far the sheet actually moves once it is pulled past an anchor.
 *
 * A hard stop at the anchor reads as breakage: the finger keeps going and the
 * sheet is simply stuck to it, so the gesture feels dropped. Letting it follow
 * freely is worse — the sheet leaves a gap under it with nothing in it.
 *
 * So it follows, but grudgingly, giving way less and less the harder it is
 * pulled: elastic rather than either rigid or loose. The return never reaches
 * `dimension` however far the finger travels, which is what makes it feel
 * anchored — you can always tell you are pulling against something.
 */
export function rubberBand(
    overshoot: number,
    dimension: number,
    factor = 0.55
): number {
    if (overshoot <= 0 || dimension <= 0) return 0;
    return (1 - 1 / ((overshoot * factor) / dimension + 1)) * dimension;
}

interface Gesture {
    /** Started off the header, so it must prove it is not a scroll. */
    fromBody: boolean;
    /** Where the scroller stood when the finger landed. */
    startScrollTop: number;
    startY: number;
    startOffset: number;
    lastY: number;
    lastTime: number;
    velocity: number;
    offset: number;
    dragging: boolean;
}

/** The sheet's current translation, read back from the element itself so a
    gesture always starts from where the sheet actually is. */
function readOffset(element: HTMLElement): number {
    const matrix = new DOMMatrixReadOnly(
        getComputedStyle(element).transform === "none"
            ? ""
            : getComputedStyle(element).transform
    );
    return matrix.m42;
}

/**
 * How tall the sheet stands at rest, as a share of its own full height.
 *
 * It is laid out at the taller of its two anchors and pushed down to this one,
 * so both are the same element at two translations: nothing is resized
 * mid-gesture and the compositor carries the whole movement.
 *
 * A share of the sheet, deliberately, and not of the screen. The sheet is sized
 * in `dvh`, which shrinks when the keyboard comes up, while `window.innerHeight`
 * does not — so measuring one against the other made the resting height larger
 * than the sheet itself the moment a field had focus, and `max(0, …)` turned
 * that into zero: the top anchor. The sheet sprang open, and the tap that was
 * meant to close it was spent watching it grow.
 */
export const REST_SHARE = { sheet: 0.61, draft: 0.5 } as const;

/** No sheet stands taller than this at rest, however tall the screen is. */
export const REST_CEILING_PX = { sheet: 480, draft: 400 } as const;

/** The translation that leaves the sheet standing at its resting height. */
export function restOffsetFor({
    height,
    variant,
}: {
    height: number;
    variant: keyof typeof REST_SHARE;
}): number {
    const restHeight = Math.min(
        height * REST_SHARE[variant],
        REST_CEILING_PX[variant]
    );
    return Math.max(0, Math.min(height, height - restHeight));
}

export interface SheetDrag {
    /**
     * Closes the sheet the way a downward drag does: it leaves.
     *
     * A drag to dismiss already slid the sheet out and closed it when it had
     * gone; every other way out called onClose straight away, so the same
     * sheet left differently depending on how you dismissed it — and the
     * common way, the X, was the one that vanished. Nothing here should change
     * state without a transition.
     *
     * Falls back to closing at once where there is no sheet to slide: the
     * desktop, and the moment before the first layout.
     */
    requestClose: () => void;
    /** Which of the three open anchors the sheet is standing at. */
    anchor: SheetAnchor;
    /** What a press on the handle does: one rung, per nextAnchorOnTap. */
    pressHandle: () => void;
}

export function useSheetDrag({
    enabled,
    sheetRef,
    handleRef,
    variant,
    onClose,
}: {
    enabled: boolean;
    sheetRef: React.RefObject<HTMLElement>;
    handleRef: React.RefObject<HTMLElement>;
    variant: keyof typeof REST_SHARE;
    onClose: () => void;
}): SheetDrag {
    // Filled by the effect below while a sheet is on screen; the ref survives
    // the renders between, and is what the X and the backdrop call.
    const slideOutRef = React.useRef<(() => void) | null>(null);
    /*
     * Where the sheet stands, kept in state so the handle can be drawn as the
     * mark for it — and in a ref beside it, because the press handler is built
     * once and would otherwise read the anchor as it was when it was built.
     * The drag itself never touches either: it writes transforms frame by
     * frame and only reports where it came to rest.
     */
    const [anchor, setAnchor] = React.useState<SheetAnchor>("full");
    const anchorRef = React.useRef<SheetAnchor>("full");
    const settleAtRef = React.useRef<((to: SheetAnchor) => void) | null>(null);
    const restAt = React.useCallback((to: SheetAnchor) => {
        anchorRef.current = to;
        setAnchor(to);
    }, []);
    // Laid out before the first paint, so the sheet is never seen at its full
    // height for a frame before dropping to its resting one.
    useLayoutEffect(() => {
        const sheet = sheetRef.current;
        if (!enabled || !sheet) return;

        const place = () => {
            const height = sheet.getBoundingClientRect().height;
            if (!height) return;
            sheet.style.setProperty(
                REST_PROPERTY,
                restOffsetFor({ height, variant }) + "px"
            );
        };

        // Wherever the last gesture left the sheet is not where the next one
        // should open it — nor is the anchor it was left standing at.
        restAt("full");
        sheet.style.removeProperty(OFFSET_PROPERTY);
        place();

        /*
         * It comes up from the bottom, and that is the whole of it.
         *
         * Opening at the RESTING anchor made the sheet stop half way, so it
         * slid out and then parked somewhere in between — one movement read as
         * two, which is what made it feel odd. Opening full is also what the
         * sheet did before it could slide at all, so nothing about arriving
         * changes where it arrives.
         *
         * The resting anchor is not lost: it is where a downward drag settles,
         * one step before dismissal. It is a destination for the gesture, not
         * for the opening.
         */
        const height = sheet.getBoundingClientRect().height;
        if (height) {
            sheet.style.setProperty(OFFSET_PROPERTY, height + "px");
            /*
             * Force the off-screen position to be COMPUTED before releasing it.
             *
             * Reading a layout property flushes pending style, which is what
             * gives the transition a "from" to run out of. Scheduling the
             * release on the next animation frame instead — the first attempt —
             * is not reliable here: the sheet is portaled and mounted in the
             * same commit, and the frame could resolve with the browser having
             * never settled on the starting value, so it jumped straight to its
             * destination with nothing to animate.
             */
            void sheet.offsetHeight;
            sheet.style.setProperty(OFFSET_PROPERTY, "0px");
        }
        // The keyboard and a rotation both change what "half the screen" means.
        window.addEventListener("resize", place);

        /*
         * The sheet's own content changes height too, and that used to move it.
         *
         * The resting anchor is a number of PIXELS worked out from the height
         * the sheet had when it opened. Grow the content — switch an entry from
         * Event to Task and two rows appear, add a deadline and a date field
         * replaces a button — and that number is suddenly wrong for the new
         * height, so the sheet slid up under its own weight. Tapping a control
         * appeared to shove the panel around.
         *
         * A transform never changes layout, so re-placing from here cannot feed
         * back into another resize.
         */
        let observer: ResizeObserver | null = null;
        if (typeof ResizeObserver === "function") {
            observer = new ResizeObserver(place);
            observer.observe(sheet);
        }

        return () => {
            window.removeEventListener("resize", place);
            observer?.disconnect();
            /*
             * The anchor is deliberately left in place.
             *
             * Closing the sheet turns this effect off while the sheet is still
             * on screen, and clearing the anchor there sent it sliding up to
             * fill the screen instead of going away: the transform fell back to
             * zero, and the transition dutifully animated it there. Dismissing
             * something must never move it. The next opening rewrites the
             * anchor before the first paint anyway.
             */
        };
    }, [enabled, restAt, sheetRef, variant]);

    useEffect(() => {
        const sheet = sheetRef.current;
        const handle = handleRef.current;
        if (!enabled || !sheet || !handle) return;

        const body = document.body;
        let gesture: Gesture | null = null;
        let frame = 0;
        let pending = 0;
        let height = 0;
        let restOffset = 0;
        let closingTimer = 0;

        const measure = () => {
            height = sheet.getBoundingClientRect().height;
            restOffset = restOffsetFor({ height, variant });
        };

        const paint = (offset: number) => {
            sheet.style.setProperty(OFFSET_PROPERTY, offset + "px");
        };

        const schedule = (offset: number) => {
            pending = offset;
            if (frame) return;
            frame = window.requestAnimationFrame(() => {
                frame = 0;
                paint(pending);
            });
        };

        const cancelFrame = () => {
            if (!frame) return;
            window.cancelAnimationFrame(frame);
            frame = 0;
        };

        const glideTo = (offset: number) => {
            sheet.style.transition = "transform " + SETTLE_MS + "ms " + EASING;
            paint(offset);
        };

        const settleAt = (anchor: SheetAnchor) => {
            if (anchor !== "closed") restAt(anchor);
            if (anchor === "closed") {
                if (closingTimer) return;
                glideTo(height);
                closingTimer = window.setTimeout(() => {
                    closingTimer = 0;
                    onClose();
                }, SETTLE_MS);
                return;
            }
            glideTo(offsetForAnchor({ anchor, restOffset, height }));
            window.setTimeout(() => {
                if (!gesture && !closingTimer) sheet.style.transition = "";
            }, SETTLE_MS);
        };

        /*
         * Every way out that is not a finger, measured first.
         *
         * `height` is filled in by `measure()`, and until this ran only a touch
         * ever called it — so a sheet closed by the X without having been
         * dragged first glided to an offset of ZERO, which is where it already
         * was, and then vanished when the timer came round. That is the whole
         * of "it closes oddly, with no animation": the movement was asked for
         * and had nowhere to go. It bites hardest on the sheet that follows a
         * draft, because committing the draft changes the sheet's variant and
         * starts this effect over with the measurement cleared.
         */
        const leaveTo = (anchor: SheetAnchor) => {
            measure();
            settleAt(anchor);
        };
        // The same movement a downward drag ends with, offered to the X, the
        // backdrop and the handle, so the sheet always leaves the way it came.
        slideOutRef.current = () => leaveTo("closed");
        settleAtRef.current = leaveTo;

        const onTouchStart = (event: TouchEvent) => {
            if (event.touches.length !== 1) return;
            if (!isDragHandleTarget(event.target)) return;
            if (closingTimer) return;

            measure();
            const touch = event.touches[0];
            const fromBody = !handle.contains(event.target as Node);
            gesture = {
                fromBody,
                startScrollTop: fromBody
                    ? scrollTopUnder(event.target, sheet)
                    : 0,
                startY: touch.clientY,
                startOffset: readOffset(sheet),
                lastY: touch.clientY,
                lastTime: event.timeStamp,
                velocity: 0,
                offset: readOffset(sheet),
                dragging: false,
            };
        };

        const onTouchMove = (event: TouchEvent) => {
            if (!gesture) return;
            if (event.touches.length !== 1) {
                gesture = null;
                return;
            }

            const touch = event.touches[0];
            const dy = touch.clientY - gesture.startY;

            if (!gesture.dragging) {
                if (Math.abs(dy) < DIRECTION_LOCK_PX) return;
                // A drag off the header only takes over once it is clear it
                // is not a scroll; otherwise hand the finger back to the list.
                if (
                    gesture.fromBody &&
                    !dragsSheetFromBody(gesture.startScrollTop, dy)
                ) {
                    gesture = null;
                    return;
                }
                gesture.dragging = true;
                body.classList.add(DRAGGING_CLASS);
                sheet.style.transition = "none";
            }

            const elapsed = event.timeStamp - gesture.lastTime;
            if (elapsed > 0) {
                gesture.velocity = (touch.clientY - gesture.lastY) / elapsed;
                gesture.lastY = touch.clientY;
                gesture.lastTime = event.timeStamp;
            }

            // Past either anchor the sheet gives way elastically instead of
            // sticking to the finger: it still cannot be pulled off the screen,
            // but the limit is something you feel rather than something you hit.
            const raw = gesture.startOffset + dy;
            gesture.offset =
                raw < 0
                    ? -rubberBand(-raw, height)
                    : raw > height
                    ? height + rubberBand(raw - height, height)
                    : raw;
            schedule(gesture.offset);

            if (event.cancelable) event.preventDefault();
        };

        const onTouchEnd = () => {
            if (!gesture) return;

            const wasDragging = gesture.dragging;
            const { offset, velocity } = gesture;
            gesture = null;
            cancelFrame();
            body.classList.remove(DRAGGING_CLASS);

            if (!wasDragging) {
                sheet.style.transition = "";
                return;
            }

            /* A drag that started on the handle still owes the browser a click,
               and the handle answers a click by moving the sheet: released at
               one anchor, it would immediately walk to the next. */
            swallowNextClick();
            settleAt(settleSheet({ offset, restOffset, height, velocity }));
        };

        const onTouchCancel = () => {
            if (!gesture) return;
            const wasDragging = gesture.dragging;
            gesture = null;
            cancelFrame();
            body.classList.remove(DRAGGING_CLASS);
            // Back where it stood: a cancelled gesture must not move anything.
            if (wasDragging) settleAt(anchorRef.current);
        };

        sheet.addEventListener("touchstart", onTouchStart, { passive: true });
        document.addEventListener("touchmove", onTouchMove, { passive: false });
        document.addEventListener("touchend", onTouchEnd, { passive: true });
        document.addEventListener("touchcancel", onTouchCancel, {
            passive: true,
        });

        return () => {
            sheet.removeEventListener("touchstart", onTouchStart);
            document.removeEventListener("touchmove", onTouchMove);
            document.removeEventListener("touchend", onTouchEnd);
            document.removeEventListener("touchcancel", onTouchCancel);
            if (closingTimer) window.clearTimeout(closingTimer);
            slideOutRef.current = null;
            settleAtRef.current = null;
            cancelFrame();
            body.classList.remove(DRAGGING_CLASS);
        };
    }, [enabled, handleRef, onClose, restAt, sheetRef, variant]);

    return {
        requestClose: React.useCallback(() => {
            const slideOut = slideOutRef.current;
            if (slideOut) slideOut();
            else onClose();
        }, [onClose]),
        anchor,
        pressHandle: React.useCallback(() => {
            settleAtRef.current?.(nextAnchorOnTap(anchorRef.current));
        }, []),
    };
}
