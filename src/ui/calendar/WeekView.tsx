import * as React from "react";
import { DisplayEvent } from "../types";
import { DraftRange } from "./TimeGrid.types";
import TimeGrid from "./TimeGrid";
import { isMultiDayTimed } from "./CalendarUtils";

interface WeekViewProps {
    events: DisplayEvent[];
    visibleDates: Date[];
    firstDay: number;
    timeFormat24h: boolean;
    secondaryTimezones?: string[];
    onAddTimezone: (tz: string) => void;
    onRemoveTimezone: (tz: string) => void;
    allDayCollapsed: boolean;
    onToggleAllDayCollapsed: () => void;
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
    draftSlot?: { start: Date; end: Date; allDay: boolean } | null;
    draftColor?: string;
    onResizeDraft?: (range: DraftRange) => void;
    onShiftDays?: (days: number) => void;
    externalPreview?: import("./TimeGrid.types").DragPreview | null;
    onEventUnschedule?: (eventId: string) => Promise<boolean>;
}

export default function WeekView(props: WeekViewProps) {
    // Multi-day timed events render as a horizontal bar in the all-day band
    // (Notion-style), not as full-height column blocks.
    const timedEvents = props.events.filter(
        (e) => !e.allDay && !isMultiDayTimed(e)
    );
    const allDayEvents = props.events.filter(
        (e) => e.allDay || isMultiDayTimed(e)
    );

    return (
        <div className="nc-week-view">
            <TimeGrid
                dates={props.visibleDates}
                events={timedEvents}
                timeFormat24h={props.timeFormat24h}
                secondaryTimezones={props.secondaryTimezones}
                onAddTimezone={props.onAddTimezone}
                onRemoveTimezone={props.onRemoveTimezone}
                allDayCollapsed={props.allDayCollapsed}
                onToggleAllDayCollapsed={props.onToggleAllDayCollapsed}
                onEventClick={props.onEventClick}
                onEventDrag={props.onEventDrag}
                onEventResize={props.onEventResize}
                onSelectRange={props.onSelectRange}
                onContextMenu={props.onContextMenu}
                onToggleTask={props.onToggleTask}
                allDayEvents={allDayEvents}
                onEmptyContextMenu={props.onEmptyContextMenu}
                draftSlot={props.draftSlot}
                draftColor={props.draftColor}
                onResizeDraft={props.onResizeDraft}
                onShiftDays={props.onShiftDays}
                externalPreview={props.externalPreview}
                onEventUnschedule={props.onEventUnschedule}
            />
        </div>
    );
}
