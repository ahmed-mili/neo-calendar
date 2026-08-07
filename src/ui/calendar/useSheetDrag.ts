import { useEffect, useLayoutEffect } from "react";

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

/** Where the sheet can come to rest. */
export type SheetAnchor = "full" | "half" | "closed";

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
 * in pixels: 0 is filling the screen, `halfOffset` is its resting height, and
 * `height` is entirely off the bottom.
 */
export function settleSheet({
    offset,
    halfOffset,
    height,
    velocity,
}: {
    offset: number;
    halfOffset: number;
    height: number;
    velocity: number;
}): SheetAnchor {
    // A flick moves the sheet one step in the direction it was thrown, rather
    // than to the nearest anchor: throwing a sheet downwards from the top and
    // watching it dismiss itself is how a sheet loses someone's work.
    if (velocity > FLICK_VELOCITY) {
        return offset > halfOffset * 0.5 ? "closed" : "half";
    }
    if (velocity < -FLICK_VELOCITY) {
        return offset > halfOffset * 0.5 ? "half" : "full";
    }

    if (offset >= halfOffset + (height - halfOffset) * 0.5) return "closed";
    if (offset >= halfOffset * 0.5) return "half";
    return "full";
}

/** The translation, in pixels, that puts the sheet at a given anchor. */
export function offsetForAnchor({
    anchor,
    halfOffset,
    height,
}: {
    anchor: SheetAnchor;
    halfOffset: number;
    height: number;
}): number {
    if (anchor === "full") return 0;
    if (anchor === "half") return halfOffset;
    return height;
}

/** The header carries the close and menu buttons; a touch on one of them is
    that button's, or the sheet would swallow every tap on its own controls. */
const CONTROL_SELECTOR =
    "button, a, input, textarea, select, [role='button']";

/** A touch that lands on a control is that control's, not the sheet's. */
export function isDragHandleTarget(target: EventTarget | null): boolean {
    // Duck-typed rather than `instanceof Element`: the constructor only exists
    // where a DOM does, and this decision is worth testing without one.
    const element = target as { closest?: (selector: string) => unknown } | null;
    if (!element || typeof element.closest !== "function") return false;
    return !element.closest(CONTROL_SELECTOR);
}

interface Gesture {
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
}): void {
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
        // should open it.
        sheet.style.removeProperty(OFFSET_PROPERTY);
        place();
        // The keyboard and a rotation both change what "half the screen" means.
        window.addEventListener("resize", place);
        return () => {
            window.removeEventListener("resize", place);
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
    }, [enabled, sheetRef, variant]);

    useEffect(() => {
        const sheet = sheetRef.current;
        const handle = handleRef.current;
        if (!enabled || !sheet || !handle) return;

        const body = document.body;
        let gesture: Gesture | null = null;
        let frame = 0;
        let pending = 0;
        let height = 0;
        let halfOffset = 0;
        let closingTimer = 0;

        const measure = () => {
            height = sheet.getBoundingClientRect().height;
            halfOffset = restOffsetFor({ height, variant });
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
            if (anchor === "closed") {
                glideTo(height);
                closingTimer = window.setTimeout(() => {
                    closingTimer = 0;
                    onClose();
                }, SETTLE_MS);
                return;
            }
            glideTo(offsetForAnchor({ anchor, halfOffset, height }));
            window.setTimeout(() => {
                if (!gesture && !closingTimer) sheet.style.transition = "";
            }, SETTLE_MS);
        };

        const onTouchStart = (event: TouchEvent) => {
            if (event.touches.length !== 1) return;
            if (!isDragHandleTarget(event.target)) return;
            if (closingTimer) return;

            measure();
            const touch = event.touches[0];
            gesture = {
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

            // Never above the top anchor: a sheet that can be pulled past the
            // screen leaves a gap under it with nothing in it.
            gesture.offset = Math.min(
                height,
                Math.max(0, gesture.startOffset + dy)
            );
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

            settleAt(settleSheet({ offset, halfOffset, height, velocity }));
        };

        const onTouchCancel = () => {
            if (!gesture) return;
            const wasDragging = gesture.dragging;
            gesture = null;
            cancelFrame();
            body.classList.remove(DRAGGING_CLASS);
            if (wasDragging) settleAt("half");
        };

        handle.addEventListener("touchstart", onTouchStart, { passive: true });
        document.addEventListener("touchmove", onTouchMove, { passive: false });
        document.addEventListener("touchend", onTouchEnd, { passive: true });
        document.addEventListener("touchcancel", onTouchCancel, {
            passive: true,
        });

        return () => {
            handle.removeEventListener("touchstart", onTouchStart);
            document.removeEventListener("touchmove", onTouchMove);
            document.removeEventListener("touchend", onTouchEnd);
            document.removeEventListener("touchcancel", onTouchCancel);
            if (closingTimer) window.clearTimeout(closingTimer);
            cancelFrame();
            body.classList.remove(DRAGGING_CLASS);
        };
    }, [enabled, handleRef, onClose, sheetRef, variant]);
}
