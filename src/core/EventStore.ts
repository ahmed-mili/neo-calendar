import { EventLocation, NeoEvent } from "../types";

/**
 * Where an event's data physically lives once detached from the Obsidian
 * `TFile` handle: a vault-relative file path plus an optional line number for
 * inline (daily-note) events. A `lineNumber` of `0` is a valid first-line
 * position and is preserved verbatim — never conflated with "no line".
 */
export type EventPathLocation = {
    path: string;
    lineNumber: number | undefined;
};

/** One event as held by the store, with its identity and provenance. */
export type StoredEvent = {
    id: string;
    event: NeoEvent;
    location: EventPathLocation | null;
    calendarId: string;
};

/** Anything carrying a calendar id — the store never needs more. */
type CalendarRef = { id: string };

/** Anything carrying a file path — a `TFile` satisfies this structurally. */
type FileRef = { path: string };

type AddDetails = {
    calendar: CalendarRef;
    location: EventLocation | null;
    id: string;
    event: NeoEvent;
};

const toPathLocation = (
    location: EventLocation | null
): EventPathLocation | null =>
    location === null
        ? null
        : { path: location.file.path, lineNumber: location.lineNumber };

/**
 * In-memory source of truth for every event the plugin knows about — a small
 * indexed database, deliberately free of any Obsidian dependency.
 *
 * Events are keyed by a unique id and cross-indexed by calendar id and by file
 * path, so lookups in any of those directions are direct. Every index is a
 * `Map`/`Set`, so all three preserve insertion order; the retrieval methods
 * lean on that to return events in the order they were added.
 */
export default class EventStore {
    private byId = new Map<string, StoredEvent>();
    private idsByCalendar = new Map<string, Set<string>>();
    private idsByFile = new Map<string, Set<string>>();

    clear(): void {
        this.byId.clear();
        this.idsByCalendar.clear();
        this.idsByFile.clear();
    }

    get eventCount(): number {
        return this.byId.size;
    }

    get fileCount(): number {
        return this.idsByFile.size;
    }

    get calendarCount(): number {
        return this.idsByCalendar.size;
    }

    private static addToIndex(
        index: Map<string, Set<string>>,
        key: string,
        id: string
    ): void {
        const bucket = index.get(key);
        if (bucket) {
            bucket.add(id);
        } else {
            index.set(key, new Set([id]));
        }
    }

    private static removeFromIndex(
        index: Map<string, Set<string>>,
        key: string,
        id: string
    ): void {
        const bucket = index.get(key);
        if (!bucket) return;
        bucket.delete(id);
        // Drop the key entirely once empty so the *Count getters stay accurate.
        if (bucket.size === 0) {
            index.delete(key);
        }
    }

    /**
     * Insert an event. Ids are unique: adding an id that already exists throws,
     * so callers must delete-then-add to replace one.
     * @returns the id that was stored.
     */
    add({ calendar, location, id, event }: AddDetails): string {
        if (this.byId.has(id)) {
            throw new Error(`Event with id "${id}" is already in the store.`);
        }
        const stored: StoredEvent = {
            id,
            event,
            location: toPathLocation(location),
            calendarId: calendar.id,
        };
        this.byId.set(id, stored);
        EventStore.addToIndex(this.idsByCalendar, calendar.id, id);
        if (stored.location) {
            EventStore.addToIndex(this.idsByFile, stored.location.path, id);
        }
        return id;
    }

    /**
     * Remove the event with the given id from every index.
     * @returns the removed event, or `null` if no such id was stored.
     */
    delete(id: string): NeoEvent | null {
        const stored = this.byId.get(id);
        if (!stored) return null;
        this.byId.delete(id);
        EventStore.removeFromIndex(this.idsByCalendar, stored.calendarId, id);
        if (stored.location) {
            EventStore.removeFromIndex(
                this.idsByFile,
                stored.location.path,
                id
            );
        }
        return stored.event;
    }

    getEventById(id: string): NeoEvent | null {
        return this.byId.get(id)?.event ?? null;
    }

    getEventDetails(id: string): StoredEvent | null {
        return this.byId.get(id) ?? null;
    }

    private collect(ids: Set<string> | undefined): StoredEvent[] {
        if (!ids) return [];
        const result: StoredEvent[] = [];
        for (const id of ids) {
            const stored = this.byId.get(id);
            if (stored) result.push(stored);
        }
        return result;
    }

    getEventsInCalendar(calendar: CalendarRef): StoredEvent[] {
        return this.collect(this.idsByCalendar.get(calendar.id));
    }

    getEventsInFile(file: FileRef): StoredEvent[] {
        return this.collect(this.idsByFile.get(file.path));
    }

    getEventsInFileAndCalendar(
        file: FileRef,
        calendar: CalendarRef
    ): StoredEvent[] {
        return this.getEventsInFile(file).filter(
            (stored) => stored.calendarId === calendar.id
        );
    }

    /** All events grouped by calendar id, each group in insertion order. */
    get eventsByCalendar(): Map<string, StoredEvent[]> {
        const grouped = new Map<string, StoredEvent[]>();
        for (const [calendarId, ids] of this.idsByCalendar) {
            grouped.set(calendarId, this.collect(ids));
        }
        return grouped;
    }

    /**
     * Delete every event stored at `path`.
     * @returns the ids that were removed.
     */
    deleteEventsAtPath(path: string): Set<string> {
        // Snapshot first: delete() mutates idsByFile as it goes.
        const removed = new Set(this.idsByFile.get(path) ?? []);
        for (const id of removed) {
            this.delete(id);
        }
        return removed;
    }

    /**
     * Delete every event belonging to `calendar`.
     * @returns the ids that were removed.
     */
    deleteEventsInCalendar(calendar: CalendarRef): Set<string> {
        const removed = new Set(this.idsByCalendar.get(calendar.id) ?? []);
        for (const id of removed) {
            this.delete(id);
        }
        return removed;
    }
}
