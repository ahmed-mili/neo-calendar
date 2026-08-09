import { DateTime } from "luxon";
import { rrulestr } from "rrule";
import { NeoEvent } from "../../types";
import { DisplayEvent } from "../types";
import { getDisplayTitle } from "./CalendarEventsPanel.helpers";
import { getTaskStatus, isTask, TaskStatus } from "../tasks";
import { addDays, startOfDay } from "./calendarDateUtils";

/**
 * Converts NeoEvent (storage format) into one or more DisplayEvents
 * (render format) for a given visible range. Each event kind (single /
 * recurring / rrule / someday) is handled independently.
 */

interface ExpandContext {
    id: string;
    calendarId: string;
    calendarName: string;
    color: string;
    editable: boolean;
    rangeStart: Date;
    rangeEnd: Date;
}

const DAY_CODE_TO_INDEX: Record<string, number> = {
    U: 0,
    M: 1,
    T: 2,
    W: 3,
    R: 4,
    F: 5,
    S: 6,
};

function parseTimeToDate(dateStr: string, timeStr: string): Date | null {
    const dt = DateTime.fromISO(`${dateStr}T${timeStr}`, { zone: "local" });
    if (dt.invalidReason) return null;
    return dt.toJSDate();
}

function parseDateOnly(dateStr: string): Date {
    return DateTime.fromISO(dateStr, { zone: "local" })
        .startOf("day")
        .toJSDate();
}

/**
 * Builds start/end Date pair from an NeoEvent, returning null if parsing fails.
 * For all-day events, `end` is exclusive (start-of-next-day).
 */
function resolveTimes(
    dateStr: string,
    endDateStr: string | null | undefined,
    allDay: boolean,
    startTime: string | undefined,
    endTime: string | undefined
): { start: Date; end: Date } | null {
    if (allDay) {
        const start = parseDateOnly(dateStr);
        let endBase = parseDateOnly(endDateStr || dateStr);
        // An all-day event can't end before it starts. Degenerate data (e.g.
        // endDate one day before date, produced by some bulk edits) would make
        // end <= start, collapsing the bar's span and breaking lane layout.
        // Clamp so the event always spans at least its start day.
        if (endBase.getTime() < start.getTime()) endBase = start;
        return { start, end: addDays(endBase, 1) };
    }

    const start = parseTimeToDate(dateStr, startTime || "00:00");
    if (!start) return null;

    // A timed range whose end clock-time is later than its start fits within a
    // single day, so any endDate is ignored: contradictory data (e.g. a spurious
    // next-day endDate on a 23:30→23:45 event) would otherwise stretch it across
    // two days and render it as a full-column block. A genuine midnight cross
    // has endTime <= startTime and is handled by the shift below — it needs no
    // endDate.
    const endBaseDate =
        endTime && endTime > (startTime || "00:00")
            ? dateStr
            : endDateStr || dateStr;
    let end = endTime
        ? parseTimeToDate(endBaseDate, endTime) ??
          new Date(start.getTime() + 3_600_000)
        : new Date(start.getTime() + 3_600_000);
    // End time at or before start time means the event crosses midnight: it
    // ends the NEXT day at that time (e.g. 23:00 → 01:45). Shift the end day
    // forward rather than clamping (which would wrongly cap it at midnight).
    if (end.getTime() <= start.getTime()) {
        end = new Date(end.getTime());
        end.setDate(end.getDate() + 1);
    }
    // Still degenerate (e.g. an endDate far before date from a bad edit) → 1h.
    if (end.getTime() <= start.getTime()) {
        end = new Date(start.getTime() + 3_600_000);
    }
    return { start, end };
}

interface MakeArgs {
    ctx: ExpandContext;
    idSuffix?: string;
    title: string;
    description: string | undefined;
    start: Date;
    end: Date;
    allDay: boolean;
    isTask: boolean;
    taskCompleted: boolean | string;
    taskStatus: TaskStatus;
    isRecurring: boolean;
    isMultiDay: boolean;
}

function makeDisplayEvent({
    ctx,
    idSuffix,
    title,
    description,
    start,
    end,
    allDay,
    isTask,
    taskCompleted,
    taskStatus,
    isRecurring,
    isMultiDay,
}: MakeArgs): DisplayEvent {
    return {
        id: idSuffix ? `${ctx.id}_${idSuffix}` : ctx.id,
        title,
        start,
        end,
        allDay,
        color: ctx.color,
        editable: ctx.editable,
        calendarId: ctx.calendarId,
        calendarName: ctx.calendarName,
        isTask,
        taskCompleted,
        taskStatus,
        isRecurring,
        isMultiDay,
        isSomeday: false,
        description,
    };
}

// ── Single events ──────────────────────────────────────────

function expandSingle(
    event: NeoEvent & { type: "single" | undefined },
    ctx: ExpandContext
): DisplayEvent[] {
    const times = resolveTimes(
        event.date,
        event.endDate,
        !!event.allDay,
        event.allDay ? undefined : event.startTime || "00:00",
        event.allDay ? undefined : event.endTime || undefined
    );
    if (!times) return [];

    const isTask = event.completed !== undefined && event.completed !== null;
    return [
        makeDisplayEvent({
            ctx,
            title: getDisplayTitle(event.title),
            description: event.description,
            start: times.start,
            end: times.end,
            allDay: !!event.allDay,
            isTask,
            taskCompleted: event.completed ?? false,
            taskStatus: getTaskStatus(event) as TaskStatus,
            isRecurring: false,
            isMultiDay:
                !event.allDay &&
                !!event.endDate &&
                event.endDate !== event.date &&
                // Same guard as resolveTimes: a same-day time range (endTime
                // after startTime) is never multi-day, whatever endDate says.
                !(
                    !!event.endTime &&
                    event.endTime > (event.startTime || "00:00")
                ),
        }),
    ];
}

// ── Weekly-recurring events ────────────────────────────────

function expandRecurring(
    event: NeoEvent & { type: "recurring" },
    ctx: ExpandContext
): DisplayEvent[] {
    const targetDays = event.daysOfWeek
        .map((d) => DAY_CODE_TO_INDEX[d])
        .filter((d) => d !== undefined);
    if (targetDays.length === 0) return [];

    const effectiveStart = event.startRecur
        ? DateTime.fromISO(event.startRecur, { zone: "local" }).toJSDate()
        : ctx.rangeStart;
    const effectiveEnd = event.endRecur
        ? DateTime.fromISO(event.endRecur, { zone: "local" }).toJSDate()
        : ctx.rangeEnd;

    const startMs = Math.max(
        effectiveStart.getTime(),
        ctx.rangeStart.getTime()
    );
    const limit = Math.min(effectiveEnd.getTime(), ctx.rangeEnd.getTime());

    // Dates a single occurrence was detached from (moved or resized on its
    // own). Without this the detached date would come back on the next read and
    // sit on top of the copy that was moved away.
    const skipSet = new Set(event.skipDates || []);
    const seriesIsTask = isTask(event);
    const doneDays = new Set(event.completedDates || []);

    const results: DisplayEvent[] = [];
    let current = startOfDay(new Date(startMs));

    while (current.getTime() <= limit) {
        if (targetDays.includes(current.getDay())) {
            const dateStr = DateTime.fromJSDate(current, {
                zone: "local",
            }).toISODate()!;
            if (skipSet.has(dateStr)) {
                current = addDays(current, 1);
                continue;
            }
            const times = resolveTimes(
                dateStr,
                null,
                !!event.allDay,
                event.allDay ? undefined : event.startTime || "00:00",
                event.allDay ? undefined : event.endTime || undefined
            );
            if (times) {
                results.push(
                    makeDisplayEvent({
                        ctx,
                        idSuffix: dateStr,
                        title: getDisplayTitle(event.title),
                        description: event.description,
                        start: times.start,
                        end: times.end,
                        allDay: !!event.allDay,
                        // Each occurrence answers for itself: the series says
                        // whether it is a task, `completedDates` says which
                        // days are done.
                        isTask: seriesIsTask,
                        taskCompleted: doneDays.has(dateStr),
                        taskStatus: (doneDays.has(dateStr)
                            ? "complete"
                            : "todo") as TaskStatus,
                        isRecurring: true,
                        isMultiDay: false,
                    })
                );
            }
        }
        current = addDays(current, 1);
    }

    return results;
}

// ── RRULE events ───────────────────────────────────────────

function expandRrule(
    event: NeoEvent & { type: "rrule" },
    ctx: ExpandContext
): DisplayEvent[] {
    let dates: Date[];
    try {
        // rrule.js computes occurrences in UTC. A local-midnight dtstart (e.g.
        // 2026-06-25T00:00+02:00 = 2026-06-24T22:00Z) makes between() return
        // instants at 22:00Z, and reading them back in local time tips over to
        // the next day — the recurrence rendered one day late. Treat the
        // floating all-day anchor as UTC midnight on BOTH ends (dtstart here and
        // the read-back below) so the weekday is preserved regardless of offset.
        const rule = rrulestr(event.rrule, {
            dtstart: DateTime.fromISO(event.startDate, {
                zone: "utc",
            }).toJSDate(),
        });
        dates = rule.between(ctx.rangeStart, ctx.rangeEnd, true);
    } catch {
        return [];
    }

    const skipSet = new Set(event.skipDates || []);
    const seriesIsTask = isTask(event);
    const doneDays = new Set(event.completedDates || []);

    return dates.flatMap((d) => {
        const dateStr = DateTime.fromJSDate(d, { zone: "utc" }).toISODate();
        if (!dateStr || skipSet.has(dateStr)) return [];

        const times = resolveTimes(
            dateStr,
            null,
            !!event.allDay,
            event.allDay ? undefined : event.startTime || "00:00",
            event.allDay ? undefined : event.endTime || undefined
        );
        if (!times) return [];

        return [
            makeDisplayEvent({
                ctx,
                idSuffix: dateStr,
                title: getDisplayTitle(event.title),
                description: event.description,
                start: times.start,
                end: times.end,
                allDay: !!event.allDay,
                isTask: seriesIsTask,
                taskCompleted: doneDays.has(dateStr),
                taskStatus: (doneDays.has(dateStr)
                    ? "complete"
                    : "todo") as TaskStatus,
                isRecurring: true,
                isMultiDay: false,
            }),
        ];
    });
}

// ── Public entry point ─────────────────────────────────────

export function neoEventToDisplayEvents(
    event: NeoEvent,
    id: string,
    calendarId: string,
    calendarName: string,
    color: string,
    editable: boolean,
    rangeStart: Date,
    rangeEnd: Date
): DisplayEvent[] {
    const ctx: ExpandContext = {
        id,
        calendarId,
        calendarName,
        color,
        editable,
        rangeStart,
        rangeEnd,
    };

    if (event.type === "single" || event.type === undefined) {
        return expandSingle(event, ctx);
    }
    if (event.type === "recurring") {
        return expandRecurring(event, ctx);
    }
    if (event.type === "rrule") {
        return expandRrule(event, ctx);
    }
    // "someday" is not expanded here
    return [];
}
