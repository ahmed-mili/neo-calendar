import * as React from "react";
import { DisplayEvent } from "../types";
import { isSameDay, addDays } from "./CalendarUtils";
import { withAlpha } from "../../utils/color";

interface MultiDayEventBarProps {
    event: DisplayEvent;
    startDate: Date;
    totalDays: number;
    dayIndex: number;
    allDaysCount: number;
}

export default function MultiDayEventBar({
    event,
    dayIndex,
    allDaysCount,
}: MultiDayEventBarProps) {
    const leftPercent = dayIndex;
    const widthPercent = allDaysCount;

    return (
        <div
            className="nc-multiday-bar"
            style={{
                left: `${(leftPercent / 7) * 100}%`,
                width: `${(widthPercent / 7) * 100}%`,
                backgroundColor: withAlpha(event.color, 0.15),
                borderLeft: `3px solid ${event.color}`,
                color: event.color,
            }}
            data-calendar-id={event.calendarId}
            data-visibility-state={event.visibilityState}
        >
            <span className="nc-multiday-bar-title">{event.title}</span>
        </div>
    );
}
