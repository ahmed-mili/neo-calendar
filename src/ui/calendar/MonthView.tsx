import * as React from "react";
import { useCallback, useRef, useState } from "react";
import {
    DndContext,
    DragEndEvent,
    DragOverlay,
    DragStartEvent,
    MouseSensor,
    TouchSensor,
    useSensor,
    useSensors,
    closestCenter,
    useDraggable,
} from "@dnd-kit/core";
import { DisplayEvent } from "../types";
import { isToday, addDays, isSameDay } from "./CalendarUtils";
import { withAlpha } from "../../utils/color";
import { TaskCheckbox } from "./TaskCheckbox";
import {
    useWheelNavigation,
    VERTICAL_MONTH_THRESHOLD,
} from "./useWheelNavigation";
import { DragPreview } from "./TimeGrid.types";

interface MonthViewProps {
    events: DisplayEvent[];
    visibleDates: Date[];
    firstDay: number;
    timeFormat24h: boolean;
    onEventClick: (eventId: string) => void;
    onEventDrag: (
        eventId: string,
        newStart: Date,
        newEnd: Date
    ) => Promise<boolean>;
    onEventResize: (
        eventId: string,
        newStart: Date,
        newEnd: Date
    ) => Promise<boolean>;
    onSelectRange: (start: Date, end: Date, allDay: boolean) => void;
    /**
     * Clicking a day cell. What that does is a user setting — create an event,
     * or open that day — so the decision belongs to the caller, not here.
     */
    onDayClick: (date: Date) => void;
    onContextMenu: (eventId: string, mouseEvent: MouseEvent) => void;
    onToggleTask: (eventId: string, isDone: boolean) => Promise<boolean>;
    onEmptyContextMenu?: (date: Date, mouseEvent: MouseEvent) => void;
    onShiftMonths?: (months: number) => void;
    // Non utilise : le drop depuis le panneau ne vise que la grille horaire.
    externalPreview?: DragPreview | null;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_VISIBLE_EVENTS = 3;

function DraggableMonthEvent({
    event,
    onEventClick,
    onToggleTask,
}: {
    event: DisplayEvent;
    onEventClick: (id: string) => void;
    onToggleTask: (id: string, isDone: boolean) => Promise<boolean>;
}) {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `month-event-${event.id}`,
        data: { event },
        disabled: !event.editable,
    });

    const isCompleted = event.taskStatus === "complete";

    return (
        <div
            ref={setNodeRef}
            className={`nc-month-event ${isDragging ? "nc-dragging" : ""} ${
                isCompleted ? "nc-task-completed" : ""
            }`}
            style={{
                backgroundColor: withAlpha(event.color, 0.2),
                borderLeft: `3px solid ${event.color}`,
                color: event.color,
                cursor: event.editable ? "grab" : "default",
                opacity: isDragging ? 0.5 : 1,
            }}
            onClick={(e) => {
                e.stopPropagation();
                onEventClick(event.id);
            }}
            data-event-id={event.id}
            data-calendar-id={event.calendarId}
            data-visibility-state={event.visibilityState}
            {...attributes}
            {...listeners}
        >
            {event.isTask && (
                <button
                    className="nc-month-task-btn"
                    onClick={(e) => {
                        e.stopPropagation();
                        const nextDone = event.taskStatus !== "complete";
                        onToggleTask(event.id, nextDone);
                    }}
                >
                    <TaskCheckbox completed={isCompleted} size={12} />
                </button>
            )}
            <span className="nc-month-event-title">{event.title}</span>
        </div>
    );
}

export default function MonthView(props: MonthViewProps) {
    const {
        events,
        visibleDates,
        firstDay,
        onEventClick,
        onEventDrag,
        onDayClick,
        onEmptyContextMenu,
        onToggleTask,
        onShiftMonths,
    } = props;

    const [activeEvent, setActiveEvent] = useState<DisplayEvent | null>(null);
    const monthRef = useRef<HTMLDivElement>(null);

    useWheelNavigation(monthRef, {
        axis: "vertical",
        threshold: VERTICAL_MONTH_THRESHOLD,
        onStep: (steps) => onShiftMonths?.(steps),
        enabled: !!onShiftMonths,
    });

    // Souris : seuil en distance. Doigt : appui long — une contrainte en
    // distance ne s'arme jamais au tactile, le navigateur happant le geste pour
    // le scroll avant le premier pointermove (voir useTimeGridDrag).
    const sensors = useSensors(
        useSensor(MouseSensor, {
            activationConstraint: { distance: 5 },
        }),
        useSensor(TouchSensor, {
            activationConstraint: { delay: 220, tolerance: 8 },
        })
    );

    const handleDragStart = useCallback((event: DragStartEvent) => {
        const displayEvent = event.active.data.current?.event as DisplayEvent;
        setActiveEvent(displayEvent || null);
    }, []);

    const handleDragEnd = useCallback(
        (event: DragEndEvent) => {
            setActiveEvent(null);
            const displayEvent = event.active.data.current
                ?.event as DisplayEvent;
            if (!displayEvent || !displayEvent.editable) return;

            // Find which cell the event was dropped on using document.elementFromPoint
            const { x, y } = event.delta;
            const activatorRect = event.active.rect.current.translated;
            if (!activatorRect) return;

            const dropX = activatorRect.left + activatorRect.width / 2;
            const dropY = activatorRect.top + activatorRect.height / 2;
            const el = document.elementFromPoint(dropX, dropY);
            const cell = el?.closest("[data-date]") as HTMLElement | null;
            if (!cell) return;

            const dropDate = new Date(cell.dataset.date!);
            if (isNaN(dropDate.getTime())) return;

            // Don't move if dropped on same date
            if (dropDate.toDateString() === displayEvent.start.toDateString())
                return;

            // Calculate day offset
            const offsetDays = Math.round(
                (dropDate.getTime() - displayEvent.start.getTime()) / 86400000
            );
            if (offsetDays === 0) return;

            const newStart = addDays(displayEvent.start, offsetDays);
            const newEnd = addDays(displayEvent.end, offsetDays);
            onEventDrag(displayEvent.id, newStart, newEnd);
        },
        [onEventDrag]
    );

    // Group events by date string, including multi-day events on all their days
    const eventsByDate = new Map<string, DisplayEvent[]>();
    for (const event of events) {
        // Determine the range of days this event spans
        const eventStart = new Date(
            event.start.getFullYear(),
            event.start.getMonth(),
            event.start.getDate()
        );
        // For allDay events, end is exclusive (next day). For timed events, end is the actual end time.
        // We need the inclusive end date for display purposes.
        const eventEndDate = new Date(
            event.end.getFullYear(),
            event.end.getMonth(),
            event.end.getDate()
        );
        // If allDay, end is already exclusive, so the last display day is the day before
        const lastDisplayDay = event.allDay
            ? addDays(eventEndDate, -1)
            : eventEndDate;

        // Multi-day if the event spans more than one calendar day
        const isMultiDay = !isSameDay(eventStart, lastDisplayDay);
        if (isMultiDay) {
            let current = new Date(eventStart);
            while (current <= lastDisplayDay) {
                const key = current.toDateString();
                if (!eventsByDate.has(key)) {
                    eventsByDate.set(key, []);
                }
                eventsByDate.get(key)!.push(event);
                current = addDays(current, 1);
            }
        } else {
            const key = event.start.toDateString();
            if (!eventsByDate.has(key)) {
                eventsByDate.set(key, []);
            }
            eventsByDate.get(key)!.push(event);
        }
    }

    // Get day headers based on firstDay setting
    const dayHeaders = Array.from({ length: 7 }, (_, i) => {
        const dayIndex = (i + firstDay) % 7;
        return DAYS[dayIndex];
    });

    // 42 cells (6 rows x 7 cols)
    const weeks: Date[][] = [];
    for (let i = 0; i < 42; i += 7) {
        weeks.push(visibleDates.slice(i, i + 7));
    }

    // The displayed month is the one filling most of the 6-week grid (always
    // >= 28 days, so it wins outright over the leading/trailing adjacent-month
    // days). Those out-of-month days get `nc-other-month` and read dimmer.
    const monthCounts = new Map<number, number>();
    for (const d of visibleDates) {
        const m = d.getFullYear() * 12 + d.getMonth();
        monthCounts.set(m, (monthCounts.get(m) || 0) + 1);
    }
    let displayedMonth = -1;
    let bestCount = -1;
    for (const [m, c] of monthCounts) {
        if (c > bestCount) {
            bestCount = c;
            displayedMonth = m;
        }
    }

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
        >
            <div className="nc-month-view" ref={monthRef}>
                {/* Day headers */}
                <div className="nc-month-headers">
                    {dayHeaders.map((day, i) => (
                        <div key={i} className="nc-month-header">
                            {day}
                        </div>
                    ))}
                </div>

                {/* Cells */}
                <div className="nc-month-grid">
                    {weeks.map((week, weekIdx) => (
                        <div key={weekIdx} className="nc-month-row">
                            {week.map((date, dayIdx) => {
                                const key = date.toDateString();
                                const dayEvents = eventsByDate.get(key) || [];
                                const visible = dayEvents.slice(
                                    0,
                                    MAX_VISIBLE_EVENTS
                                );
                                const more =
                                    dayEvents.length - MAX_VISIBLE_EVENTS;

                                const inMonth =
                                    date.getFullYear() * 12 +
                                        date.getMonth() ===
                                    displayedMonth;

                                return (
                                    <div
                                        key={dayIdx}
                                        className={`nc-month-cell ${
                                            isToday(date) ? "nc-today" : ""
                                        } ${inMonth ? "" : "nc-other-month"}`}
                                        data-date={date.toISOString()}
                                        onClick={() => onDayClick(date)}
                                        onContextMenu={(e) => {
                                            if (onEmptyContextMenu) {
                                                onEmptyContextMenu(
                                                    date,
                                                    e.nativeEvent
                                                );
                                            }
                                        }}
                                    >
                                        <span className="nc-month-date">
                                            {date.getDate()}
                                        </span>
                                        <div className="nc-month-events">
                                            {visible.map((event) => (
                                                <DraggableMonthEvent
                                                    key={event.id}
                                                    event={event}
                                                    onEventClick={onEventClick}
                                                    onToggleTask={onToggleTask}
                                                />
                                            ))}
                                            {more > 0 && (
                                                <div className="nc-month-more">
                                                    +{more} more
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>
            <DragOverlay>
                {activeEvent ? (
                    <div
                        className="nc-month-event nc-drag-overlay"
                        style={{
                            backgroundColor: withAlpha(activeEvent.color, 0.2),
                            borderLeft: `3px solid ${activeEvent.color}`,
                            color: activeEvent.color,
                            opacity: 0.8,
                        }}
                    >
                        {activeEvent.title}
                    </div>
                ) : null}
            </DragOverlay>
        </DndContext>
    );
}
