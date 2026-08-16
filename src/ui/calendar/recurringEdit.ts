import { NeoEvent } from "../../types";

/**
 * Editing ONE day of a series.
 *
 * A series is a single note, so every field on it — the title, the times, the
 * description — is read by every occurrence it produces. Editing the panel on a
 * Tuesday and saving therefore rewrites every other Tuesday too, which is right
 * about as often as it is wrong, and the panel had no way of asking which was
 * meant.
 *
 * It asks now, the way a calendar is expected to: this one, or all of them.
 * "All of them" writes the series, as it always did. "This one" takes the day
 * out of the series and writes it as an event of its own — the same detachment
 * dragging or resizing a single occurrence already performs (see
 * useEventDragResize), for the same reason: what differs on one day cannot be
 * stored on the note that describes all of them.
 */

export type RecurringEditScope = "occurrence" | "series";

/** Keys that belong to a series and mean nothing on a single event. */
const SERIES_ONLY = [
    "daysOfWeek",
    "startRecur",
    "endRecur",
    "startDate",
    "rrule",
    "skipDates",
    "completedDates",
] as const;

/** The ISO day an occurrence's display id ends with (`<note>_2026-08-16`). */
export function occurrenceDateOf(displayId: string | null): string | null {
    if (!displayId) return null;
    const match = displayId.match(/_(\d{4}-\d{2}-\d{2})$/);
    return match ? match[1] : null;
}

/** Does this event describe a whole series rather than one dated entry? */
export function isSeriesEvent(event: NeoEvent | null | undefined): boolean {
    return event?.type === "recurring" || event?.type === "rrule";
}

/**
 * Is the panel looking at one day of a series, with a choice to offer?
 *
 * Both halves matter. A series opened from anywhere but the grid has no day to
 * single out, and a single event has nothing to be part of.
 */
export function needsScopeChoice({
    event,
    eventId,
    isDraft,
}: {
    event: NeoEvent | null | undefined;
    eventId: string | null;
    isDraft: boolean;
}): boolean {
    if (isDraft || !isSeriesEvent(event)) return false;
    return occurrenceDateOf(eventId) !== null;
}

/**
 * The standalone event one occurrence becomes when it is edited on its own.
 *
 * Built from the payload the form produced for the SERIES, so everything typed
 * into the panel comes with it, and then stripped of everything that only a
 * series can carry — a `rrule` left on it would make the copy repeat as well,
 * which is the one thing detaching an occurrence must not do.
 *
 * @param done whether this day was already ticked off on the series, so a task
 *             that was finished stays finished once it stands alone.
 */
export function detachedOccurrence({
    payload,
    dateISO,
    done = false,
    now = () => new Date().toISOString(),
}: {
    payload: NeoEvent;
    dateISO: string;
    done?: boolean;
    now?: () => string;
}): NeoEvent {
    const single = { ...(payload as Record<string, unknown>) };
    for (const key of SERIES_ONLY) delete single[key];

    // `completed` says two things at once: whether this is a task at all (the
    // key is present) and, on a single event, when it was finished. A series
    // only ever answers the first, so the second is filled in here.
    const isTask = (payload as Record<string, unknown>).completed !== undefined;

    return {
        ...single,
        type: "single",
        date: dateISO,
        endDate: null,
        ...(isTask ? { completed: done ? now() : false } : {}),
    } as NeoEvent;
}

/**
 * The series with one day taken out of it.
 *
 * The day joins `skipDates`, which is what stops the expansion producing it —
 * without that the detached copy and the occurrence it came from would both be
 * drawn, on the same day, one over the other.
 */
export function seriesWithoutOccurrence(
    series: NeoEvent,
    dateISO: string
): NeoEvent {
    const skipDates = (series as { skipDates?: string[] }).skipDates ?? [];
    if (skipDates.includes(dateISO)) return series;
    return { ...series, skipDates: [...skipDates, dateISO] } as NeoEvent;
}

/** Was this day already ticked off on the series it belongs to? */
export function occurrenceIsDone(
    series: NeoEvent | null | undefined,
    dateISO: string
): boolean {
    const done = (series as { completedDates?: string[] } | null | undefined)
        ?.completedDates;
    return Array.isArray(done) && done.includes(dateISO);
}
