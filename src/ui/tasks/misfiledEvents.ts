import { NeoEvent } from "../../types";

/**
 * Undoing the damage of the `completed: false` bug, without guessing.
 *
 * For a long time every dated entry was saved carrying `completed: false`,
 * which is all it takes for `isTask` to call something a task. Vaults are
 * therefore full of flights, meetings and appointments filed as tasks — and
 * once the task list exists, they all pile into it as overdue.
 *
 * Nothing in the file separates one of those from a task you genuinely never
 * ticked: both are `completed: false`. So instead of guessing, this picks the
 * one shape a task never has.
 *
 * THE CRITERION IS A TIMED SPAN — a start time AND an end time.
 *
 * An event occupies a slot, from 14:05 to 15:30; the end is the moment you are
 * free again. A task has no end, because it does not reserve anything: it has
 * at most a moment to surface at. An entry that claims both ends of a span is
 * describing occupied time, which is an event.
 *
 * Two deliberate exclusions:
 *
 *   - All-day entries are left alone. "Renouveler le permis" on a given day is
 *     exactly what a real dated task looks like, and it is indistinguishable
 *     from an all-day event. Ambiguous means untouched.
 *   - Finished tasks are left alone. `completed: false` carries no information
 *     beyond "this is a task", so dropping it loses nothing; a finish
 *     timestamp is a real record of when you did something, and no bulk
 *     command should be able to erase it.
 */
export function isMisfiledEvent(event: NeoEvent): boolean {
    if (event.type !== "single") return false;
    // Strictly `false`: not a finish timestamp, not the in-progress marker,
    // and not an absent field (already a plain event).
    if ((event as { completed?: unknown }).completed !== false) return false;
    if (event.allDay) return false;
    const timed = event as { startTime?: string; endTime?: string | null };
    return Boolean(timed.startTime) && Boolean(timed.endTime);
}

/**
 * The same entry as a plain event: everything kept, `completed` removed.
 *
 * The key is DELETED rather than set to undefined — `completed` is one of the
 * type-discriminant keys, which the frontmatter writer drops only when the
 * replacement object no longer carries it.
 */
export function asPlainEvent(event: NeoEvent): NeoEvent {
    const copy = { ...(event as Record<string, unknown>) };
    delete copy.completed;
    return copy as NeoEvent;
}

export interface MisfiledCandidate {
    id: string;
    event: NeoEvent;
}

/** Every entry the criterion above would convert, across all calendars. */
export function findMisfiledEvents(
    sources: Array<{
        editable: boolean;
        events: Array<{ id: string; event: NeoEvent }>;
    }>
): MisfiledCandidate[] {
    const out: MisfiledCandidate[] = [];
    for (const source of sources) {
        // A read-only calendar (holidays, a subscribed .ics) cannot be
        // rewritten, so offering to convert its entries would only fail later.
        if (!source.editable) continue;
        for (const { id, event } of source.events) {
            if (isMisfiledEvent(event)) out.push({ id, event });
        }
    }
    return out;
}
