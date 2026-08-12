import { useEffect, useLayoutEffect, useRef } from "react";
import {
    COLUMN_SEAM_PX,
    measureColumnWidth,
    scrollLeftForDay,
} from "./gridColumns";

interface Options {
    scrollRef: React.RefObject<HTMLElement>;
    daysPerView: number;
    /** First date in the current view — dependency key for scroll reset. */
    dateKey: string;
    /** Buffer days rendered on each side of the visible range. */
    bufferDays?: number;
    onShiftDays: (days: number) => void;
    enabled?: boolean;
}

/**
 * Virtualized continuous horizontal scroll for the TimeGrid.
 *
 * Renders `bufferDays` extra days on each side of the visible range so the
 * user can scroll freely without hitting the scroll container's edge. When
 * scroll crosses a soft threshold we preemptively shift the date range in
 * the parent and adjust scrollLeft in a layout effect so the content stays
 * visually continuous — the viewer never sees the seam.
 */
export function useInfiniteScroll(opts: Options): void {
    const {
        scrollRef,
        daysPerView,
        dateKey,
        bufferDays = 3,
        onShiftDays,
        enabled = true,
    } = opts;

    const dayWidthRef = useRef(0);
    const pendingShiftRef = useRef(0);
    const rafRef = useRef<number | null>(null);
    const onShiftDaysRef = useRef(onShiftDays);
    onShiftDaysRef.current = onShiftDays;

    const measure = () => {
        const el = scrollRef.current;
        if (!el || daysPerView <= 0) return;
        dayWidthRef.current = measureColumnWidth(el, daysPerView);
    };

    // After dateKey change (external nav or a shift we triggered), restore
    // scroll position synchronously before paint.
    useLayoutEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        measure();
        const dw = dayWidthRef.current;
        if (dw <= 0) return;

        if (pendingShiftRef.current !== 0) {
            el.scrollLeft -= pendingShiftRef.current * dw;
            pendingShiftRef.current = 0;
        } else {
            // External navigation: open on the first real day, against the rail.
            el.scrollLeft = scrollLeftForDay(bufferDays, dw);
        }
    }, [dateKey, bufferDays]);

    // Resize observer — keep scroll position proportional on width changes
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const ro = new ResizeObserver(() => {
            const oldDw = dayWidthRef.current;
            measure();
            const newDw = dayWidthRef.current;
            if (oldDw > 0 && newDw > 0) {
                // The seam is a line, not a day: it is the same one pixel at
                // any column width, so it is taken off before the rescale and
                // put back after. Scaling it with the rest would drift the
                // grid off the rail a little more on every resize.
                el.scrollLeft =
                    (el.scrollLeft - COLUMN_SEAM_PX) * (newDw / oldDw) +
                    COLUMN_SEAM_PX;
            }
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, [daysPerView]);

    useEffect(() => {
        if (!enabled) return;
        const el = scrollRef.current;
        if (!el) return;

        const checkBoundary = () => {
            if (pendingShiftRef.current !== 0) return;
            const dw = dayWidthRef.current;
            if (dw <= 0) return;

            const sl = el.scrollLeft;
            const center = scrollLeftForDay(bufferDays, dw);
            const offset = sl - center;

            // Shift when the visible range has moved more than (bufferDays - 1)
            // days from center. That leaves ~1 day of buffer before the hard
            // edge, enough headroom for momentum to settle after the shift.
            const threshold = Math.max(bufferDays - 1, 0.5) * dw;

            if (Math.abs(offset) <= threshold) return;

            // Re-center by shifting the date range so the viewer stays near
            // the middle of the buffer after the shift. A single big shift
            // is smoother than many small ones when the user flicks fast.
            const shift = Math.round(offset / dw);
            if (shift === 0) return;
            pendingShiftRef.current = shift;
            onShiftDaysRef.current(shift);
        };

        const onScroll = () => {
            // rAF-throttle the boundary check so we run at most once per frame
            // while still responding synchronously to scroll progress.
            if (rafRef.current !== null) return;
            rafRef.current = requestAnimationFrame(() => {
                rafRef.current = null;
                checkBoundary();
            });
        };

        el.addEventListener("scroll", onScroll, { passive: true });

        return () => {
            el.removeEventListener("scroll", onScroll);
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
        };
    }, [enabled, daysPerView, bufferDays]);
}
