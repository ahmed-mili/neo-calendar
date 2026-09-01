import { DateTime } from "luxon";
import type { IcsSnapshot } from "../../../../src/calendars/parsing/ics";
import type { NeoEvent } from "../../../../src/types";
import {
    calendarIdFromPath,
    filenameForEvent,
    serializeEventMarkdown,
    type DesktopStoredEvent,
} from "./desktopEventFormat";
import {
    externalCalendarId,
    type DesktopExternalCalendarSource,
    type DesktopIcalCalendarSource,
} from "./desktopExternalCalendars";
import type { IcsFeedSubscription } from "./icsFeedPreferences";
import {
    managedMetadataFromMarkdown,
    serializeManagedEventMarkdown,
    type ManagedEventMetadata,
} from "./managedEventNote";

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

/* ------------------------------------------------------------------------- *
 * Pure ICS reconciliation planner
 *
 * The new "ICS link on a Full Note calendar" feature keeps a note per imported
 * occurrence, but a public ICS URL is a potentially bounded snapshot: an
 * absence is only proof of a deletion inside a zone the feed still covers.
 * `planIcsNoteSync` turns one validated snapshot into the exact set of writes
 * and the narrow set of deletions the conservation rule allows, plus the next
 * per-feed sync state. It performs no IO and never mutates its inputs.
 * ------------------------------------------------------------------------- */

export interface IcsSyncState {
    lastAttemptAt?: string;
    lastSuccessAt?: string;
    lastError?: string;
    knownEventCount: number;
    /** Consecutive valid syncs an occurrence key has been missing from. */
    missingCounts: Record<string, number>;
}

export interface IcsSyncPlan {
    writes: IcalNoteWrite[];
    deletes: DesktopStoredEvent[];
    nextState: IcsSyncState;
}

/**
 * Monday 00:00 of the device-local week, as an ISO date. Monday is the first
 * day of the week; a note whose occurrence date is before this boundary is the
 * archive and can never be deleted by a feed.
 */
export function startOfLocalWeekIso(now: Date): string {
    const iso = DateTime.fromJSDate(now).startOf("week").toISODate();
    if (!iso) {
        // Fail closed: an unusable boundary must never silently disable the
        // archive protection. An empty string would compare as smaller than
        // every real date, so `occurrenceDate < monday` would never be true —
        // nothing would look archived, and every note would become deletable.
        throw new Error(
            "Cannot compute the current week's Monday from an invalid Date."
        );
    }
    return iso;
}

const occurrenceKeyOf = (
    uid: string,
    recurrenceId: string | null
): string => (recurrenceId === null ? uid : `${uid}::${recurrenceId}`);

/**
 * A single-occurrence event's identity independent of its UID: title, date,
 * and time slot. Matching by UID alone assumes a feed hands out a stable one
 * per occurrence — true for most, but at least one Efrei event reissues a
 * fresh random UID on every fetch, so pure-UID matching saw a "new"
 * occurrence every sync and never stopped creating notes for it. This is the
 * fallback that catches that: two occurrences with the same title on the
 * same day at the same time are the same occurrence, whatever their UID says
 * this time.
 */
function occurrenceSignature(event: NeoEvent): string | null {
    if (event.type !== "single") return null;
    const when = event.allDay
        ? "allday"
        : `${event.startTime ?? ""}-${event.endTime ?? ""}`;
    return `${event.title}::${event.date}::${when}`;
}

export function planIcsNoteSync(args: {
    feed: IcsFeedSubscription;
    snapshot: IcsSnapshot;
    existingRecords: readonly DesktopStoredEvent[];
    previousState: IcsSyncState;
    now: Date;
}): IcsSyncPlan {
    const { feed, snapshot, existingRecords, previousState, now } = args;

    const snapshotIsEmpty =
        snapshot.events.length === 0 && snapshot.cancelledKeys.size === 0;
    if (snapshotIsEmpty && previousState.knownEventCount > 0) {
        throw new Error(
            "The ICS snapshot is unexpectedly empty: a previously populated " +
                "feed returned no occurrence and no cancellation."
        );
    }

    const nowIso = now.toISOString();
    const monday = startOfLocalWeekIso(now);
    // Notes still live under the calendar's own identity (a link's folder is
    // organisation, not a separate calendar) — only WHERE the file physically
    // sits moves to the link's own folder once one has been provisioned.
    const calendarId = calendarIdFromPath(feed.calendarPath);
    const writeDirectory = feed.directory ?? feed.calendarPath;
    const present = new Map(
        snapshot.events.map((occurrence) => [occurrence.key, occurrence])
    );

    // Existing notes this feed owns, keyed by their logical occurrence key —
    // and, as a fallback for a feed that doesn't keep a UID stable, by their
    // content signature too.
    const owned = new Map<string, DesktopStoredEvent>();
    const ownedBySignature = new Map<string, DesktopStoredEvent>();
    for (const record of existingRecords) {
        const metadata = managedMetadataFromMarkdown(record.contents);
        if (
            !metadata ||
            metadata.neoManagedBy !== "neo-calendar:ics" ||
            metadata.neoIcsFeedId !== feed.id
        ) {
            continue;
        }
        owned.set(
            occurrenceKeyOf(
                metadata.neoIcsUid,
                metadata.neoIcsRecurrenceId
            ),
            record
        );
        const signature = occurrenceSignature(record.event);
        if (signature) ownedBySignature.set(signature, record);
    }

    const writes: IcalNoteWrite[] = [];
    for (const occurrence of snapshot.events) {
        const metadata: ManagedEventMetadata = {
            neoManagedBy: "neo-calendar:ics",
            neoManagedVersion: 1,
            neoIcsFeedId: feed.id,
            neoIcsUid: occurrence.uid,
            neoIcsRecurrenceId: occurrence.recurrenceId,
            neoIcsStatus: "confirmed",
        };
        const previous =
            owned.get(occurrence.key) ??
            ownedBySignature.get(occurrenceSignature(occurrence.event) ?? "");
        const event = {
            ...occurrence.event,
            id: `neo-calendar:ics::${feed.id}::${occurrence.key}`,
        } as NeoEvent;
        const contents = serializeManagedEventMarkdown(
            event,
            metadata,
            previous?.contents ?? ""
        );
        // A note the link already owns still needs a write when nothing but
        // its folder is out of date — moving it into a newly provisioned
        // `directory` is exactly that case, and content-only equality would
        // otherwise leave it stranded in the calendar's root forever.
        const misplaced =
            !!previous &&
            !previous.relativePath.startsWith(`${writeDirectory}/`);
        if (previous && !misplaced && contents === previous.contents) {
            continue;
        }
        writes.push({
            event,
            calendarId,
            calendarPath: writeDirectory,
            previousRelativePath: previous?.relativePath,
            fileName: previous?.fileName ?? filenameForEvent(event),
            contents,
        });
    }

    const deletes: DesktopStoredEvent[] = [];
    const missingCounts: Record<string, number> = {};
    for (const [key, record] of owned) {
        if (present.has(key)) continue; // reappeared: counter resets to zero.

        const occurrenceDate =
            record.event.type === "single" ? record.event.date : "";
        // The archive is untouchable: never delete it, never keep counting it.
        if (occurrenceDate < monday) continue;

        const cancelled = snapshot.cancelledKeys.has(key);
        const misses = cancelled
            ? 0
            : (previousState.missingCounts[key] ?? 0) + 1;
        if (misses > 0) missingCounts[key] = misses;

        const coverageProven =
            snapshot.latestOccurrenceDate !== null &&
            snapshot.latestOccurrenceDate > occurrenceDate;
        if (cancelled || (misses >= 2 && coverageProven)) {
            deletes.push(record);
            delete missingCounts[key];
        }
    }

    return {
        writes,
        deletes,
        nextState: {
            lastAttemptAt: nowIso,
            lastSuccessAt: nowIso,
            knownEventCount: snapshot.events.length,
            missingCounts,
        },
    };
}
