import { Notice, TFile } from "obsidian";
import equal from "deep-equal";

import { Calendar } from "../calendars/Calendar";
import { EditableCalendar } from "../calendars/EditableCalendar";
import EventStore, { StoredEvent } from "./EventStore";
import { CalendarInfo, NeoEvent, validateEvent } from "../types";
import RemoteCalendar from "../calendars/RemoteCalendar";
import FullNoteCalendar from "../calendars/FullNoteCalendar";

/** How to build a `Calendar` from each kind of configured source. */
export type CalendarInitializerMap = Record<
    CalendarInfo["type"],
    (info: CalendarInfo) => Calendar | null
>;

/** One event as handed to the view. */
export type CacheEntry = { event: NeoEvent; id: string; calendarId: string };

export type UpdateViewCallback = (
    info:
        | { type: "events"; toRemove: string[]; toAdd: CacheEntry[] }
        | { type: "calendar"; calendar: NeoEventSource }
        | { type: "resync" }
) => void;

export type CachedEvent = Pick<StoredEvent, "event" | "id">;

/** Everything the view needs to render one calendar. */
export type NeoEventSource = {
    events: CachedEvent[];
    editable: boolean;
    color: string;
    id: string;
};

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const MILLISECONDS_BETWEEN_REVALIDATIONS = 5 * MINUTE;

/**
 * Whether a file's events actually changed, ignoring the order they were read
 * in. Both sides are normalized first, so a note whose frontmatter merely got
 * rewritten with explicit defaults doesn't read as a change.
 */
export const eventsAreDifferent = (
    oldEvents: NeoEvent[],
    newEvents: NeoEvent[]
): boolean => {
    const byTitle = (a: NeoEvent, b: NeoEvent) =>
        a.title.localeCompare(b.title);
    const normalize = (events: NeoEvent[]) =>
        [...events].sort(byTitle).flatMap((e) => validateEvent(e) || []);

    const before = normalize(oldEvents);
    const after = normalize(newEvents);

    if (before.length !== after.length) {
        return true;
    }
    return before.some((event, i) => !equal(event, after[i]));
};

/**
 * The plugin's single source of truth for events, and the only component that
 * orchestrates I/O.
 *
 * It sits between the sources an event can come from (the vault, a remote feed)
 * and the view. `Calendar` subclasses know how to read and write their own
 * format; the cache decides *when* to ask them, keeps the resulting events in
 * an in-memory store, and pushes changes out to whoever is subscribed.
 *
 * Updates arrive from two directions: the vault (a file changed on disk) and the
 * view (the user edited an event). Remote sources are stale-while-revalidate —
 * always served from the last snapshot, refreshed in the background.
 */
export default class EventCache {
    private calendarInfos: CalendarInfo[] = [];
    private calendarInitializers: CalendarInitializerMap;

    private store = new EventStore();
    calendars = new Map<string, Calendar>();

    private updateViewCallbacks: UpdateViewCallback[] = [];

    /** Local events have no id of their own, so the cache mints one. */
    private pkCounter = 0;

    private revalidating = false;
    lastRevalidation: number = 0;

    initialized = false;

    /**
     * The full rebuild currently in flight, if any.
     *
     * `populate()` reads every calendar from disk, awaiting I/O as it goes, so
     * the event loop stays free while the store is only half-built. Any other
     * writer that mutates the store during that window works off a view of the
     * vault that is not there yet: a file sync (Syncthing, iCloud) dropping
     * notes in during startup makes Obsidian fire "changed" for a file
     * `populate()` hasn't reached, `fileUpdated()` finds nothing indexed for it,
     * and both writers then insert the same event under two different generated
     * ids. Holding the promise here lets every other writer wait the rebuild
     * out, so the store is never mutated from two directions at once.
     */
    private populating: Promise<void> | null = null;

    constructor(calendarInitializers: CalendarInitializerMap) {
        this.calendarInitializers = calendarInitializers;
    }

    generateId(): string {
        return `${this.pkCounter++}`;
    }

    /** Drop everything and rebuild the calendars from a new set of sources. */
    reset(infos: CalendarInfo[]): void {
        this.lastRevalidation = 0;
        this.initialized = false;
        this.calendarInfos = infos;
        this.pkCounter = 0;
        this.calendars.clear();
        this.store.clear();
        this.resync();
        this.init();
    }

    /** Instantiate a `Calendar` for every source we know how to build. */
    init() {
        this.calendars.clear();
        for (const info of this.calendarInfos) {
            const initializer = this.calendarInitializers[info.type];
            // A settings file can name a source type this build has no
            // initializer for: written by a build that knew one more type,
            // hand-edited, or imported. Skipping it keeps the other calendars
            // working; calling undefined here threw out of the plugin's onload
            // and had Obsidian disable the whole plugin.
            if (!initializer) {
                console.warn(
                    `[neo-calendar] calendar source skipped, unknown type: ${info.type}`
                );
                continue;
            }
            const calendar = initializer(info);
            if (calendar) {
                this.calendars.set(calendar.id, calendar);
            }
        }
    }

    /**
     * Load every calendar's events into the store.
     *
     * Concurrent calls share one rebuild: both views call this on open, and
     * whichever arrives second would otherwise index the whole vault a second
     * time while the first is still running.
     */
    populate(): Promise<void> {
        if (this.populating) {
            return this.populating;
        }
        this.populating = this.rebuild().finally(() => {
            this.populating = null;
        });
        return this.populating;
    }

    /** Resolves once no full rebuild is in flight. */
    private async settled(): Promise<void> {
        while (this.populating) {
            await this.populating;
        }
    }

    private async rebuild(): Promise<void> {
        // Only build the calendars when there are none. `reset()` — the only
        // thing that sets the sources — has already instantiated them, and
        // rebuilding them here would throw away live instances: a
        // `RemoteCalendar` keeps its last fetched payload in memory, so a fresh
        // one serves no events at all until the next network round-trip.
        if (this.calendars.size === 0) {
            this.init();
        }
        // A rebuild replaces the store's contents rather than adding to them,
        // so repeating one can't leave a second copy of anything behind.
        this.store.clear();
        for (const calendar of this.calendars.values()) {
            try {
                const events = await calendar.getEvents();
                for (const [event, location] of events) {
                    this.store.add({
                        calendar,
                        location,
                        id: event.id || this.generateId(),
                        event,
                    });
                }
            } catch (e) {
                // One broken source (a renamed folder, an unreachable server)
                // must not take the whole calendar down with it.
                console.error(
                    `[neo-calendar] Failed to load events from calendar "${calendar.id}". Skipping this source.`,
                    e
                );
            }
        }
        this.initialized = true;
        this.revalidateRemoteCalendars();
    }

    ///
    // Reads
    ///

    /**
     * Reorder the in-memory calendars to match `orderedIds`. `getAllEvents`
     * iterates the calendars Map in insertion order, so rebuilding the Map in a
     * new order is all that's needed to reorder the sidebar/view — no re-parse or
     * refetch. Ids not present are ignored; any calendar missing from the list is
     * kept (appended) so a stale/partial list can never drop a calendar.
     */
    reorderCalendars(orderedIds: string[]): void {
        const next = new Map<string, Calendar>();
        for (const id of orderedIds) {
            const cal = this.calendars.get(id);
            if (cal) next.set(id, cal);
        }
        for (const [id, cal] of this.calendars) {
            if (!next.has(id)) next.set(id, cal);
        }
        this.calendars = next;
    }

    /** Every event, grouped by the calendar it belongs to. */
    getAllEvents(): NeoEventSource[] {
        const eventsByCalendar = this.store.eventsByCalendar;
        return [...this.calendars.entries()].map(([id, calendar]) => ({
            id,
            color: calendar.color,
            editable: calendar instanceof EditableCalendar,
            // Location data stops here: the view has no business knowing where
            // an event lives on disk.
            events: (eventsByCalendar.get(id) || []).map(({ event, id }) => ({
                event,
                id,
            })),
        }));
    }

    /**
     * Map a display id back to the id the event is actually stored under.
     *
     * A recurring event renders one occurrence per date, and each occurrence
     * carries the id `<seriesId>_<YYYY-MM-DD>`; only the series itself is stored.
     * An exact match always wins, so a stored id that happens to end in a date is
     * never mis-stripped, and an unknown id is handed back untouched so "not
     * found" errors quote what the caller actually passed.
     */
    private resolveStoredId(id: string): string {
        if (this.store.getEventById(id)) {
            return id;
        }
        const series = id.match(/^(.+)_\d{4}-\d{2}-\d{2}$/);
        return series && this.store.getEventById(series[1]) ? series[1] : id;
    }

    getEventById(id: string): NeoEvent | null {
        return this.store.getEventById(this.resolveStoredId(id));
    }

    /**
     * @returns the event addressed by `id`, along with the id it actually
     * resolved to. Several occurrence ids of one series resolve to the same
     * stored id, so callers acting on a set of ids need that to avoid treating
     * one event as several.
     */
    getEventDetails(
        id: string
    ): { id: string; calendarId: string; event: NeoEvent } | null {
        const storedId = this.resolveStoredId(id);
        const details = this.store.getEventDetails(storedId);
        if (!details) {
            return null;
        }
        return {
            id: storedId,
            calendarId: details.calendarId,
            event: details.event,
        };
    }

    getCalendarById(id: string): Calendar | undefined {
        return this.calendars.get(id);
    }

    isEventEditable(id: string): boolean {
        const details = this.store.getEventDetails(this.resolveStoredId(id));
        if (!details) {
            return false;
        }
        return (
            this.getCalendarById(details.calendarId) instanceof EditableCalendar
        );
    }

    /**
     * The calendar and on-disk location of an event that can actually be edited.
     * @throws if the event is unknown, read-only, or has no place in the vault.
     */
    getInfoForEditableEvent(eventId: string) {
        const id = this.resolveStoredId(eventId);
        const details = this.store.getEventDetails(id);
        if (!details) {
            throw new Error(`Event ID ${id} not present in event store.`);
        }
        const { calendarId, location } = details;

        const calendar = this.calendars.get(calendarId);
        if (!calendar) {
            throw new Error(`Calendar ID ${calendarId} is not registered.`);
        }
        if (!(calendar instanceof EditableCalendar)) {
            throw new Error(`Read-only events cannot be modified.`);
        }
        if (!location) {
            throw new Error(
                `Event with ID ${id} does not have a location in the Vault.`
            );
        }
        return { calendar, location };
    }

    ///
    // View subscriptions
    ///

    on(eventType: "update", callback: UpdateViewCallback) {
        if (eventType === "update") {
            this.updateViewCallbacks.push(callback);
        }
        return callback;
    }

    off(eventType: "update", callback: UpdateViewCallback) {
        if (eventType !== "update") {
            return;
        }
        const i = this.updateViewCallbacks.indexOf(callback);
        if (i !== -1) {
            this.updateViewCallbacks.splice(i, 1);
        }
    }

    /** Tell subscribers to rebuild from scratch. */
    resync(): void {
        for (const callback of this.updateViewCallbacks) {
            callback({ type: "resync" });
        }
    }

    private updateViews(toRemove: string[], toAdd: CacheEntry[]) {
        for (const callback of this.updateViewCallbacks) {
            callback({ type: "events", toRemove, toAdd });
        }
    }

    private updateCalendar(calendar: NeoEventSource) {
        for (const callback of this.updateViewCallbacks) {
            callback({ type: "calendar", calendar });
        }
    }

    ///
    // Writes, driven by the view
    ///

    /** @returns the id the new event was stored under. */
    async addEvent(calendarId: string, event: NeoEvent): Promise<string> {
        const calendar = this.calendars.get(calendarId);
        if (!calendar) {
            throw new Error(`Calendar ID ${calendarId} is not registered.`);
        }
        if (!(calendar instanceof EditableCalendar)) {
            console.error(
                `Event cannot be added to non-editable calendar of type ${calendar.type}`
            );
            throw new Error(`Cannot add event to a read-only calendar`);
        }

        const location = await calendar.createEvent(event);
        const id = this.store.add({
            calendar,
            location,
            id: event.id || this.generateId(),
            event,
        });

        this.updateViews([], [{ event, id, calendarId: calendar.id }]);
        return id;
    }

    async deleteEvent(eventId: string): Promise<void> {
        const id = this.resolveStoredId(eventId);
        const { calendar, location } = this.getInfoForEditableEvent(id);

        // Write to disk first, exactly like addEvent: if the note can't be
        // deleted (locked by a file sync, permissions), the event has to stay
        // in the store. Dropping it first would hide an event whose note is
        // still there, and an undo would then write a second copy of it.
        await calendar.deleteEvent(location);
        this.store.delete(id);
        this.updateViews([id], []);
    }

    async updateEventWithId(
        eventId: string,
        newEvent: NeoEvent
    ): Promise<boolean> {
        const id = this.resolveStoredId(eventId);
        const { calendar, location } = this.getInfoForEditableEvent(id);

        await calendar.modifyEvent(
            { path: location.path, lineNumber: location.lineNumber },
            newEvent,
            // The calendar decides where the event ends up (editing a title or a
            // date can rename its note), and tells us before it touches disk.
            (newLocation) => {
                this.store.delete(id);
                this.store.add({
                    calendar,
                    location: newLocation,
                    id,
                    event: newEvent,
                });
            }
        );

        this.updateViews(
            [id],
            [{ id, calendarId: calendar.id, event: newEvent }]
        );
        return true;
    }

    /**
     * Transform an event already in the store — a type-safe wrapper around
     * {@link updateEventWithId} for when only a few known fields change.
     */
    processEvent(
        id: string,
        process: (e: NeoEvent) => NeoEvent
    ): Promise<boolean> {
        const storedId = this.resolveStoredId(id);
        const event = this.store.getEventById(storedId);
        if (!event) {
            throw new Error("Event does not exist");
        }
        return this.updateEventWithId(storedId, process(event));
    }

    async moveEventToCalendar(
        eventId: string,
        newCalendarId: string
    ): Promise<void> {
        const id = this.resolveStoredId(eventId);
        const event = this.store.getEventById(id);
        const details = this.store.getEventDetails(id);
        if (!details || !event) {
            throw new Error(
                `Tried moving unknown event ID ${id} to calendar ${newCalendarId}`
            );
        }

        const oldCalendar = this.calendars.get(details.calendarId);
        if (!oldCalendar) {
            throw new Error(
                `Source calendar ${details.calendarId} did not exist.`
            );
        }
        const newCalendar = this.calendars.get(newCalendarId);
        if (!newCalendar) {
            throw new Error(`Source calendar ${newCalendarId} does not exist.`);
        }

        // TODO: support moving between every kind of editable calendar. Today a
        // move is just a file rename, which only makes sense note-to-note.
        const location = details.location;
        if (
            !(
                oldCalendar instanceof FullNoteCalendar &&
                newCalendar instanceof FullNoteCalendar &&
                location
            )
        ) {
            throw new Error(
                `Both calendars must be Full Note Calendars to move events between them.`
            );
        }

        await oldCalendar.move(location, newCalendar, (newLocation) => {
            this.store.delete(id);
            this.store.add({
                calendar: newCalendar,
                location: newLocation,
                id,
                event,
            });
        });
    }

    ///
    // Filesystem hooks
    ///

    /**
     * A file moved. Forget it at its old path and read it back at the new one.
     *
     * A rename leaves the note's contents untouched, so Obsidian fires no
     * "changed" for it and nothing else would ever re-read the file: dropping
     * the old path alone makes the events disappear from the calendar until
     * the next full reload, even though the note is still on disk. Re-reading
     * also covers a note moved *into* a calendar folder, which then shows up
     * without waiting for an edit.
     */
    async fileRenamed(oldPath: string, file: TFile): Promise<void> {
        await this.deleteEventsAtPath(oldPath);
        await this.fileUpdated(file);
    }

    /** A file is gone: drop everything that lived in it. */
    async deleteEventsAtPath(path: string): Promise<void> {
        // A rebuild in flight would re-read this path from disk and re-add it.
        await this.settled();
        this.updateViews([...this.store.deleteEventsAtPath(path)], []);
    }

    /**
     * A file was created or written. Re-read it through every calendar that owns
     * its path, and reconcile the store with what's now on disk.
     */
    async fileUpdated(file: TFile): Promise<void> {
        // Reconciling against a half-built store would treat an event the
        // rebuild hasn't reached yet as new, and index it a second time.
        await this.settled();

        const calendars = [...this.calendars.values()].flatMap((calendar) =>
            calendar instanceof EditableCalendar &&
            calendar.containsPath(file.path)
                ? calendar
                : []
        );
        if (calendars.length === 0) {
            return;
        }

        const idsToRemove: string[] = [];
        const eventsToAdd: CacheEntry[] = [];

        for (const calendar of calendars) {
            const oldEvents = this.store.getEventsInFileAndCalendar(
                file,
                calendar
            );
            const newEvents = await calendar.getEventsInFile(file);

            const changed = eventsAreDifferent(
                oldEvents.map(({ event }) => event),
                newEvents.map(([event]) => event)
            );
            // Nothing to do for this calendar — but others may still own the file.
            if (!changed) {
                continue;
            }

            const rewritten = newEvents.map(([event, location]) => {
                // Reuse the previous id for whatever sat on the same line, so an
                // open event panel keeps pointing at its event across a rewrite.
                const previous = oldEvents.find(
                    (stored: StoredEvent) =>
                        stored.location &&
                        stored.location.lineNumber === location.lineNumber
                );
                return {
                    event,
                    id: previous?.id || event.id || this.generateId(),
                    location,
                    calendarId: calendar.id,
                };
            });

            for (const stored of oldEvents) {
                this.store.delete(stored.id);
            }
            for (const { event, id, location } of rewritten) {
                this.store.add({ calendar, location, id, event });
            }

            idsToRemove.push(...oldEvents.map((stored) => stored.id));
            eventsToAdd.push(...rewritten);
        }

        // Stay quiet when the write didn't actually change any event — otherwise
        // every auto-save would make the view flicker.
        if (idsToRemove.length === 0 && eventsToAdd.length === 0) {
            return;
        }
        this.updateViews(idsToRemove, eventsToAdd);
    }

    ///
    // Remote sources
    ///

    /**
     * Refresh remote calendars in the background. Never blocks: each calendar
     * updates the store and its subscribers as soon as its own fetch lands.
     */
    revalidateRemoteCalendars(force = false) {
        if (this.revalidating) {
            return;
        }
        if (
            !force &&
            Date.now() - this.lastRevalidation <
                MILLISECONDS_BETWEEN_REVALIDATIONS
        ) {
            return;
        }

        const remotes = [...this.calendars.values()].flatMap((calendar) =>
            calendar instanceof RemoteCalendar ? calendar : []
        );

        this.revalidating = true;
        const fetches = remotes.map((calendar) =>
            calendar
                .revalidate()
                .then(() => calendar.getEvents())
                .then((events) => {
                    this.store.deleteEventsInCalendar(calendar);

                    const fetched = events.map(([event, location]) => ({
                        event,
                        id: event.id || this.generateId(),
                        location,
                        calendarId: calendar.id,
                    }));
                    for (const { event, id, location } of fetched) {
                        this.store.add({ calendar, location, id, event });
                    }

                    this.updateCalendar({
                        id: calendar.id,
                        editable: false,
                        color: calendar.color,
                        events: fetched,
                    });
                })
        );

        Promise.allSettled(fetches).then((results) => {
            this.revalidating = false;
            this.lastRevalidation = Date.now();

            const errors = results.flatMap((result) =>
                result.status === "rejected" ? result.reason : []
            );
            if (errors.length > 0) {
                new Notice(
                    "A remote calendar failed to load. Check the console for more details."
                );
                errors.forEach((reason) =>
                    console.error(`Revalidation failed with reason: ${reason}`)
                );
            }
        });
    }

    get _storeForTest() {
        return this.store;
    }
}
