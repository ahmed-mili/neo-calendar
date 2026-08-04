import * as React from "react";
import { DisplayEvent } from "../types";
import { isToday, formatTime, isSameDay } from "./CalendarUtils";
import { TaskCheckbox } from "./TaskCheckbox";
import { DragPreview } from "./TimeGrid.types";

interface ListViewProps {
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
    onContextMenu: (eventId: string, mouseEvent: MouseEvent) => void;
    onToggleTask: (eventId: string, isDone: boolean) => Promise<boolean>;
    onEmptyContextMenu?: (date: Date, mouseEvent: MouseEvent) => void;
    // Non utilise : le drop depuis le panneau ne vise que la grille horaire.
    externalPreview?: DragPreview | null;
}

const DAY_NAMES = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
];
const MONTH_NAMES = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
];

export default function ListView(props: ListViewProps) {
    const {
        events,
        visibleDates,
        timeFormat24h,
        onEventClick,
        onEmptyContextMenu,
    } = props;

    // Group events by date
    const eventsByDate = new Map<string, DisplayEvent[]>();
    for (const date of visibleDates) {
        const key = date.toDateString();
        const dayEvents = events.filter((e) => {
            const eventDate = new Date(e.start);
            return (
                eventDate.getFullYear() === date.getFullYear() &&
                eventDate.getMonth() === date.getMonth() &&
                eventDate.getDate() === date.getDate()
            );
        });
        if (dayEvents.length > 0) {
            eventsByDate.set(
                key,
                dayEvents.sort((a, b) => a.start.getTime() - b.start.getTime())
            );
        }
    }

    return (
        <div className="nc-list-view">
            {visibleDates.map((date) => {
                const key = date.toDateString();
                const dayEvents = eventsByDate.get(key);
                const hasEvents = dayEvents && dayEvents.length > 0;

                return (
                    <div key={key} className="nc-list-day">
                        <div
                            className={`nc-list-day-header ${
                                isToday(date) ? "nc-today" : ""
                            }`}
                            onContextMenu={(e) => {
                                if (onEmptyContextMenu) {
                                    onEmptyContextMenu(date, e.nativeEvent);
                                }
                            }}
                        >
                            <span className="nc-list-day-name">
                                {DAY_NAMES[date.getDay()]}
                            </span>
                            <span className="nc-list-day-date">
                                {MONTH_NAMES[date.getMonth()]} {date.getDate()}
                            </span>
                        </div>
                        <div className="nc-list-events">
                            {hasEvents ? (
                                dayEvents!.map((event) => {
                                    const isCompleted =
                                        event.taskStatus === "complete";
                                    return (
                                        <div
                                            key={event.id}
                                            className={`nc-list-event ${
                                                isCompleted
                                                    ? "nc-task-completed"
                                                    : ""
                                            }`}
                                            onClick={() =>
                                                onEventClick(event.id)
                                            }
                                            data-event-id={event.id}
                                            data-calendar-id={event.calendarId}
                                            data-visibility-state={
                                                event.visibilityState
                                            }
                                        >
                                            <span
                                                className="nc-list-event-dot"
                                                style={{
                                                    backgroundColor:
                                                        event.color,
                                                }}
                                            />
                                            <span className="nc-list-event-time">
                                                {event.allDay
                                                    ? "All day"
                                                    : `${formatTime(
                                                          event.start,
                                                          timeFormat24h
                                                      )}${
                                                          !event.allDay &&
                                                          event.end
                                                              ? ` - ${formatTime(
                                                                    event.end,
                                                                    timeFormat24h
                                                                )}`
                                                              : ""
                                                      }`}
                                            </span>
                                            <span className="nc-list-event-title">
                                                {event.title}
                                            </span>
                                            {event.isTask && (
                                                <button
                                                    className="nc-list-task-btn"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        const nextDone =
                                                            event.taskStatus !==
                                                            "complete";
                                                        props.onToggleTask(
                                                            event.id,
                                                            nextDone
                                                        );
                                                    }}
                                                >
                                                    <TaskCheckbox
                                                        completed={isCompleted}
                                                    />
                                                </button>
                                            )}
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="nc-list-empty">
                                    <span className="nc-list-empty-text">
                                        No events
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
