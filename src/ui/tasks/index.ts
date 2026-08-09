import { DateTime } from "luxon";
import { NeoEvent } from "src/types";

/**
 * Task-flavoured events.
 *
 * An event becomes a task purely by carrying a `completed` field: `false` (or
 * the in-progress marker) means outstanding, an ISO date means it was finished
 * then.
 *
 * A recurring series is a task the same way, but it cannot answer "is it done"
 * as a whole — there is one series and many occurrences, and ticking one Tuesday
 * must not tick every other Tuesday. So on a series `completed` says only THAT
 * IT IS A TASK, and which occurrences are finished lives in `completedDates`.
 * Everything that asks about a series therefore has to name a day; see
 * {@link getOccurrenceStatus}.
 */

export type TaskStatus = "todo" | "complete";

/** The event types that record completion on the entry itself. */
type EventWithStatus = Extract<NeoEvent, { type: "single" | "someday" }>;

/** The event types that record completion per occurrence, in a list. */
type SeriesEvent = Extract<NeoEvent, { type: "recurring" | "rrule" }>;

const holdsStatus = (event: NeoEvent): event is EventWithStatus =>
    event.type === "single" || event.type === "someday";

export const isSeries = (event: NeoEvent): event is SeriesEvent =>
    event.type === "recurring" || event.type === "rrule";

export const isTask = (event: NeoEvent): boolean =>
    event.completed !== undefined && event.completed !== null;

export const getTaskStatus = (event: NeoEvent): TaskStatus | null => {
    if (!holdsStatus(event)) {
        return null;
    }
    const { completed } = event;
    if (completed === undefined || completed === null) {
        return null;
    }
    // Anything else is a truthy ISO date: the moment it was finished.
    return completed === false || completed === "in-progress"
        ? "todo"
        : "complete";
};

export const setTaskStatus = (
    event: NeoEvent,
    status: TaskStatus
): NeoEvent => {
    if (!holdsStatus(event)) {
        return event;
    }
    return {
        ...event,
        completed: status === "complete" ? DateTime.now().toISO() : false,
    };
};

/** Flip a task between done and not done. */
export const cycleTaskStatus = (event: NeoEvent): NeoEvent =>
    setTaskStatus(
        event,
        getTaskStatus(event) === "complete" ? "todo" : "complete"
    );

// ── Occurrences of a series ────────────────────────────────

/**
 * Whether ONE occurrence of a task series has been done.
 *
 * `dateStr` is the occurrence's own ISO day. Anything not listed is
 * outstanding, which is the right default: a series that has never been ticked
 * has an empty list, and every occurrence is still to do.
 */
export const getOccurrenceStatus = (
    event: NeoEvent,
    dateStr: string
): TaskStatus | null => {
    if (!isSeries(event) || !isTask(event)) return null;
    return (event.completedDates || []).includes(dateStr) ? "complete" : "todo";
};

/**
 * The series with one occurrence ticked or unticked.
 *
 * Only that day's entry moves; every other occurrence keeps its own state,
 * which is the entire point of storing them in a list. The list is kept sorted
 * so the frontmatter does not churn its ordering on every edit.
 */
export const setOccurrenceStatus = (
    event: NeoEvent,
    dateStr: string,
    status: TaskStatus
): NeoEvent => {
    if (!isSeries(event)) return event;
    const current = new Set(event.completedDates || []);
    if (status === "complete") current.add(dateStr);
    else current.delete(dateStr);
    return { ...event, completedDates: [...current].sort() };
};

/**
 * Split a display id back into the stored event and the day it stands for.
 *
 * Expansion gives every occurrence the id `<seriesId>_<YYYY-MM-DD>`, so the day
 * a checkbox belongs to is recoverable from the id alone — which is what makes
 * ticking a single occurrence possible at all. Returns null for a plain id.
 *
 * A stored id may itself legitimately end in something that looks like a date,
 * so callers must confirm the resolved event really is a series before treating
 * the suffix as an occurrence.
 */
export const parseOccurrenceId = (
    displayId: string
): { storedId: string; date: string } | null => {
    const match = /^(.*)_(\d{4}-\d{2}-\d{2})$/.exec(displayId);
    return match ? { storedId: match[1], date: match[2] } : null;
};
