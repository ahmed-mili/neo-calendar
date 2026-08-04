import * as React from "react";
import * as ReactDOM from "react-dom";

// Pointer-driven reordering for the calendar list. A press that moves past
// DRAG_THRESHOLD becomes a drag (below it, the row's normal click — opening the
// events panel — still fires); the lifted row follows the cursor while its
// siblings slide out of the way, and on release the row glides into its slot
// before the new order is committed. Only `transform`/`opacity` animate, so it
// stays smooth on machines without a dedicated GPU.

const DRAG_THRESHOLD = 5; // px before a press counts as a drag rather than a click
const GAP = 2; // .nc-calendar-list row gap — keep in sync with the CSS
const SETTLE_MS = 180; // glide-into-slot duration on drop

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
        pointerStartY: number;
        rowHeight: number;
    } | null>(null);
    const didDrag = React.useRef(false);
    const settleTimer = React.useRef<number | null>(null);
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
            info.current = {
                start: index,
                current: index,
                pointerStartY: e.clientY,
                rowHeight,
            };
            didDrag.current = false;

            const move = (ev: PointerEvent) => {
                const s = info.current;
                if (!s) return;
                const dy = ev.clientY - s.pointerStartY;
                if (!didDrag.current) {
                    if (Math.abs(dy) < DRAG_THRESHOLD) return;
                    didDrag.current = true;
                    document.body.style.userSelect = "none";
                    document.body.style.cursor = "grabbing";
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
                document.body.style.userSelect = "";
                document.body.style.cursor = "";
                teardown.current = null;
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
        },
        []
    );

    // Clean up dangling listeners / timers if we unmount mid-drag.
    React.useEffect(
        () => () => {
            if (teardown.current) teardown.current();
            if (settleTimer.current !== null)
                window.clearTimeout(settleTimer.current);
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
