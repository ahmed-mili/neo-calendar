import { useRef, useState, useCallback } from "react";
import { positionToDate } from "./CalendarUtils";
import { SelectionState } from "./TimeGrid.types";

interface UseTimeGridSelectionParams {
    gridRef: React.RefObject<HTMLDivElement | null>;
    onSelectRange: (start: Date, end: Date, allDay: boolean) => void;
    onEmptyContextMenu?: (date: Date, mouseEvent: MouseEvent) => void;
}

// NOTE on geometry: every handler below derives the clicked time from
// `clientY - dayColumn.getBoundingClientRect().top`. The day column is a
// normal-flow descendant of the vertical scroller (.nc-main-scroller), so its
// rect top already tracks scroll. That difference is therefore the
// content-relative Y measured from hour 0 — exactly what positionToDate wants.
// Adding scrollTop on top would double-count the scroll offset.
export function useTimeGridSelection({
    gridRef,
    onSelectRange,
    onEmptyContextMenu,
}: UseTimeGridSelectionParams) {
    const [selection, setSelection] = useState<SelectionState | null>(null);
    const selectionRef = useRef<{
        isSelecting: boolean;
        dayIndex: number;
        dayDate: Date;
        startDate: Date;
    } | null>(null);

    const handleMouseDown = useCallback(
        (e: React.MouseEvent, date: Date, dayIndex: number) => {
            if (e.button !== 0) return;
            // Shift+drag is the multi-event marquee selection (handled at the
            // CalendarApp level) — don't start a draft-creation drag for it.
            if (e.shiftKey) return;
            const target = e.target as HTMLElement;
            if (target.closest(".nc-event-block")) return;
            if (target.closest("[data-draft-preview]")) return;

            const dayColumn = target.closest(".nc-timegrid-day");
            if (!dayColumn) return;

            const dayRect = dayColumn.getBoundingClientRect();
            const y = e.clientY - dayRect.top;
            const startDate = positionToDate(y, date);

            selectionRef.current = {
                isSelecting: true,
                dayIndex,
                dayDate: date,
                startDate,
            };
            // Do NOT show selection rect yet — only on actual drag movement

            // Prevent DndContext from processing this as a drag start
            e.preventDefault();

            const onMove = (ev: PointerEvent) => {
                if (!selectionRef.current?.isSelecting) return;
                const { dayIndex, dayDate, startDate } = selectionRef.current;

                // Notion-style cross-day selection: the END day follows the
                // column under the pointer, not the start column. So dragging
                // sideways onto another day extends the selection across days.
                const overEl = document.elementFromPoint(
                    ev.clientX,
                    ev.clientY
                ) as HTMLElement | null;
                const overCol = overEl?.closest(
                    ".nc-timegrid-day"
                ) as HTMLElement | null;

                let endDayDate = dayDate;
                let col: Element | null = overCol;
                if (overCol?.dataset.date) {
                    endDayDate = new Date(overCol.dataset.date);
                } else {
                    // Pointer outside any column (e.g. above/below the grid):
                    // keep the END on the start day and just track the time.
                    col =
                        gridRef.current?.querySelector(
                            `[data-day-index="${dayIndex}"]`
                        ) ?? null;
                }
                if (!col) return;

                const rect = col.getBoundingClientRect();
                const yy = ev.clientY - rect.top;
                const endDate = positionToDate(yy, endDayDate);

                setSelection((prev) => {
                    if (!prev) {
                        // First real movement — initialize the selection mirror
                        return {
                            startDate,
                            endDate,
                            dayIndex,
                        };
                    }
                    return { ...prev, endDate };
                });
            };

            const onUp = (ev: PointerEvent) => {
                if (!selectionRef.current?.isSelecting) return;
                selectionRef.current.isSelecting = false;

                setSelection((prev) => {
                    if (prev) {
                        const { startDate, endDate } = prev;
                        const diffMs = Math.abs(
                            endDate.getTime() - startDate.getTime()
                        );
                        if (diffMs >= 15 * 60000) {
                            const start = new Date(
                                Math.min(startDate.getTime(), endDate.getTime())
                            );
                            const end = new Date(
                                Math.max(startDate.getTime(), endDate.getTime())
                            );
                            onSelectRange(start, end, false);
                        }
                    }
                    return null;
                });
                selectionRef.current = null;
                document.removeEventListener("pointermove", onMove, true);
                document.removeEventListener("pointerup", onUp, true);
            };

            // Use pointer events on document with capture phase to fire
            // before @dnd-kit's PointerSensor can intercept them
            document.addEventListener("pointermove", onMove, true);
            document.addEventListener("pointerup", onUp, true);
        },
        [onSelectRange]
    );

    const handleDoubleClick = useCallback(
        (e: React.MouseEvent, date: Date) => {
            const target = e.target as HTMLElement;
            if (target.closest(".nc-event-block")) return;
            const dayColumn = target.closest(".nc-timegrid-day");
            if (!dayColumn) return;
            const dayRect = dayColumn.getBoundingClientRect();
            const y = e.clientY - dayRect.top;
            const clicked = positionToDate(y, date);
            // Snap to nearest 15 min
            const start = new Date(clicked);
            start.setMinutes(Math.round(start.getMinutes() / 15) * 15, 0, 0);
            const end = new Date(start.getTime() + 30 * 60000);
            // Abort any pending selection from the preceding mousedown/up pair
            selectionRef.current = null;
            setSelection(null);
            onSelectRange(start, end, false);
        },
        [onSelectRange]
    );

    const handleEmptyContext = useCallback(
        (e: React.MouseEvent, day: Date) => {
            // Right-clicking an event must not fall through to the empty-slot
            // menu — the event block's own context menu handles that.
            if ((e.target as HTMLElement).closest(".nc-event-block")) return;
            e.preventDefault();
            if (onEmptyContextMenu) {
                const dayColumn = (e.target as HTMLElement).closest(
                    ".nc-timegrid-day"
                );
                if (dayColumn) {
                    const dayRect = dayColumn.getBoundingClientRect();
                    const y = e.clientY - dayRect.top;
                    const clicked = positionToDate(y, day);
                    // Snap to nearest 15 min
                    const start = new Date(clicked);
                    start.setMinutes(
                        Math.round(start.getMinutes() / 15) * 15,
                        0,
                        0
                    );
                    onEmptyContextMenu(start, e.nativeEvent);
                } else {
                    onEmptyContextMenu(day, e.nativeEvent);
                }
            }
        },
        [onEmptyContextMenu]
    );

    return {
        selection,
        handleMouseDown,
        handleDoubleClick,
        handleEmptyContext,
    };
}
