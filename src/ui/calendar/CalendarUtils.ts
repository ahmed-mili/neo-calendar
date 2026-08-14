import { DateTime } from "luxon";
import { NeoEvent } from "../../types";
import { DisplayEvent, CalendarSource } from "../types";

import {
    SLOT_HEIGHT,
    currentHourHeight,
    ALLDAY_ROW_HEIGHT,
} from "./calendarConstants";
import { startOfDay as startOfDayFn } from "./calendarDateUtils";

// Re-export constants, date utils, formatters, and event expansion
export {
    HOUR_HEIGHT,
    SLOT_HEIGHT,
    MIN_HOUR_HEIGHT,
    MAX_HOUR_HEIGHT,
    clampHourHeight,
    currentHourHeight,
    setHourHeight,
    scaledPx,
    scaledHeightPx,
    OVERLAP_COL_GAP,
    EVENT_VGAP,
    ALLDAY_ROW_HEIGHT,
    ALLDAY_MAX_ROWS,
    ALLDAY_GROW_MS,
    DAYS_SHORT,
    DAYS_MIN,
    MONTHS_SHORT,
} from "./calendarConstants";
export {
    startOfDay,
    endOfDay,
    addDays,
    isSameDay,
    isToday,
    getWeekStart,
    getWeekDays,
} from "./calendarDateUtils";
export {
    formatHour,
    formatTime,
    formatDayHeader,
    formatMonthTitle,
    formatMonthTitleFull,
    formatDayTitle,
    formatWeekTitle,
    getMonthDayTitle,
    getListTitle,
} from "./calendarFormatters";
export { neoEventToDisplayEvents } from "./eventExpansion";

// A timed event that fully covers at least one calendar day (midnight to
// midnight). These render as a horizontal bar in the all-day band (Notion-
// style) instead of full-height column blocks, which otherwise read as a
// confusing "wall" filling the day. A short event that merely crosses midnight
// (e.g. 23:00→01:00) covers NO full day, so it stays in the grid with a
// next-day continuation — only genuine all-day-spanning events move to the band.
export function isMultiDayTimed(event: {
    start: Date;
    end: Date;
    allDay: boolean;
}): boolean {
    if (event.allDay) return false;
    const start = event.start;
    // First midnight at or after the start = start of the first day that could
    // be fully covered.
    const sod = startOfDayFn(start);
    const firstMidnight =
        sod.getTime() === start.getTime()
            ? sod
            : startOfDayFn(new Date(start.getTime() + 24 * 3600 * 1000));
    // A full day is covered iff the event reaches the FOLLOWING midnight.
    return event.end.getTime() >= firstMidnight.getTime() + 24 * 3600 * 1000;
}

// ── Event Positioning ──────────────────────────────────────

export function positionToDate(yPosition: number, dayDate: Date): Date {
    // Clamp to the day's own range [00:00, 24:00]. Dragging the pointer below
    // the grid otherwise yields hours >= 24, which setHours rolls over into the
    // NEXT day (e.g. 25:00 → 01:00) — so a downward drag "stuck" at 01:00
    // instead of reaching midnight. 24:00 resolves to next-day 00:00 = midnight.
    const hourHeight = currentHourHeight();
    const clampedY = Math.max(0, Math.min(yPosition, 24 * hourHeight));
    const totalMinutes = (clampedY / hourHeight) * 60;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = Math.round((totalMinutes % 60) / 15) * 15;
    const date = new Date(dayDate);
    date.setHours(hours, minutes, 0, 0);
    return date;
}

/** How far into the day an event starts, in hours. */
export function eventTopHours(start: Date, dayStart: Date): number {
    const hours =
        start.getHours() -
        dayStart.getHours() +
        (start.getMinutes() - dayStart.getMinutes()) / 60;
    return Math.max(0, hours);
}

/** How long an event lasts, in hours. */
export function eventDurationHours(start: Date, end: Date): number {
    return (end.getTime() - start.getTime()) / (1000 * 60 * 60);
}

export function getEventTop(start: Date, dayStart: Date): number {
    return eventTopHours(start, dayStart) * currentHourHeight();
}

export function getEventHeight(start: Date, end: Date): number {
    return Math.max(
        SLOT_HEIGHT,
        eventDurationHours(start, end) * currentHourHeight()
    );
}

/** Pick black or white text for legibility over a solid hex background. */
// readableTextColor vit desormais dans ./color, avec le reste du parsing des
// couleurs : la version d'ici ne lisait que le hex et rendait NaN sur la couleur
// d'accent du theme, qui arrive en `rgb(...)`.
export { readableTextColor } from "../../utils/color";

export interface OverlapGroup {
    events: {
        event: DisplayEvent;
        column: number;
        totalColumns: number;
    }[];
}

export function computeOverlapGroups(events: DisplayEvent[]): OverlapGroup[] {
    if (events.length === 0) return [];

    const sorted = [...events].sort((a, b) => {
        const startDiff = a.start.getTime() - b.start.getTime();
        if (startDiff !== 0) return startDiff;
        const durA = a.end.getTime() - a.start.getTime();
        const durB = b.end.getTime() - b.start.getTime();
        return durB - durA;
    });

    const groups: OverlapGroup[] = [];
    const assigned = new Set<string>();

    for (const event of sorted) {
        if (assigned.has(event.id)) continue;

        const group: OverlapGroup["events"] = [];
        const columns: DisplayEvent[][] = [];

        const assignToColumn = (ev: DisplayEvent): number => {
            for (let c = 0; c < columns.length; c++) {
                const lastInCol = columns[c][columns[c].length - 1];
                if (lastInCol.end.getTime() <= ev.start.getTime()) {
                    columns[c].push(ev);
                    return c;
                }
            }
            columns.push([ev]);
            return columns.length - 1;
        };

        const queue = [event];
        assigned.add(event.id);

        while (queue.length > 0) {
            const current = queue.shift()!;
            const col = assignToColumn(current);
            group.push({
                event: current,
                column: col,
                totalColumns: 0,
            });

            for (const ev of sorted) {
                if (assigned.has(ev.id)) continue;
                if (
                    ev.start.getTime() < current.end.getTime() &&
                    ev.end.getTime() > current.start.getTime()
                ) {
                    assigned.add(ev.id);
                    queue.push(ev);
                }
            }
        }

        const totalCols = columns.length;
        for (const item of group) {
            item.totalColumns = totalCols;
        }

        groups.push({ events: group });
    }

    return groups;
}

// ── Calendar Source Conversion ─────────────────────────────

export function eventSourceToCalendarSource(
    source: {
        id: string;
        editable: boolean;
        color: string;
        events: { event: NeoEvent; id: string }[];
    },
    calendars: Map<string, { name: string; type: string; icon?: string }>
): CalendarSource {
    const cal = calendars.get(source.id);
    return {
        id: source.id,
        name: cal?.name || source.id,
        color: source.color,
        editable: source.editable,
        type: (cal?.type as CalendarSource["type"]) || "local",
        ...(cal?.icon ? { icon: cal.icon } : {}),
    };
}

// ── Date → Frontmatter Conversion ────────────────────────────

export function dateEndpointsToFrontmatter(
    start: Date,
    end: Date,
    allDay: boolean
): Partial<NeoEvent> {
    const date = DateTime.fromJSDate(start).toISODate()!;
    const endDate = DateTime.fromJSDate(end).toISODate()!;
    return {
        type: "single",
        date,
        endDate: date !== endDate ? endDate : undefined,
        allDay,
        ...(allDay
            ? {}
            : {
                  startTime: DateTime.fromJSDate(start).toISOTime({
                      suppressMilliseconds: true,
                      includeOffset: false,
                      suppressSeconds: true,
                  }),
                  endTime: DateTime.fromJSDate(end).toISOTime({
                      suppressMilliseconds: true,
                      includeOffset: false,
                      suppressSeconds: true,
                  }),
              }),
    };
}

/** ISO-8601 week number: weeks start on Monday and belong to the year of their
    Thursday. Shared by the mini-calendar's week column and the mobile header. */
export function getISOWeek(date: Date): number {
    const utc = new Date(
        Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
    );
    const dayIndex = (utc.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
    utc.setUTCDate(utc.getUTCDate() - dayIndex + 3); // Thursday of this week
    const firstThursday = new Date(Date.UTC(utc.getUTCFullYear(), 0, 4));
    const firstDayIndex = (firstThursday.getUTCDay() + 6) % 7;
    firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayIndex + 3);
    return (
        1 + Math.round((utc.getTime() - firstThursday.getTime()) / 604800000)
    );
}

/** Whether the calendar is running inside the Android shell. The class is set
    once at startup by the Android entry point. */
export function isAndroidRuntime(): boolean {
    return (
        typeof document !== "undefined" &&
        document.body.classList.contains("nc-platform-android")
    );
}

/**
 * How tall one all-day lane is, in pixels.
 *
 * Doubled on the phone. At 24px a lane held one event and nothing else: the
 * band was exactly as tall as its single bar, so there was no room to aim at
 * under an existing event, and adding a second one meant hitting a seam. 48
 * leaves a bar its size and a gap beneath it worth pressing.
 *
 * A number and not a CSS variable because the lane maths is done in JS — the
 * band's height, the top of each bar, the scroll correction under it all come
 * from this, and a value only the stylesheet knew would put them out of step.
 */
export function allDayRowHeight(): number {
    return isAndroidRuntime() ? 48 : ALLDAY_ROW_HEIGHT;
}

/**
 * Whether a month name needs the smaller type in the phone's app bar.
 *
 * The bar holds the month, the week number, and three controls across 412px.
 * "août" left room to spare; "septembre" did not, and the title ran over the
 * week beside it. Rather than shrink every month to fit the longest, the long
 * ones step down a size — the row keeps its proportions eleven months of the
 * year and stops colliding in the twelfth.
 *
 * The threshold is the name's own length because that is what actually runs
 * out of room, which also carries to whatever language the phone is set to.
 */
export const LONG_MONTH_NAME = 8;

export function needsCompactMonthType(monthName: string): boolean {
    return monthName.trim().length >= LONG_MONTH_NAME;
}

/** How the header's date badge should read, given what the grid is showing.
    The names describe the move that would bring today back on screen: "back"
    when the view sits after today, "forward" when it sits before it. */
export type TodayBadgeState = "present" | "back" | "forward";

export function todayBadgeState(
    visibleDates: Date[],
    now: Date
): TodayBadgeState {
    if (visibleDates.length === 0) return "present";

    const dayNumber = (date: Date) =>
        date.getFullYear() * 10000 + date.getMonth() * 100 + date.getDate();

    const today = dayNumber(now);
    const days = visibleDates.map(dayNumber);

    if (days.some((day) => day === today)) return "present";
    return days[0] > today ? "back" : "forward";
}
