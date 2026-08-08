import { useState, useEffect, useCallback } from "react";
import { HOUR_HEIGHT } from "./CalendarUtils";
import { DisplayEvent } from "../types";
import { ResizeState } from "./TimeGrid.types";

type ResizeEdge = "top" | "bottom";

type DraftResizeState = {
    pointerId: number;
    startY: number;
    edge: ResizeEdge;
    originalStart: Date;
    originalEnd: Date;
};

function emitDraftResize(
    newStart: Date,
    newEnd: Date
): void {
    window.dispatchEvent(
        new CustomEvent(
            "neo-calendar-android-draft-resize",
            {
                detail: {
                    startMs:
                        newStart.getTime(),
                    endMs:
                        newEnd.getTime(),
                },
            }
        )
    );
}

export function useTimeGridResize(
    events: DisplayEvent[],
    onEventResize: (
        eventId: string,
        newStart: Date,
        newEnd: Date
    ) => Promise<boolean>,
    draftSlot:
        | {
              start: Date;
              end: Date;
              allDay: boolean;
          }
        | null
        | undefined,
    onResizeDraft?: (
        newEnd: Date
    ) => void
) {
    const [resizeState, setResizeState] =
        useState<ResizeState | null>(
            null
        );

    const [resizePreview, setResizePreview] =
        useState<{
            eventId: string;
            newStart: Date;
            newEnd: Date;
        } | null>(null);

    const computeSnapped = useCallback(
        (
            edge: ResizeEdge,
            originalStart: Date,
            originalEnd: Date,
            deltaY: number
        ): {
            newStart: Date;
            newEnd: Date;
        } => {
            const pixelsPerQuarter =
                HOUR_HEIGHT / 4;

            const snappedDeltaPixels =
                Math.round(
                    deltaY /
                        pixelsPerQuarter
                ) *
                pixelsPerQuarter;

            const deltaMs =
                (
                    snappedDeltaPixels /
                    HOUR_HEIGHT
                ) *
                3600000;

            if (edge === "top") {
                let newStart =
                    new Date(
                        originalStart.getTime() +
                            deltaMs
                    );

                const maximumStart =
                    new Date(
                        originalEnd.getTime() -
                            15 * 60000
                    );

                if (
                    newStart.getTime() >
                    maximumStart.getTime()
                ) {
                    newStart =
                        maximumStart;
                }

                return {
                    newStart,
                    newEnd:
                        originalEnd,
                };
            }

            let newEnd =
                new Date(
                    originalEnd.getTime() +
                        deltaMs
                );

            const minimumEnd =
                new Date(
                    originalStart.getTime() +
                        15 * 60000
                );

            if (
                newEnd.getTime() <
                minimumEnd.getTime()
            ) {
                newEnd =
                    minimumEnd;
            }

            return {
                newStart:
                    originalStart,
                newEnd,
            };
        },
        []
    );

    const handleResizeStart =
        useCallback(
            (
                eventId: string,
                startY: number,
                edge:
                    ResizeEdge =
                    "bottom"
            ) => {
                const event =
                    events.find(
                        (candidate) =>
                            candidate.id ===
                            eventId
                    );

                if (!event) {
                    return;
                }

                setResizeState({
                    eventId,
                    startY,
                    edge,
                    originalStart:
                        event.start,
                    originalEnd:
                        event.end,
                    dayDate:
                        event.start,
                });

                setResizePreview({
                    eventId,
                    newStart:
                        event.start,
                    newEnd:
                        event.end,
                });
            },
            [events]
        );

    const handleResizeMove =
        useCallback(
            (
                event: PointerEvent
            ) => {
                if (!resizeState) {
                    return;
                }

                event.preventDefault();

                const result =
                    computeSnapped(
                        resizeState.edge,
                        resizeState.originalStart,
                        resizeState.originalEnd,
                        event.clientY -
                            resizeState.startY
                    );

                setResizePreview(
                    (previous) => {
                        if (
                            previous &&
                            previous.newStart.getTime() ===
                                result.newStart.getTime() &&
                            previous.newEnd.getTime() ===
                                result.newEnd.getTime()
                        ) {
                            return previous;
                        }

                        return {
                            eventId:
                                resizeState.eventId,
                            newStart:
                                result.newStart,
                            newEnd:
                                result.newEnd,
                        };
                    }
                );
            },
            [
                resizeState,
                computeSnapped,
            ]
        );

    const handleResizeEnd =
        useCallback(
            (
                event: PointerEvent
            ) => {
                if (!resizeState) {
                    return;
                }

                event.preventDefault();

                const result =
                    computeSnapped(
                        resizeState.edge,
                        resizeState.originalStart,
                        resizeState.originalEnd,
                        event.clientY -
                            resizeState.startY
                    );

                const changed =
                    result.newStart.getTime() !==
                        resizeState.originalStart.getTime() ||
                    result.newEnd.getTime() !==
                        resizeState.originalEnd.getTime();

                if (changed) {
                    void onEventResize(
                        resizeState.eventId,
                        result.newStart,
                        result.newEnd
                    );
                }

                setResizeState(null);
                setResizePreview(null);
            },
            [
                resizeState,
                onEventResize,
                computeSnapped,
            ]
        );

    useEffect(() => {
        if (!resizeState) {
            return;
        }

        window.addEventListener(
            "pointermove",
            handleResizeMove,
            {
                passive: false,
            }
        );

        window.addEventListener(
            "pointerup",
            handleResizeEnd,
            {
                passive: false,
            }
        );

        window.addEventListener(
            "pointercancel",
            handleResizeEnd,
            {
                passive: false,
            }
        );

        return () => {
            window.removeEventListener(
                "pointermove",
                handleResizeMove
            );

            window.removeEventListener(
                "pointerup",
                handleResizeEnd
            );

            window.removeEventListener(
                "pointercancel",
                handleResizeEnd
            );
        };
    }, [
        resizeState,
        handleResizeMove,
        handleResizeEnd,
    ]);

    const [draftResize, setDraftResize] =
        useState<DraftResizeState | null>(
            null
        );

    const handleDraftResizeStart =
        useCallback(
            (
                event:
                    React.PointerEvent,
                edge: ResizeEdge
            ) => {
                if (
                    !draftSlot ||
                    draftSlot.allDay
                ) {
                    return;
                }

                event.stopPropagation();
                event.preventDefault();

                try {
                    (
                        event.currentTarget as HTMLElement
                    ).setPointerCapture(
                        event.pointerId
                    );
                } catch {
                    // Pointer capture is optional.
                }

                setDraftResize({
                    pointerId:
                        event.pointerId,
                    startY:
                        event.clientY,
                    edge,
                    originalStart:
                        draftSlot.start,
                    originalEnd:
                        draftSlot.end,
                });
            },
            [draftSlot]
        );

    useEffect(() => {
        if (!draftResize) {
            return;
        }

        const onMove = (
            event: PointerEvent
        ) => {
            if (
                event.pointerId !==
                draftResize.pointerId
            ) {
                return;
            }

            event.preventDefault();

            const result =
                computeSnapped(
                    draftResize.edge,
                    draftResize.originalStart,
                    draftResize.originalEnd,
                    event.clientY -
                        draftResize.startY
                );

            emitDraftResize(
                result.newStart,
                result.newEnd
            );

            if (
                draftResize.edge ===
                "bottom"
            ) {
                onResizeDraft?.(
                    result.newEnd
                );
            }
        };

        const onEnd = (
            event: PointerEvent
        ) => {
            if (
                event.pointerId !==
                draftResize.pointerId
            ) {
                return;
            }

            event.preventDefault();
            setDraftResize(null);
        };

        window.addEventListener(
            "pointermove",
            onMove,
            {
                passive: false,
            }
        );

        window.addEventListener(
            "pointerup",
            onEnd,
            {
                passive: false,
            }
        );

        window.addEventListener(
            "pointercancel",
            onEnd,
            {
                passive: false,
            }
        );

        return () => {
            window.removeEventListener(
                "pointermove",
                onMove
            );

            window.removeEventListener(
                "pointerup",
                onEnd
            );

            window.removeEventListener(
                "pointercancel",
                onEnd
            );
        };
    }, [
        draftResize,
        computeSnapped,
        onResizeDraft,
    ]);

    return {
        resizeState,
        resizePreview,
        handleResizeStart,
        handleDraftResizeStart,
    };
}