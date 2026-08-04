import * as React from "react";
import { DisplayEvent } from "../types";
import EventBlock from "./EventBlock";

interface AllDayAreaProps {
    events: DisplayEvent[];
    timeFormat24h: boolean;
    onEventClick: (eventId: string) => void;
    onContextMenu: (eventId: string, mouseEvent: MouseEvent) => void;
    onToggleTask: (eventId: string, isDone: boolean) => Promise<boolean>;
}

export default function AllDayArea({
    events,
    timeFormat24h,
    onEventClick,
    onContextMenu,
    onToggleTask,
}: AllDayAreaProps) {
    if (events.length === 0) return null;

    return (
        <div className="nc-allday-area">
            <div className="nc-allday-label">all-day</div>
            <div className="nc-allday-events">
                {events.map((event) => (
                    <EventBlock
                        key={event.id}
                        event={event}
                        compact
                        onEventClick={onEventClick}
                        onContextMenu={onContextMenu}
                        onToggleTask={onToggleTask}
                    />
                ))}
            </div>
        </div>
    );
}
