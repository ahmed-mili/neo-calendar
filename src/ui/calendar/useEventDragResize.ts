import { useCallback } from "react";
import { DateTime } from "luxon";
import {
    buildScheduledPayload,
    buildUnscheduledPayload,
    canUnschedule,
    mergeForSave,
} from "./eventScheduling";

const toTimeString = (d: Date) =>
    DateTime.fromJSDate(d).toISOTime({
        includeOffset: false,
        suppressMilliseconds: true,
        suppressSeconds: true,
        includePrefix: false,
    });

/**
 * Commit a drag to the cache. Exported (and free of React) so its rules — above
 * all "moving one occurrence must not touch the rest of the series" — can be
 * tested directly.
 */
export async function applyEventDrag(
    cache: any,
    eventId: string,
    newStart: Date,
    newEnd: Date,
    // When provided, overrides the event's all-day flag — used to convert
    // timed↔all-day by dragging between the grid and the all-day band.
    allDayOverride?: boolean
): Promise<boolean> {
    const event = cache.getEventById(eventId);
    if (!event) return false;
    const allDay = allDayOverride !== undefined ? allDayOverride : event.allDay;

    // Un someday n'a ni date ni heures : le deposer sur la grille le convertit
    // en evenement unique. Traite avant les autres types, sa conversion ne
    // reutilise rien de leur logique de dates.
    if (event.type === "someday") {
        try {
            const payload = buildScheduledPayload(
                event,
                newStart,
                newEnd,
                allDay
            );
            await cache.updateEventWithId(
                eventId,
                mergeForSave(event, payload) as any
            );
            return true;
        } catch {
            return false;
        }
    }

    try {
        if (event.type === "single") {
            const startDate = DateTime.fromJSDate(newStart).toISODate();
            if (!startDate) return false;

            const updated: any = { ...event, date: startDate, allDay };

            if (!allDay) {
                updated.startTime = toTimeString(newStart);
                updated.endTime = toTimeString(newEnd);
                // Set endDate from newEnd's DAY: a later day keeps a multi-day
                // timed span (so dragging a multi-day bar within the band
                // preserves it); same day clears it (null, not delete —
                // updateEventWithId merges, so a stale endDate would put end on
                // an earlier day and give a negative duration).
                const endDateStr = DateTime.fromJSDate(newEnd).toISODate();
                updated.endDate =
                    endDateStr && endDateStr > startDate ? endDateStr : null;
            } else {
                const endDate = DateTime.fromJSDate(newEnd)
                    .minus({ days: 1 })
                    .toISODate();
                // A single-day all-day event has no endDate. Only keep a genuine
                // multi-day span (end strictly after start); otherwise null.
                // Without this, a one-day move writes an endDate one day BEFORE
                // date ("fin avant début"), which renders degenerately.
                updated.endDate =
                    endDate && endDate > startDate ? endDate : null;
                // Converting timed → all-day: drop the time fields.
                delete updated.startTime;
                delete updated.endTime;
            }

            await cache.updateEventWithId(eventId, updated);
            return true;
        } else if (event.type === "recurring" || event.type === "rrule") {
            // Moving ONE occurrence must leave the rest of the series alone.
            // deleteEvent() resolves an occurrence id back to its parent, so
            // the old "addEvent + deleteEvent" pair erased the whole series
            // from disk — every other occurrence with it.
            const occurrence = eventId.match(/_(\d{4}-\d{2}-\d{2})$/);
            if (!occurrence) return false;

            const startDate = DateTime.fromJSDate(newStart).toISODate();
            if (!startDate) return false;

            const newEvent: any = {
                title: event.title,
                date: startDate,
                type: "single",
                allDay,
            };

            if (!allDay) {
                newEvent.startTime = toTimeString(newStart);
                newEvent.endTime = toTimeString(newEnd);
            } else {
                const endDate = DateTime.fromJSDate(newEnd)
                    .minus({ days: 1 })
                    .toISODate();
                // Single-day → no endDate; keep only a real multi-day span (see
                // the single-event branch above).
                newEvent.endDate =
                    endDate && endDate > startDate ? endDate : null;
            }

            if (event.description) newEvent.description = event.description;

            const info = cache.getInfoForEditableEvent(eventId);
            const calendarId = info?.calendar.id;
            if (!calendarId) return false;

            // Write the moved copy first: if recording the exception fails
            // afterwards the occurrence shows twice, which beats losing it.
            await cache.addEvent(calendarId, newEvent);
            await cache.processEvent(eventId, (e: any) => ({
                ...e,
                skipDates: [...(e.skipDates || []), occurrence[1]],
            }));
            return true;
        }
        return false;
    } catch {
        return false;
    }
}

/**
 * Commit a resize to the cache. Exported for the same reason as
 * {@link applyEventDrag}: resizing one occurrence must not touch the series.
 */
export async function applyEventResize(
    cache: any,
    eventId: string,
    newStart: Date,
    newEnd: Date
): Promise<boolean> {
    const event = cache.getEventById(eventId);
    if (!event || event.allDay) return false;

    // Both edges are written every time: a bottom-edge resize leaves startTime
    // equal to the original, a top-edge resize leaves endTime equal to the
    // original — so one code path covers both.
    const startTime = toTimeString(newStart);
    const endTime = toTimeString(newEnd);

    if (!startTime || !endTime) return false;

    try {
        if (event.type === "single") {
            await cache.updateEventWithId(eventId, {
                ...event,
                startTime,
                endTime,
            } as any);
            return true;
        } else if (event.type === "recurring" || event.type === "rrule") {
            const occurrence = eventId.match(/_(\d{4}-\d{2}-\d{2})$/);
            if (!occurrence) return false;

            const newEvent: any = {
                title: event.title,
                date: occurrence[1],
                type: "single",
                allDay: false,
                startTime,
                endTime,
            };

            if (event.description) newEvent.description = event.description;

            const info = cache.getInfoForEditableEvent(eventId);
            const calendarId = info?.calendar.id;
            if (!calendarId) return false;

            await cache.addEvent(calendarId, newEvent);
            await cache.processEvent(eventId, (e: any) => ({
                ...e,
                skipDates: [...(e.skipDates || []), occurrence[1]],
            }));
            return true;
        }
        return false;
    } catch {
        return false;
    }
}

export function useEventDragResize(cache: any) {
    const handleEventDrag = useCallback(
        (
            eventId: string,
            newStart: Date,
            newEnd: Date,
            allDayOverride?: boolean
        ) => applyEventDrag(cache, eventId, newStart, newEnd, allDayOverride),
        [cache]
    );

    const handleEventResize = useCallback(
        (eventId: string, newStart: Date, newEnd: Date) =>
            applyEventResize(cache, eventId, newStart, newEnd),
        [cache]
    );

    /** Retire la date et les heures d'un evenement : il retourne dans la liste
        des non planifies. Refuse les series (recurring, rrule) : les convertir
        detruirait toutes leurs occurrences. */
    const handleEventUnschedule = useCallback(
        async (eventId: string) => {
            const event = cache.getEventById(eventId);
            if (!event || !canUnschedule(event)) return false;
            try {
                const payload = buildUnscheduledPayload(event);
                await cache.updateEventWithId(
                    eventId,
                    mergeForSave(event, payload) as any
                );
                return true;
            } catch {
                return false;
            }
        },
        [cache]
    );

    return { handleEventDrag, handleEventResize, handleEventUnschedule };
}
