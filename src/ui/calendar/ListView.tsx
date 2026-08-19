import * as React from "react";
import { DisplayEvent } from "../types";
import { isToday, formatTime } from "./CalendarUtils";
import { TaskCheckbox } from "./TaskCheckbox";
import { DragPreview } from "./TimeGrid.types";
import { t, tList } from "../i18n";

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

const DAY_NAMES_FALLBACK = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
];
const MONTH_NAMES_FALLBACK = [
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

/* The table writes a weekday the way it is read mid-sentence — "toutes les
   semaines le mardi" — which in French is lowercase. A day heading opens its
   line, so it opens with a capital. */
function startOfLine(word: string): string {
    return word.charAt(0).toUpperCase() + word.slice(1);
}

export default function ListView(props: ListViewProps) {
    const {
        events,
        visibleDates,
        timeFormat24h,
        onEventClick,
        onContextMenu,
        onEmptyContextMenu,
    } = props;
    const dayNames = tList("days.long", DAY_NAMES_FALLBACK);
    const monthNames = tList("months.long", MONTH_NAMES_FALLBACK);

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
                                    e.preventDefault();
                                    onEmptyContextMenu(date, e.nativeEvent);
                                }
                            }}
                        >
                            <span className="nc-list-day-name">
                                {startOfLine(dayNames[date.getDay()])}
                            </span>
                            <span className="nc-list-day-date">
                                {monthNames[date.getMonth()]} {date.getDate()}
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
                                            onContextMenu={(e) => {
                                                e.preventDefault();
                                                onContextMenu(
                                                    event.id,
                                                    e.nativeEvent
                                                );
                                            }}
                                            onKeyDown={(e) => {
                                                if (
                                                    e.key === "Enter" ||
                                                    e.key === " "
                                                ) {
                                                    e.preventDefault();
                                                    onEventClick(event.id);
                                                }
                                            }}
                                            role="button"
                                            tabIndex={0}
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
                                                    ? t("All day")
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
                                                    type="button"
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
                                        {t("No events")}
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
