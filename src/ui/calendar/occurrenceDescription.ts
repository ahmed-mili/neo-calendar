import { NeoEvent } from "../../types";

/**
 * A description that belongs to one occurrence of a series rather than to the
 * series itself.
 *
 * A series is one note: its `description` is what every occurrence shows, so
 * writing on one Tuesday writes on all of them. That is what the panel's
 * "Synced description" switch turns off — and when it is off, the text has to
 * live somewhere that names the day it belongs to.
 *
 * It lives in `occurrenceDescriptions`, a flat list of `"YYYY-MM-DD text"`
 * lines, the same shape `skipDates` and `completedDates` already use for the
 * other things one occurrence can say on its own. A line for a date is the
 * whole answer: while it exists the occurrence is unsynced, and removing it
 * hands the occurrence back to the series.
 */

/** The ISO day an occurrence's display id ends with, e.g. `note_2026-08-16`. */
export function occurrenceDateOf(displayId: string | null): string | null {
    if (!displayId) return null;
    const match = displayId.match(/_(\d{4}-\d{2}-\d{2})$/);
    return match ? match[1] : null;
}

/** The stored lines, read as day → text. Malformed lines are ignored rather
    than shown: a note edited by hand must not be able to blank a description. */
export function readOccurrenceDescriptions(
    entries: string[] | undefined
): Map<string, string> {
    const result = new Map<string, string>();
    for (const entry of entries || []) {
        const match = entry.match(/^(\d{4}-\d{2}-\d{2})(?:[ \t]([\s\S]*))?$/);
        if (!match) continue;
        result.set(match[1], match[2] ?? "");
    }
    return result;
}

/** Only a series carries these; anything else has one description, full stop. */
function entriesOf(event: NeoEvent | null): string[] | undefined {
    if (!event) return undefined;
    if (event.type !== "recurring" && event.type !== "rrule") return undefined;
    return event.occurrenceDescriptions;
}

/**
 * What this occurrence should show: its own text when it has been unsynced,
 * and `null` when it still follows the series.
 *
 * `null` and `""` are deliberately different. An occurrence whose description
 * was emptied on purpose stays empty; one that never left the series shows
 * whatever the series says today.
 */
export function occurrenceDescription(
    event: NeoEvent | null,
    dateISO: string | null
): string | null {
    if (!dateISO) return null;
    const entries = entriesOf(event);
    if (!entries) return null;
    const found = readOccurrenceDescriptions(entries).get(dateISO);
    return found === undefined ? null : found;
}

/** True while this occurrence's description is the series' own. */
export function isDescriptionSynced(
    event: NeoEvent | null,
    dateISO: string | null
): boolean {
    return occurrenceDescription(event, dateISO) === null;
}

/** Back to lines, in date order so a note read by hand stays readable. */
function writeOccurrenceDescriptions(map: Map<string, string>): string[] {
    return [...map.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, text]) => (text ? `${date} ${text}` : date));
}

/** The list with this day's text set. */
export function setOccurrenceDescription(
    entries: string[] | undefined,
    dateISO: string,
    description: string
): string[] {
    const map = readOccurrenceDescriptions(entries);
    map.set(dateISO, description);
    return writeOccurrenceDescriptions(map);
}

/**
 * The list with this day's text removed — the occurrence rejoins the series.
 *
 * An emptied list comes back as `undefined`, not `[]`: the key is dropped from
 * the note rather than left behind as an empty bracket pair, exactly as
 * `subtasks` is when its last step goes.
 */
export function clearOccurrenceDescription(
    entries: string[] | undefined,
    dateISO: string
): string[] | undefined {
    const map = readOccurrenceDescriptions(entries);
    if (!map.delete(dateISO)) return entries?.length ? entries : undefined;
    if (map.size === 0) return undefined;
    return writeOccurrenceDescriptions(map);
}
