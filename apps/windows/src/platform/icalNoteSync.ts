import type { NeoEvent } from "../../../../src/types";
import {
    calendarIdFromPath,
    filenameForEvent,
    serializeEventMarkdown,
    type DesktopStoredEvent,
} from "./desktopEventFormat";
import {
    externalCalendarId,
    type DesktopIcalCalendarSource,
} from "./desktopExternalCalendars";

export interface IcalNoteWrite {
    event: NeoEvent;
    calendarId: string;
    calendarPath: string;
    previousRelativePath?: string;
    fileName: string;
    contents: string;
}

/**
 * A feed subscription is backed by one real full-note calendar folder.
 * Sources written before that migration have no directory yet and temporarily
 * keep the old in-memory behaviour until the folder can be created.
 */
export function hasIcalDirectory(
    source: DesktopIcalCalendarSource
): source is DesktopIcalCalendarSource & { directory: string } {
    return typeof source.directory === "string" && source.directory.trim() !== "";
}

/** Filesystem-safe display name used while migrating an old subscription. */
export function preferredIcalDirectoryName(name: string): string {
    const cleaned = name
        .replace(/[\\/]/g, "-")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/[. ]+$/, "");
    return cleaned && cleaned !== "." && cleaned !== ".."
        ? cleaned
        : "iCalendar";
}

/**
 * Pick a direct child folder without ever binding an existing unrelated folder
 * to a remote feed. The first collision gets an explicit “ICS” suffix and later
 * collisions are numbered.
 */
export function availableIcalDirectoryName(
    preferred: string,
    usedNames: ReadonlySet<string>
): string {
    const base = preferredIcalDirectoryName(preferred);
    if (!usedNames.has(base.toLocaleLowerCase())) return base;

    const withKind = `${base} (ICS)`;
    if (!usedNames.has(withKind.toLocaleLowerCase())) return withKind;

    for (let suffix = 2; ; suffix += 1) {
        const candidate = `${base} (ICS ${suffix})`;
        if (!usedNames.has(candidate.toLocaleLowerCase())) return candidate;
    }
}

/**
 * Namespace a feed event before it becomes a note. Calendar event ids are
 * globally addressed in the standalone cache, while independent feeds are free
 * to reuse the same UID.
 */
export function scopedIcalEvent(
    source: DesktopIcalCalendarSource,
    event: NeoEvent,
    index: number
): NeoEvent {
    const rawId =
        typeof event.id === "string" && event.id.trim()
            ? event.id.trim()
            : `event-${index}`;
    const prefix = `${externalCalendarId(source)}::`;
    const id = rawId.startsWith(prefix) ? rawId : `${prefix}${rawId}`;
    return { ...event, id } as NeoEvent;
}

/**
 * Plan an incremental feed -> Markdown sync.
 *
 * Crucially there are no deletions. Many public iCalendar URLs are rolling
 * windows and stop returning older VEVENTs after a while. Removing every note
 * that is absent from the latest response is exactly how last week's events
 * disappeared. Once materialised, a past event is history and stays in the
 * folder; events still present in the feed are updated in place and new ones
 * create new notes.
 */
export function planIcalNoteSync(
    source: DesktopIcalCalendarSource & { directory: string },
    remoteEvents: readonly NeoEvent[],
    existingRecords: readonly DesktopStoredEvent[]
): IcalNoteWrite[] {
    const calendarPath = source.directory;
    const calendarId = calendarIdFromPath(calendarPath);
    const existingById = new Map(
        existingRecords
            .filter((record) => record.calendarPath === calendarPath)
            .map((record) => [record.id, record])
    );

    return remoteEvents.flatMap((remote, index) => {
        const event = scopedIcalEvent(source, remote, index);
        const id = event.id as string;
        const previous = existingById.get(id);
        const contents = serializeEventMarkdown(
            event,
            previous?.contents ?? ""
        );

        // A refresh that learned nothing must not touch the file. Apart from
        // reducing disk churn this avoids waking Syncthing/Drive on every poll.
        if (previous && contents === previous.contents) return [];

        return [
            {
                event,
                calendarId,
                calendarPath,
                previousRelativePath: previous?.relativePath,
                fileName: previous?.fileName ?? filenameForEvent(event),
                contents,
            },
        ];
    });
}
