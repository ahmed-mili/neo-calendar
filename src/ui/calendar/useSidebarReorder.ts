import * as React from "react";
import * as ReactDOM from "react-dom";

// Pointer-driven reordering for the calendar list. The lifted row follows the
// pointer while its siblings slide out of the way, and on release it glides
// into its slot before the new order is committed. Only `transform`/`opacity`
// animate, so it stays smooth on machines without a dedicated GPU.
//
// How a drag STARTS depends on the pointer, because the two devices mean
// different things by the same movement:
//
//   - A mouse only moves when you push it, so a few pixels of travel with the
//     button down is already a deliberate drag.
//   - A finger sliding down a list is how you SCROLL. Treating that as a drag
//     picks calendars up by accident — and worse, the row follows the finger
//     while the list scrolls underneath, because both gestures run at once.
//
// So touch has to say what it means first: hold still for LONG_PRESS_MS, the
// Android convention, and only then does the row lift. Until the hold
// completes the gesture belongs to the browser and scrolls normally; once it
// completes, scrolling is blocked so the two can never fight.

export const DRAG_THRESHOLD = 5; // px of travel that means "drag" for a mouse
export const LONG_PRESS_MS = 500; // hold before a finger picks a row up
export const LONG_PRESS_TOLERANCE = 10; // px of drift still counted as holding
const GAP = 2; // .nc-calendar-list row gap — keep in sync with the CSS
const SETTLE_MS = 180; // glide-into-slot duration on drop

/**
 * Whether this pointer must hold before it can drag.
 *
 * Keyed on the pointer, not the platform: a touchscreen laptop should behave
 * like a phone when used with a finger and like a desktop when used with the
 * trackpad, and only `pointerType` knows which is happening.
 */
export const needsLongPress = (pointerType: string): boolean =>
    pointerType === "touch";

/**
 * Movement during the hold that means the finger was scrolling after all.
 *
 * Generous enough to survive the wobble of a finger resting on glass, tight
 * enough that a real scroll gives the gesture straight back to the browser.
 */
export const abandonsLongPress = (dx: number, dy: number): boolean =>
    Math.hypot(dx, dy) > LONG_PRESS_TOLERANCE;

interface DragState {
    start: number;
    current: number;
    dy: number;
    rowHeight: number;
    settling: boolean;
}

export interface ReorderItemProps {
    ref: (el: HTMLElement | null) => void;
    style: React.CSSProperties | undefined;
    className: string;
    onPointerDown: (e: React.PointerEvent) => void;
}

export interface SidebarReorder {
    /** Props to spread onto each `.nc-calendar-item` (by list index). */
    getItemProps: (index: number) => ReorderItemProps;
    /** True while a drag is in progress (for a list-level "reordering" class). */
    dragging: boolean;
    /**
     * True if the gesture that just ended was a drag, not a click — the row's
     * onClick should bail so a reorder doesn't also open the events panel.
     */
    wasDragged: () => boolean;
}

export function useSidebarReorder(
    count: number,
    onReorder: (fromIndex: number, toIndex: number) => void
): SidebarReorder {
    const [drag, setDrag] = React.useState<DragState | null>(null);

    const rowRefs = React.useRef<(HTMLElement | null)[]>([]);
    const info = React.useRef<{
        start: number;
        current: number;
        pointerStartX: number;
        pointerStartY: number;
        rowHeight: number;
        holdToStart: boolean;
    } | null>(null);
    const didDrag = React.useRef(false);
    const settleTimer = React.useRef<number | null>(null);
    /** Pending long press, while a finger is deciding what it means. */
    const holdTimer = React.useRef<number | null>(null);
    const teardown = React.useRef<(() => void) | null>(null);

    // Read the latest values from stable callbacks without re-binding listeners.
    const countRef = React.useRef(count);
    countRef.current = count;
    const onReorderRef = React.useRef(onReorder);
    onReorderRef.current = onReorder;

    const onPointerDown = React.useCallback(
        (e: React.PointerEvent, index: number) => {
            if (e.button !== 0) return;
            const target = e.target as HTMLElement;
            // Never start a drag from an interactive control or the inline editor
            // — those keep their own click/edit behaviour.
            if (target.closest("button, input, textarea, a, .nc-calendar-edit"))
                return;
            const el = rowRefs.current[index];
            if (!el) return;

            const rowHeight = el.getBoundingClientRect().height + GAP;
            const holdToStart = needsLongPress(e.pointerType);
            info.current = {
                start: index,
                current: index,
                pointerStartX: e.clientX,
                pointerStartY: e.clientY,
                rowHeight,
                holdToStart,
            };
            didDrag.current = false;

            /** Lift the row: from here the gesture is a drag, not a scroll. */
            const arm = () => {
                didDrag.current = true;
                document.body.style.userSelect = "none";
                document.body.style.cursor = "grabbing";
                // The short tick Android gives when a row is picked up. Absent
                // on desktop and on iOS, hence the guard.
                if (holdToStart && typeof navigator.vibrate === "function") {
                    try {
                        navigator.vibrate(10);
                    } catch {
                        // A browser that refuses to buzz is not a failure.
                    }
                }
            };

            // While the hold is pending the finger still belongs to the
            // browser, so the list scrolls as usual. Once armed, this stops the
            // page from scrolling under a row that is following the finger —
            // the "both at once" behaviour that made this feel broken. Must be
            // non-passive, or preventDefault is ignored.
            const blockScroll = (ev: TouchEvent) => {
                if (didDrag.current) ev.preventDefault();
            };

            if (holdToStart) {
                holdTimer.current = window.setTimeout(() => {
                    holdTimer.current = null;
                    if (info.current) arm();
                }, LONG_PRESS_MS);
                window.addEventListener("touchmove", blockScroll, {
                    passive: false,
                });
            }

            const move = (ev: PointerEvent) => {
                const s = info.current;
                if (!s) return;
                const dy = ev.clientY - s.pointerStartY;
                if (!didDrag.current) {
                    if (s.holdToStart) {
                        // Still waiting on the hold. Real movement means this
                        // was a scroll, so drop the gesture entirely rather
                        // than lifting a row the user never meant to touch.
                        if (
                            abandonsLongPress(ev.clientX - s.pointerStartX, dy)
                        ) {
                            finishTeardown();
                            info.current = null;
                        }
                        return;
                    }
                    if (Math.abs(dy) < DRAG_THRESHOLD) return;
                    arm();
                }
                const n = countRef.current;
                const newIndex = Math.max(
                    0,
                    Math.min(n - 1, s.start + Math.round(dy / s.rowHeight))
                );
                s.current = newIndex;
                setDrag({
                    start: s.start,
                    current: newIndex,
                    dy,
                    rowHeight: s.rowHeight,
                    settling: false,
                });
            };

            const finishTeardown = () => {
                window.removeEventListener("pointermove", move);
                window.removeEventListener("pointerup", up);
                window.removeEventListener("pointercancel", cancel);
                window.removeEventListener("touchmove", blockScroll);
                if (holdTimer.current !== null) {
                    window.clearTimeout(holdTimer.current);
                    holdTimer.current = null;
                }
                document.body.style.userSelect = "";
                document.body.style.cursor = "";
                teardown.current = null;
            };

            // The browser fires this when it takes the gesture over for its own
            // scrolling. Nothing is left to drag, so let go of everything.
            const cancel = () => {
                finishTeardown();
                info.current = null;
                didDrag.current = false;
                setDrag(null);
            };

            const up = () => {
                const s = info.current;
                finishTeardown();
                if (!s || !didDrag.current) {
                    info.current = null;
                    return;
                }
                const { start, current, rowHeight: rh } = s;
                info.current = null;
                // Glide the lifted row to its target slot, then commit the order.
                setDrag({
                    start,
                    current,
                    dy: (current - start) * rh,
                    rowHeight: rh,
                    settling: true,
                });
                settleTimer.current = window.setTimeout(() => {
                    settleTimer.current = null;
                    // Batch so the order change and the drag-reset land in ONE
                    // render — otherwise React 17 (unbatched outside its own
                    // events) would paint an intermediate frame at the old order.
                    ReactDOM.unstable_batchedUpdates(() => {
                        setDrag(null);
                        if (current !== start)
                            onReorderRef.current(start, current);
                    });
                }, SETTLE_MS);
            };

            teardown.current = finishTeardown;
            window.addEventListener("pointermove", move);
            window.addEventListener("pointerup", up);
            window.addEventListener("pointercancel", cancel);
        },
        []
    );

    // Clean up dangling listeners / timers if we unmount mid-drag.
    React.useEffect(
        () => () => {
            if (teardown.current) teardown.current();
            if (settleTimer.current !== null)
                window.clearTimeout(settleTimer.current);
            if (holdTimer.current !== null)
                window.clearTimeout(holdTimer.current);
        },
        []
    );

    const getItemProps = (index: number): ReorderItemProps => {
        let style: React.CSSProperties | undefined;
        let className = "";
        if (drag) {
            if (index === drag.start) {
                style = {
                    transform: `translateY(${drag.dy}px)`,
                    transition: drag.settling
                        ? `transform ${SETTLE_MS}ms cubic-bezier(0.2, 0, 0, 1)`
                        : "none",
                    zIndex: 20,
                };
                className = "nc-calendar-dragging";
            } else {
                let shift = 0;
                if (
                    drag.start < drag.current &&
                    index > drag.start &&
                    index <= drag.current
                )
                    shift = -drag.rowHeight;
                else if (
                    drag.start > drag.current &&
                    index < drag.start &&
                    index >= drag.current
                )
                    shift = drag.rowHeight;
                style = {
                    transform: `translateY(${shift}px)`,
                    transition: "transform 180ms cubic-bezier(0.2, 0, 0, 1)",
                };
            }
        }
        return {
            ref: (el) => {
                rowRefs.current[index] = el;
            },
            style,
            className,
            onPointerDown: (e) => onPointerDown(e, index),
        };
    };

    return {
        getItemProps,
        dragging: drag !== null,
        wasDragged: () => didDrag.current,
    };
}
