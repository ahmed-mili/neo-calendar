import { useCallback } from "react";
import { DateTime } from "luxon";
import EventCache from "../../core/EventCache";
import { NeoEvent } from "../../types";
import { TYPE_DISCRIMINANT_KEYS } from "../../types/schema";
import { useClipboard } from "./ClipboardContext";

/** An occurrence of a series is addressed as "<parent id>_YYYY-MM-DD". */
const OCCURRENCE_ID = /_\d{4}-\d{2}-\d{2}$/;

/**
 * Copy an event for pasting elsewhere. A series can't be copied as a series —
 * it has no `date` of its own and cloning it would duplicate every occurrence —
 * so it lands as a one-off on the target day.
 */
export function eventToPaste(source: NeoEvent, allDay?: boolean): any {
    const src = source as any;
    const pasted: any = { ...source };
    delete pasted.id;

    if (source.type !== "single") {
        // Drop the previous type's keys before switching type. That shared list
        // exists precisely so the writer and the UI can't drift on which lines
        // belong to which type.
        for (const key of TYPE_DISCRIMINANT_KEYS) {
            delete pasted[key];
        }
        pasted.type = "single";
    }

    pasted.allDay = allDay ?? source.allDay;
    if (!pasted.allDay && src.startTime && src.endTime) {
        pasted.startTime = src.startTime;
        pasted.endTime = src.endTime;
    }
    return pasted;
}

/**
 * Should a cut remove its source event?
 *
 * `deleteEvent()` resolves an occurrence id back to its parent, so cutting a
 * single occurrence of a series would erase the WHOLE series from disk. Only a
 * genuine one-off may be removed.
 */
export function cutMayDeleteSource(
    source: NeoEvent | null,
    sourceEventId: string
): boolean {
    if (!source) return false;
    if (OCCURRENCE_ID.test(sourceEventId)) return false;
    return source.type === "single";
}

export function useClipboardActions(cache: EventCache) {
    const {
        setClipboard,
        clearClipboard,
        hasClipboard,
        event,
        mode,
        sourceEventId,
        sourceCalendarId,
    } = useClipboard();

    const copyEvent = useCallback(
        (eventId: string) => {
            const ev = cache.getEventById(eventId);
            if (!ev) return;
            const details = cache.getEventDetails(eventId);
            setClipboard({
                event: ev,
                mode: "copy",
                sourceEventId: eventId,
                sourceCalendarId: details?.calendarId ?? null,
            });
        },
        [cache, setClipboard]
    );

    const cutEvent = useCallback(
        (eventId: string) => {
            const ev = cache.getEventById(eventId);
            if (!ev) return;
            const details = cache.getEventDetails(eventId);
            setClipboard({
                event: ev,
                mode: "cut",
                sourceEventId: eventId,
                sourceCalendarId: details?.calendarId ?? null,
            });
        },
        [cache, setClipboard]
    );

    const pasteEvent = useCallback(
        async (targetDate: Date, allDay?: boolean) => {
            if (!event || !sourceCalendarId) return;

            const targetDt = DateTime.fromJSDate(targetDate);
            const newEvent = eventToPaste(event, allDay);
            newEvent.date = targetDt.toISODate()!;

            try {
                await cache.addEvent(sourceCalendarId, newEvent as NeoEvent);

                if (mode === "cut" && sourceEventId) {
                    if (
                        cutMayDeleteSource(
                            cache.getEventById(sourceEventId),
                            sourceEventId
                        )
                    ) {
                        await cache.deleteEvent(sourceEventId);
                    }
                    clearClipboard();
                }
            } catch (e) {
                // Swallowing this silently left a failed paste indistinguishable
                // from a successful one.
                console.error("[neo-calendar] Paste failed", e);
            }
        },
        [cache, event, mode, sourceEventId, sourceCalendarId, clearClipboard]
    );

    const duplicateEvent = useCallback(
        async (eventId: string) => {
            const ev = cache.getEventById(eventId);
            if (!ev) return;
            const details = cache.getEventDetails(eventId);
            if (!details?.calendarId) return;
            const newEvent: any = { ...ev };
            delete newEvent.id;
            try {
                await cache.addEvent(details.calendarId, newEvent as NeoEvent);
            } catch (e) {
                console.error("[neo-calendar] Duplicate failed", e);
            }
        },
        [cache]
    );

    const canPaste = hasClipboard;

    return { copyEvent, cutEvent, pasteEvent, duplicateEvent, canPaste };
}
