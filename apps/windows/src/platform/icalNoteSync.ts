import type { NeoEvent } from "../../../../src/types";
import {
    filenameForEvent,
    serializeEventMarkdown,
    type DesktopStoredEvent,
} from "./desktopEventFormat";
import {
    externalCalendarId,
    type DesktopExternalCalendarSource,
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

export interface IcalDirectoryPlan {
    sources: DesktopExternalCalendarSource[];
    directoriesToCreate: string[];
    changed: boolean;
}

export function hasIcalDirectory(
    source: DesktopIcalCalendarSource
): source is DesktopIcalCalendarSource & { directory: string } {
    return (
        typeof source.directory === "string" && source.directory.trim() !== ""
    );
}

/** Filesystem-safe display name used while migrating an old subscription. */
export function preferredIcalDirectoryName(name: string): string {
    const cleaned = name
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/[. ]+$/, "");
    const safe =
        cleaned && cleaned !== "." && cleaned !== ".." ? cleaned : "iCalendar";
    return /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(safe)
        ? `${safe} Calendar`
        : safe;
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
 * Give every iCalendar subscription one durable folder.
 *
 * Older preferences did not store a directory, so this is also the migration.
 * Existing physical folders are treated as occupied unless the source already
 * owns that exact directory. Two feeds are never allowed to silently share a
 * folder. Missing configured folders are recreated rather than forgetting the
 * association, which is important when a sync tool is still catching up.
 */
export function planIcalDirectoryAssignments(
    sources: readonly DesktopExternalCalendarSource[],
    existingFolderNames: readonly string[]
): IcalDirectoryPlan {
    const physical = new Set(
        existingFolderNames.map((name) => name.toLocaleLowerCase())
    );
    const claimed = new Set<string>();
    const directoriesToCreate: string[] = [];
    let changed = false;

    const nextSources = sources.map((source) => {
        if (source.type !== "ical") return source;

        const configured = hasIcalDirectory(source)
            ? preferredIcalDirectoryName(source.directory)
            : null;
        let directory = configured;

        if (!directory || claimed.has(directory.toLocaleLowerCase())) {
            const unavailable = new Set([...physical, ...claimed]);
            directory = availableIcalDirectoryName(source.name, unavailable);
        }

        const key = directory.toLocaleLowerCase();
        claimed.add(key);
        if (!physical.has(key) && !directoriesToCreate.includes(directory)) {
            directoriesToCreate.push(directory);
        }

        if (source.directory !== directory) changed = true;
        return source.directory === directory
            ? source
            : { ...source, directory };
    });

    return { sources: nextSources, directoriesToCreate, changed };
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
    const calendarId = externalCalendarId(source);
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
