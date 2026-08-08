import { useState, useEffect, useCallback } from "react";
import { HOUR_HEIGHT } from "./CalendarUtils";
import { DisplayEvent } from "../types";
import { ResizeState } from "./TimeGrid.types";

type ResizeEdge = "top" | "bottom";

type DraftSlot = {
    start: Date;
    end: Date;
    allDay: boolean;
};

type ResizeDraftCallback = (
    newStart: Date,
    newEnd?: Date
) => void;

export function useTimeGridResize(
    events: DisplayEvent[],
    onEventResize: (
        eventId: string,
        newStart: Date,
        newEnd: Date
    ) => Promise<boolean>,
    draftSlot: DraftSlot | null | undefined,
    onResizeDraft?: ResizeDraftCallback
) {
    const [resizeState, setResizeState] =
        useState<ResizeState | null>(null);

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
                event.nativeEvent.stopImmediatePropagation();

                const pointerId =
                    event.pointerId;

                const handle =
                    event.currentTarget as HTMLElement;

                const startClientY =
                    event.clientY;

                const originalStart =
                    new Date(
                        draftSlot.start
                    );

                const originalEnd =
                    new Date(
                        draftSlot.end
                    );

                let lastStartMs =
                    originalStart.getTime();

                let lastEndMs =
                    originalEnd.getTime();

                document.documentElement.classList.add(
                    "nc-android-draft-resizing"
                );

                try {
                    handle.setPointerCapture(
                        pointerId
                    );
                } catch {
                    // Pointer capture is optional.
                }

                const cleanup = () => {
                    window.removeEventListener(
                        "pointermove",
                        onMove,
                        true
                    );

                    window.removeEventListener(
                        "pointerup",
                        onEnd,
                        true
                    );

                    window.removeEventListener(
                        "pointercancel",
                        onEnd,
                        true
                    );

                    document.documentElement.classList.remove(
                        "nc-android-draft-resizing"
                    );

                    try {
                        handle.releasePointerCapture(
                            pointerId
                        );
                    } catch {
                        // WebView may already have released capture.
                    }
                };

                const onMove = (
                    pointerEvent: PointerEvent
                ) => {
                    if (
                        pointerEvent.pointerId !==
                        pointerId
                    ) {
                        return;
                    }

                    pointerEvent.preventDefault();
                    pointerEvent.stopImmediatePropagation();

                    const result =
                        computeSnapped(
                            edge,
                            originalStart,
                            originalEnd,
                            pointerEvent.clientY -
                                startClientY
                        );

                    const nextStartMs =
                        result.newStart.getTime();

                    const nextEndMs =
                        result.newEnd.getTime();

                    if (
                        nextStartMs ===
                            lastStartMs &&
                        nextEndMs ===
                            lastEndMs
                    ) {
                        return;
                    }

                    lastStartMs =
                        nextStartMs;

                    lastEndMs =
                        nextEndMs;

                    if (onResizeDraft) {
                        onResizeDraft(
                            result.newStart,
                            result.newEnd
                        );
                    } else {
                        window.dispatchEvent(
                            new CustomEvent(
                                "neo-calendar-android-draft-resize",
                                {
                                    detail: {
                                        startMs:
                                            nextStartMs,
                                        endMs:
                                            nextEndMs,
                                    },
                                }
                            )
                        );
                    }
                };

                const onEnd = (
                    pointerEvent: PointerEvent
                ) => {
                    if (
                        pointerEvent.pointerId !==
                        pointerId
                    ) {
                        return;
                    }

                    pointerEvent.preventDefault();
                    pointerEvent.stopImmediatePropagation();

                    const result =
                        computeSnapped(
                            edge,
                            originalStart,
                            originalEnd,
                            pointerEvent.clientY -
                                startClientY
                        );

                    if (onResizeDraft) {
                        onResizeDraft(
                            result.newStart,
                            result.newEnd
                        );
                    } else {
                        window.dispatchEvent(
                            new CustomEvent(
                                "neo-calendar-android-draft-resize",
                                {
                                    detail: {
                                        startMs:
                                            result.newStart.getTime(),
                                        endMs:
                                            result.newEnd.getTime(),
                                    },
                                }
                            )
                        );
                    }

                    cleanup();
                };

                window.addEventListener(
                    "pointermove",
                    onMove,
                    {
                        capture: true,
                        passive: false,
                    }
                );

                window.addEventListener(
                    "pointerup",
                    onEnd,
                    {
                        capture: true,
                        passive: false,
                    }
                );

                window.addEventListener(
                    "pointercancel",
                    onEnd,
                    {
                        capture: true,
                        passive: false,
                    }
                );

                console.info(
                    `[NeoDraftResizeV72] start edge=${edge}`
                );
            },
            [
                draftSlot,
                onResizeDraft,
                computeSnapped,
            ]
        );

    return {
        resizeState,
        resizePreview,
        handleResizeStart,
        handleDraftResizeStart,
    };
}