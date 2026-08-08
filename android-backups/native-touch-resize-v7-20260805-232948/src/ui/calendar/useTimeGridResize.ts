import { useState, useEffect, useCallback } from "react";
import { HOUR_HEIGHT } from "./CalendarUtils";
import { DisplayEvent } from "../types";
import { ResizeState } from "./TimeGrid.types";

export function useTimeGridResize(
    events: DisplayEvent[],
    onEventResize: (
        eventId: string,
        newStart: Date,
        newEnd: Date
    ) => Promise<boolean>,
    draftSlot: { start: Date; end: Date; allDay: boolean } | null | undefined,
    onResizeDraft?: (newEnd: Date) => void
) {
    const [resizeState, setResizeState] = useState<ResizeState | null>(null);
    const [resizePreview, setResizePreview] = useState<{
        eventId: string;
        newStart: Date;
        newEnd: Date;
    } | null>(null);

    // Snap the dragged edge to the nearest quarter-hour and clamp it so the
    // event keeps a 15-min minimum. "top" moves the start (bounded by end−15m),
    // "bottom" moves the end (bounded by start+15m); the other edge is fixed.
    const computeSnapped = useCallback(
        (
            edge: "top" | "bottom",
            originalStart: Date,
            originalEnd: Date,
            deltaY: number
        ): { newStart: Date; newEnd: Date } => {
            const pxPerQuarter = HOUR_HEIGHT / 4;
            const snappedDeltaPx =
                Math.round(deltaY / pxPerQuarter) * pxPerQuarter;
            const deltaMs = (snappedDeltaPx / HOUR_HEIGHT) * 3600000;
            if (edge === "top") {
                let newStart = new Date(originalStart.getTime() + deltaMs);
                const maxStart = new Date(originalEnd.getTime() - 15 * 60000);
                if (newStart.getTime() > maxStart.getTime())
                    newStart = maxStart;
                return { newStart, newEnd: originalEnd };
            }
            let newEnd = new Date(originalEnd.getTime() + deltaMs);
            const minEnd = new Date(originalStart.getTime() + 15 * 60000);
            if (newEnd.getTime() < minEnd.getTime()) newEnd = minEnd;
            return { newStart: originalStart, newEnd };
        },
        []
    );

    const handleResizeStart = useCallback(
        (
            eventId: string,
            startY: number,
            edge: "top" | "bottom" = "bottom"
        ) => {
            const ev = events.find((e) => e.id === eventId);
            if (!ev) return;
            setResizeState({
                eventId,
                startY,
                edge,
                originalStart: ev.start,
                originalEnd: ev.end,
                dayDate: ev.start,
            });
            setResizePreview({ eventId, newStart: ev.start, newEnd: ev.end });
        },
        [events]
    );

    const handleResizeMouseMove = useCallback(
        (e: MouseEvent) => {
            if (!resizeState) return;
            const deltaY = e.clientY - resizeState.startY;
            const { newStart, newEnd } = computeSnapped(
                resizeState.edge,
                resizeState.originalStart,
                resizeState.originalEnd,
                deltaY
            );
            setResizePreview((prev) => {
                if (
                    prev &&
                    prev.newStart.getTime() === newStart.getTime() &&
                    prev.newEnd.getTime() === newEnd.getTime()
                ) {
                    return prev;
                }
                return { eventId: resizeState.eventId, newStart, newEnd };
            });
        },
        [resizeState, computeSnapped]
    );

    const handleResizeMouseUp = useCallback(
        (e: MouseEvent) => {
            if (!resizeState) return;
            const deltaY = e.clientY - resizeState.startY;
            const { newStart, newEnd } = computeSnapped(
                resizeState.edge,
                resizeState.originalStart,
                resizeState.originalEnd,
                deltaY
            );
            const changed =
                newStart.getTime() !== resizeState.originalStart.getTime() ||
                newEnd.getTime() !== resizeState.originalEnd.getTime();
            if (changed) {
                onEventResize(resizeState.eventId, newStart, newEnd);
            }
            setResizeState(null);
            setResizePreview(null);
        },
        [resizeState, onEventResize, computeSnapped]
    );

    useEffect(() => {
        if (resizeState) {
            window.addEventListener("mousemove", handleResizeMouseMove);
            window.addEventListener("mouseup", handleResizeMouseUp);
            return () => {
                window.removeEventListener("mousemove", handleResizeMouseMove);
                window.removeEventListener("mouseup", handleResizeMouseUp);
            };
        }
    }, [resizeState, handleResizeMouseMove, handleResizeMouseUp]);

    // Draft resize
    const [draftResize, setDraftResize] = useState<{
        startY: number;
        originalEnd: Date;
    } | null>(null);

    const handleDraftResizeStart = useCallback(
        (e: React.MouseEvent) => {
            if (!draftSlot) return;
            e.stopPropagation();
            e.preventDefault();
            setDraftResize({
                startY: e.clientY,
                originalEnd: draftSlot.end,
            });
        },
        [draftSlot]
    );

    useEffect(() => {
        if (!draftResize || !draftSlot) return;
        const onMove = (e: MouseEvent) => {
            const deltaY = e.clientY - draftResize.startY;
            const pxPerQuarter = HOUR_HEIGHT / 4;
            const snapped = Math.round(deltaY / pxPerQuarter) * pxPerQuarter;
            const deltaMs = (snapped / HOUR_HEIGHT) * 3600000;
            let newEnd = new Date(draftResize.originalEnd.getTime() + deltaMs);
            const minEnd = new Date(draftSlot.start.getTime() + 15 * 60000);
            if (newEnd.getTime() < minEnd.getTime()) newEnd = minEnd;
            if (onResizeDraft) onResizeDraft(newEnd);
        };
        const onUp = () => setDraftResize(null);
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
        return () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        };
    }, [draftResize, draftSlot, onResizeDraft]);

    return {
        resizeState,
        resizePreview,
        handleResizeStart,
        handleDraftResizeStart,
    };
}
