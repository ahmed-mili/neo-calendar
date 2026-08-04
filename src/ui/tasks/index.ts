import { DateTime } from "luxon";
import { NeoEvent } from "src/types";

/**
 * Task-flavoured events.
 *
 * An event becomes a task purely by carrying a `completed` field: `false` (or
 * the in-progress marker) means outstanding, an ISO date means it was finished
 * then. Only the event types that own a `completed` field in the schema can be
 * tasks — a recurring series has nowhere to record "done", but an unscheduled
 * (someday) event does, and the someday panel draws a checkbox for it.
 */

export type TaskStatus = "todo" | "complete";

/** The event types whose schema carries `completed`. */
type EventWithStatus = Extract<NeoEvent, { type: "single" | "someday" }>;

const holdsStatus = (event: NeoEvent): event is EventWithStatus =>
    event.type === "single" || event.type === "someday";

export const isTask = (event: NeoEvent): boolean =>
    holdsStatus(event) &&
    event.completed !== undefined &&
    event.completed !== null;

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
