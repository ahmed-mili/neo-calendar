import { useRef, useState, useCallback } from "react";
import { positionToDate } from "./CalendarUtils";
import { SelectionState } from "./TimeGrid.types";

interface UseTimeGridSelectionParams {
    gridRef: React.RefObject<HTMLDivElement | null>;
    onSelectRange: (start: Date, end: Date, allDay: boolean) => void;
    onEmptyContextMenu?: (date: Date, mouseEvent: MouseEvent) => void;
}

function isAndroidRuntime(): boolean {
    const androidWindow = window as Window & {
        NeoAndroid?: unknown;
    };

    return (
        Boolean(androidWindow.NeoAndroid) ||
        document.documentElement.classList.contains(
            "nc-platform-android"
        ) ||
        document.body?.classList.contains(
            "nc-platform-android"
        ) === true
    );
}

function snappedHalfHour(date: Date): {
    start: Date;
    end: Date;
} {
    const start = new Date(date);

    start.setMinutes(
        Math.round(start.getMinutes() / 15) * 15,
        0,
        0
    );

    return {
        start,
        end: new Date(start.getTime() + 30 * 60000),
    };
}

export function useTimeGridSelection({
    gridRef,
    onSelectRange,
    onEmptyContextMenu,
}: UseTimeGridSelectionParams) {
    const [selection, setSelection] =
        useState<SelectionState | null>(null);

    const selectionRef = useRef<{
        isSelecting: boolean;
        pointerId: number;
        dayIndex: number;
        dayDate: Date;
        startDate: Date;
        startClientX: number;
        startClientY: number;
        moved: boolean;
    } | null>(null);

    const handleMouseDown = useCallback(
        (
            event: React.PointerEvent,
            date: Date,
            dayIndex: number
        ) => {
            if (event.button !== 0) {
                return;
            }

            if (event.shiftKey) {
                return;
            }

            const target = event.target as HTMLElement;

            if (
                target.closest(".nc-event-block") ||
                target.closest("[data-draft-preview]") ||
                target.closest(".nc-event-popup")
            ) {
                return;
            }

            const dayColumn = target.closest(
                ".nc-timegrid-day"
            );

            if (!dayColumn) {
                return;
            }

            const dayRect =
                dayColumn.getBoundingClientRect();

            const startDate = positionToDate(
                event.clientY - dayRect.top,
                date
            );

            selectionRef.current = {
                isSelecting: true,
                pointerId: event.pointerId,
                dayIndex,
                dayDate: date,
                startDate,
                startClientX: event.clientX,
                startClientY: event.clientY,
                moved: false,
            };

            event.preventDefault();

            const cleanup = () => {
                document.removeEventListener(
                    "pointermove",
                    onMove,
                    true
                );

                document.removeEventListener(
                    "pointerup",
                    onUp,
                    true
                );

                document.removeEventListener(
                    "pointercancel",
                    onCancel,
                    true
                );

                document.removeEventListener(
                    "scroll",
                    onScrolled,
                    true
                );
            };

            const onMove = (
                pointerEvent: PointerEvent
            ) => {
                const current =
                    selectionRef.current;

                if (
                    !current?.isSelecting ||
                    pointerEvent.pointerId !==
                        current.pointerId
                ) {
                    return;
                }

                if (!current.moved) {
                    const distance = Math.hypot(
                        pointerEvent.clientX -
                            current.startClientX,
                        pointerEvent.clientY -
                            current.startClientY
                    );

                    if (distance < 10) {
                        return;
                    }

                    current.moved = true;
                }

                const overElement =
                    document.elementFromPoint(
                        pointerEvent.clientX,
                        pointerEvent.clientY
                    ) as HTMLElement | null;

                const overColumn =
                    overElement?.closest(
                        ".nc-timegrid-day"
                    ) as HTMLElement | null;

                let endDayDate =
                    current.dayDate;

                let column: Element | null =
                    overColumn;

                if (overColumn?.dataset.date) {
                    endDayDate = new Date(
                        overColumn.dataset.date
                    );
                } else {
                    column =
                        gridRef.current?.querySelector(
                            `[data-day-index="${current.dayIndex}"]`
                        ) ?? null;
                }

                if (!column) {
                    return;
                }

                const rect =
                    column.getBoundingClientRect();

                const endDate =
                    positionToDate(
                        pointerEvent.clientY -
                            rect.top,
                        endDayDate
                    );

                setSelection((previous) => {
                    if (!previous) {
                        return {
                            startDate:
                                current.startDate,
                            endDate,
                            dayIndex:
                                current.dayIndex,
                        };
                    }

                    return {
                        ...previous,
                        endDate,
                    };
                });
            };

            const onUp = (
                pointerEvent: PointerEvent
            ) => {
                const current =
                    selectionRef.current;

                if (
                    !current?.isSelecting ||
                    pointerEvent.pointerId !==
                        current.pointerId
                ) {
                    return;
                }

                current.isSelecting = false;

                if (
                    !current.moved &&
                    isAndroidRuntime()
                ) {
                    pointerEvent.preventDefault();
                    pointerEvent.stopImmediatePropagation();

                    const range =
                        snappedHalfHour(
                            current.startDate
                        );

                    setSelection(null);
                    selectionRef.current = null;
                    cleanup();

                    onSelectRange(
                        range.start,
                        range.end,
                        false
                    );

                    return;
                }

                setSelection((previous) => {
                    if (previous) {
                        const difference =
                            Math.abs(
                                previous.endDate.getTime() -
                                    previous.startDate.getTime()
                            );

                        if (
                            difference >=
                            15 * 60000
                        ) {
                            const start =
                                new Date(
                                    Math.min(
                                        previous.startDate.getTime(),
                                        previous.endDate.getTime()
                                    )
                                );

                            const end =
                                new Date(
                                    Math.max(
                                        previous.startDate.getTime(),
                                        previous.endDate.getTime()
                                    )
                                );

                            onSelectRange(
                                start,
                                end,
                                false
                            );
                        }
                    }

                    return null;
                });

                selectionRef.current = null;
                cleanup();
            };

            const onCancel = (
                pointerEvent: PointerEvent
            ) => {
                const current =
                    selectionRef.current;

                if (
                    current &&
                    pointerEvent.pointerId !==
                        current.pointerId
                ) {
                    return;
                }

                selectionRef.current = null;
                setSelection(null);
                cleanup();
            };

            /* A finger that scrolled the grid was never selecting anything in
               it. The browser used to say so itself: starting a touch scroll
               cancelled the pointer sequence, and onCancel cleaned up. On
               Android the grid now scrolls itself, one axis at a time, so that
               cancellation has to be spoken here — otherwise a swipe down the
               hours ends as a new event covering everything it passed. Any
               scroll will do; it does not matter who caused it. */
            const onScrolled = () => {
                selectionRef.current = null;
                setSelection(null);
                cleanup();
            };

            if (isAndroidRuntime()) {
                document.addEventListener(
                    "scroll",
                    onScrolled,
                    true
                );
            }

            document.addEventListener(
                "pointermove",
                onMove,
                true
            );

            document.addEventListener(
                "pointerup",
                onUp,
                true
            );

            document.addEventListener(
                "pointercancel",
                onCancel,
                true
            );
        },
        [gridRef, onSelectRange]
    );

    const handleDoubleClick = useCallback(
        (
            event: React.MouseEvent,
            date: Date
        ) => {
            if (isAndroidRuntime()) {
                return;
            }

            const target =
                event.target as HTMLElement;

            if (
                target.closest(
                    ".nc-event-block"
                )
            ) {
                return;
            }

            const dayColumn =
                target.closest(
                    ".nc-timegrid-day"
                );

            if (!dayColumn) {
                return;
            }

            const rect =
                dayColumn.getBoundingClientRect();

            const range =
                snappedHalfHour(
                    positionToDate(
                        event.clientY -
                            rect.top,
                        date
                    )
                );

            selectionRef.current = null;
            setSelection(null);

            onSelectRange(
                range.start,
                range.end,
                false
            );
        },
        [onSelectRange]
    );

    const handleEmptyContext = useCallback(
        (
            event: React.MouseEvent,
            day: Date
        ) => {
            if (
                (
                    event.target as HTMLElement
                ).closest(".nc-event-block")
            ) {
                return;
            }

            event.preventDefault();

            if (!onEmptyContextMenu) {
                return;
            }

            const dayColumn =
                (
                    event.target as HTMLElement
                ).closest(
                    ".nc-timegrid-day"
                );

            if (dayColumn) {
                const rect =
                    dayColumn.getBoundingClientRect();

                const clicked =
                    positionToDate(
                        event.clientY -
                            rect.top,
                        day
                    );

                const start =
                    snappedHalfHour(
                        clicked
                    ).start;

                onEmptyContextMenu(
                    start,
                    event.nativeEvent
                );
            } else {
                onEmptyContextMenu(
                    day,
                    event.nativeEvent
                );
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