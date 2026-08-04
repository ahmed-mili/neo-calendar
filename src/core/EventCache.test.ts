import { TFile } from "obsidian";

import { Calendar, EventResponse } from "../calendars/Calendar";
import {
    EditableCalendar,
    EditableEventResponse,
} from "../calendars/EditableCalendar";
import { CalendarInfo, EventLocation, NeoEvent } from "src/types";
import EventCache, {
    CacheEntry,
    CalendarInitializerMap,
    NeoEventSource,
} from "./EventCache";

/**
 * The cache: it owns the store, drives the calendars, and tells the view what
 * changed. Calendars are faked here, so what's under test is the coordination —
 * not any particular source's parsing.
 */

// The cache normalizes every event it is handed; that belongs to the schema's
// own tests, so keep it out of the way here.
jest.mock("../types/schema", () => ({
    validateEvent: (e: any) => e,
}));

const counter = (label: string) => {
    let n = 0;
    return () => `${label}${n++}`;
};

const nextTitle = counter("event");
const nextFileName = counter("file");

const mockEvent = () => ({ title: nextTitle() } as NeoEvent);
const mockFile = () => ({ path: nextFileName() } as TFile);

// Deterministic line numbers: drawing them at random once made this suite flaky.
let nextLine = 0;
const mockLocation = (): EventLocation => ({
    file: mockFile(),
    lineNumber: ++nextLine,
});

const mockEventResponse = (): EditableEventResponse => [
    mockEvent(),
    mockLocation(),
];

const asPathLocation = (location: EventLocation) => ({
    path: location.file.path,
    lineNumber: location.lineNumber,
});

/** A read-only source. */
class TestReadonlyCalendar extends Calendar {
    constructor(color: string, private _id: string, public events: NeoEvent[]) {
        super(color);
    }
    get name() {
        return "test";
    }
    get type(): "FOR_TEST_ONLY" {
        return "FOR_TEST_ONLY";
    }
    get identifier() {
        return this._id;
    }
    async getEvents(): Promise<EventResponse[]> {
        return this.events.map((event) => [event, null]);
    }
}

/** A source that can't be read at all — a renamed folder, an offline server. */
class TestBrokenCalendar extends Calendar {
    constructor(color: string, private _id: string) {
        super(color);
    }
    get name() {
        return "broken";
    }
    get type(): "FOR_TEST_ONLY" {
        return "FOR_TEST_ONLY";
    }
    get identifier() {
        return this._id;
    }
    async getEvents(): Promise<EventResponse[]> {
        throw new Error(`Cannot get folder ${this._id}`);
    }
}

/** A writable source whose vault operations are spies. */
class TestEditableCalendar extends EditableCalendar {
    constructor(
        color: string,
        private _directory: string,
        public events: EditableEventResponse[]
    ) {
        super(color);
    }
    get name() {
        return "test";
    }
    get type(): "FOR_TEST_ONLY" {
        return "FOR_TEST_ONLY";
    }
    get identifier() {
        return this.directory;
    }
    get directory() {
        return this._directory;
    }
    containsPath(): boolean {
        return true;
    }

    getEvents = jest.fn(async () => this.events);
    getEventsInFile = jest.fn();
    createEvent = jest.fn();
    modifyEvent = jest.fn();
    deleteEvent = jest.fn();
    move = jest.fn();
    getNewLocation = jest.fn();
}

/** Only the test source is ever built; the real kinds are stubbed out. */
const initializers = (
    build: (info: CalendarInfo) => Calendar | null
): CalendarInitializerMap => ({
    FOR_TEST_ONLY: build,
    local: () => null,
    dailynote: () => null,
    ical: () => null,
    caldav: () => null,
    holidays: () => null,
    auto: () => null,
});

const calendarId = (id: string) => `FOR_TEST_ONLY::${id}`;

const eventsOf = (source: NeoEventSource): NeoEvent[] =>
    source.events.map(({ event }) => event);

const contentsOf = (cache: EventCache) => ({
    events: cache._storeForTest.eventCount,
    files: cache._storeForTest.fileCount,
    calendars: cache._storeForTest.calendarCount,
});

const assertRejects = (fn: () => Promise<any>, message: RegExp) =>
    expect(fn()).rejects.toThrow(message);

describe("read-only calendars", () => {
    const makeCache = (events: NeoEvent[]) => {
        const cache = new EventCache(
            initializers((info) =>
                info.type === "FOR_TEST_ONLY"
                    ? new TestReadonlyCalendar(
                          info.color,
                          info.id,
                          info.events || []
                      )
                    : null
            )
        );
        cache.reset([
            { type: "FOR_TEST_ONLY", color: "#000000", id: "test", events },
        ]);
        return cache;
    };

    it("is empty until populated", async () => {
        const event = mockEvent();
        const cache = makeCache([event]);

        expect(cache.initialized).toBeFalsy();
        await cache.populate();
        expect(cache.initialized).toBeTruthy();

        const [source] = cache.getAllEvents();
        expect(eventsOf(source)).toEqual([event]);
        expect(source.color).toBe("#000000");
        expect(source.editable).toBe(false);
        expect(cache.getCalendarById(calendarId("test"))?.id).toBe(
            calendarId("test")
        );
    });

    it("keeps every event of a source, in order", async () => {
        const events = [mockEvent(), mockEvent(), mockEvent()];
        const cache = makeCache(events);

        await cache.populate();

        expect(eventsOf(cache.getAllEvents()[0])).toEqual(events);
    });

    it("keeps sources apart", async () => {
        const cache = makeCache([]);
        const first = [mockEvent()];
        const second = [mockEvent(), mockEvent()];
        cache.reset([
            { type: "FOR_TEST_ONLY", id: "cal1", color: "red", events: first },
            {
                type: "FOR_TEST_ONLY",
                id: "cal2",
                color: "blue",
                events: second,
            },
        ]);

        await cache.populate();

        const sources = cache.getAllEvents();
        expect(sources).toHaveLength(2);
        expect(eventsOf(sources[0])).toEqual(first);
        expect(sources[0].color).toBe("red");
        expect(eventsOf(sources[1])).toEqual(second);
        expect(sources[1].color).toBe("blue");
    });

    it("resolves a recurring occurrence's id back to its series", async () => {
        // Each occurrence of a series renders under `<seriesId>_<YYYY-MM-DD>`,
        // but only the series itself is stored.
        const cache = makeCache([mockEvent()]);
        await cache.populate();

        const seriesId = cache.getAllEvents()[0].events[0].id;

        expect(cache.getEventById(`${seriesId}_2026-06-25`)).toBe(
            cache.getEventById(seriesId)
        );
        // A date-suffixed id whose series doesn't exist resolves to nothing.
        expect(cache.getEventById("missing_2026-06-25")).toBeNull();
    });

    it.each([
        [
            "adding",
            (cache: EventCache, _: string) =>
                cache.addEvent(calendarId("test"), mockEvent()),
        ],
        ["deleting", (cache: EventCache, id: string) => cache.deleteEvent(id)],
        [
            "modifying",
            (cache: EventCache, id: string) =>
                cache.updateEventWithId(id, mockEvent()),
        ],
    ])("refuses %s an event", async (_, edit) => {
        const cache = makeCache([mockEvent()]);
        await cache.populate();
        const id = cache.getAllEvents()[0].events[0].id;

        await assertRejects(() => edit(cache, id), /read-only/i);
    });
});

describe("editable calendars", () => {
    const makeCache = (events: EditableEventResponse[]) => {
        const cache = new EventCache(
            initializers((info) =>
                info.type === "FOR_TEST_ONLY"
                    ? new TestEditableCalendar(info.color, info.id, events)
                    : null
            )
        );
        cache.reset([
            { type: "FOR_TEST_ONLY", id: "test", color: "black", events: [] },
        ]);
        return cache;
    };

    const calendarOf = (cache: EventCache) =>
        cache.getCalendarById(calendarId("test")) as TestEditableCalendar;

    it("keeps the calendar instances reset() already built", async () => {
        // Rebuilding them would drop a RemoteCalendar's fetched payload, and
        // it serves no events at all until the next network round-trip.
        const cache = makeCache([mockEventResponse()]);
        const before = calendarOf(cache);

        await cache.populate();

        expect(calendarOf(cache)).toBe(before);
    });

    it("reads its events once, and reports itself as editable", async () => {
        const existing = mockEventResponse();
        const cache = makeCache([existing]);

        await cache.populate();

        const [source] = cache.getAllEvents();
        expect(calendarOf(cache).getEvents).toHaveBeenCalledTimes(1);
        expect(eventsOf(source)).toEqual([existing[0]]);
        expect(source.editable).toBe(true);
    });

    describe("adding", () => {
        it.each([
            ["to an empty calendar", [], 1, 1],
            ["into a file that already holds one", [mockEventResponse()], 1, 2],
            ["into a file of its own", [mockEventResponse()], 2, 2],
        ])("adds an event %s", async (label, existing, files, events) => {
            const cache = makeCache(existing as EditableEventResponse[]);
            await cache.populate();
            const calendar = calendarOf(cache);

            const event = mockEvent();
            const location =
                label === "into a file that already holds one"
                    ? {
                          file: (existing as EditableEventResponse[])[0][1]
                              .file,
                          lineNumber: 102,
                      }
                    : mockLocation();
            calendar.createEvent.mockResolvedValueOnce(location);

            const id = await cache.addEvent(calendarId("test"), event);

            expect(id).toBeTruthy();
            expect(calendar.createEvent).toHaveBeenCalledWith(event);
            expect(contentsOf(cache)).toEqual({ calendars: 1, files, events });
        });
    });

    describe("deleting", () => {
        it("removes the event from the store and the calendar", async () => {
            const existing = mockEventResponse();
            const cache = makeCache([existing]);
            await cache.populate();
            const id = cache.getAllEvents()[0].events[0].id;

            await cache.deleteEvent(id);

            expect(calendarOf(cache).deleteEvent).toHaveBeenCalledWith(
                asPathLocation(existing[1])
            );
            expect(contentsOf(cache)).toEqual({
                calendars: 0,
                files: 0,
                events: 0,
            });
        });

        it("keeps the event when the note couldn't be deleted", async () => {
            // The note is still on disk, so dropping it from the store would
            // hide an event that still exists — and an undo would then write a
            // second copy of it.
            const existing = mockEventResponse();
            const cache = makeCache([existing]);
            await cache.populate();
            const id = cache.getAllEvents()[0].events[0].id;
            calendarOf(cache).deleteEvent.mockRejectedValue(
                new Error("EPERM: file is locked")
            );

            await assertRejects(() => cache.deleteEvent(id), /locked/);

            expect(contentsOf(cache)).toEqual({
                calendars: 1,
                files: 1,
                events: 1,
            });
        });

        it("leaves everything alone for an unknown event", async () => {
            const cache = makeCache([mockEventResponse()]);
            await cache.populate();

            await assertRejects(
                () => cache.deleteEvent("unknown ID"),
                /not present in event store/
            );

            expect(calendarOf(cache).deleteEvent).not.toHaveBeenCalled();
            expect(contentsOf(cache)).toEqual({
                calendars: 1,
                files: 1,
                events: 1,
            });
        });
    });

    describe("modifying", () => {
        const existing = mockEventResponse();
        const elsewhere = mockLocation();

        it.each([
            [
                "when the calendar moves the event to another file",
                () => elsewhere,
                () => [
                    { file: existing[1].file, events: 0 },
                    { file: elsewhere.file, events: 1 },
                ],
            ],
            [
                "when the calendar keeps it in the same file",
                () => ({
                    file: existing[1].file,
                    lineNumber: elsewhere.lineNumber,
                }),
                () => [
                    { file: existing[1].file, events: 1 },
                    { file: elsewhere.file, events: 0 },
                ],
            ],
        ])("keeps the event's id %s", async (_, newLocation, expected) => {
            const cache = makeCache([existing]);
            await cache.populate();
            const calendar = calendarOf(cache);
            const id = cache.getAllEvents()[0].events[0].id;
            const updated = mockEvent();

            calendar.modifyEvent.mockImplementationOnce(
                async (_loc, _event, relocate) => relocate(newLocation())
            );

            await cache.updateEventWithId(id, updated);

            expect(calendar.modifyEvent).toHaveBeenCalledTimes(1);
            const [location, event] = calendar.modifyEvent.mock.calls[0];
            expect([location, event]).toEqual([
                asPathLocation(existing[1]),
                updated,
            ]);

            // Same id, new contents, re-filed wherever the calendar put it.
            expect(cache._storeForTest.getEventById(id)).toEqual(updated);
            expect(contentsOf(cache)).toEqual({
                calendars: 1,
                files: 1,
                events: 1,
            });
            for (const { file, events } of expected()) {
                expect(cache._storeForTest.getEventsInFile(file)).toHaveLength(
                    events
                );
            }
        });

        it("leaves everything alone for an unknown event", async () => {
            const event = mockEventResponse();
            const cache = makeCache([event]);
            await cache.populate();

            await assertRejects(
                () => cache.updateEventWithId("unknown ID", mockEvent()),
                /not present in event store/
            );

            const id = cache.getAllEvents()[0].events[0].id;
            expect(calendarOf(cache).modifyEvent).not.toHaveBeenCalled();
            expect(cache._storeForTest.getEventById(id)).toEqual(event[0]);
        });
    });

    describe("when a file changes on disk", () => {
        const before = mockEventResponse();
        const after = mockEventResponse();

        let cache: EventCache;
        let onUpdate: jest.Mock;

        beforeEach(async () => {
            cache = makeCache([before]);
            await cache.populate();
            onUpdate = jest.fn();
            cache.on("update", onUpdate);
        });

        const reread = async (file: TFile, found: EditableEventResponse[]) => {
            calendarOf(cache).getEventsInFile.mockResolvedValue(found);
            await cache.fileUpdated(file);
        };

        it("picks up an event in a file it hadn't seen", async () => {
            await reread(after[1].file as TFile, [after]);

            expect(contentsOf(cache)).toEqual({
                calendars: 1,
                files: 2,
                events: 2,
            });
            const [{ toRemove, toAdd }] = onUpdate.mock.calls[0];
            expect(toRemove).toHaveLength(0);
            expect(toAdd.map((e: CacheEntry) => e.event)).toEqual([after[0]]);
        });

        it("swaps out an event that changed in place", async () => {
            await reread(before[1].file as TFile, [[after[0], before[1]]]);

            expect(contentsOf(cache)).toEqual({
                calendars: 1,
                files: 1,
                events: 1,
            });
            const [{ toRemove, toAdd }] = onUpdate.mock.calls[0];
            expect(toRemove).toHaveLength(1);
            expect(toAdd.map((e: CacheEntry) => e.event)).toEqual([after[0]]);
        });

        it("says nothing at all when the events are unchanged", async () => {
            // An auto-save that rewrites a note without changing its event must
            // not make the view flicker.
            await reread(before[1].file as TFile, [before]);

            expect(onUpdate).not.toHaveBeenCalled();
            expect(contentsOf(cache)).toEqual({
                calendars: 1,
                files: 1,
                events: 1,
            });
        });
    });

    it("reports the id an occurrence resolved to", async () => {
        // Every occurrence of a series resolves to the same stored event.
        // Callers acting on a set of ids need to see that, or they treat one
        // event as several — and undoing a multi-delete duplicates it.
        const cache = makeCache([mockEventResponse()]);
        await cache.populate();
        const id = cache.getAllEvents()[0].events[0].id;

        const first = cache.getEventDetails(`${id}_2026-07-29`);
        const second = cache.getEventDetails(`${id}_2026-08-05`);

        expect(first?.id).toBe(id);
        expect(second?.id).toBe(id);
    });

    describe("when a file is renamed", () => {
        // Renaming leaves the contents alone, so Obsidian fires no "changed"
        // for it: if the cache only forgets the old path, nothing ever re-reads
        // the note and its events vanish from the calendar.
        it("re-indexes its events at the new path", async () => {
            const before = mockEventResponse();
            const cache = makeCache([before]);
            await cache.populate();

            const moved = mockLocation();
            calendarOf(cache).getEventsInFile.mockResolvedValue([
                [before[0], moved],
            ]);

            await cache.fileRenamed(
                (before[1].file as TFile).path,
                moved.file as TFile
            );

            expect(contentsOf(cache)).toEqual({
                calendars: 1,
                files: 1,
                events: 1,
            });
        });
    });

    describe("when a file lands while the initial load is still running", () => {
        // A file sync (Syncthing, iCloud, Dropbox) writes notes into the vault
        // while Obsidian is starting up, so "changed" fires before populate()
        // has read that calendar. Both writers must not index the same file.
        it("indexes the file once, not twice", async () => {
            const existing = mockEventResponse();
            // populate() re-runs init(), so hand out one stable instance —
            // otherwise the mocks below are set on a calendar that gets thrown away.
            const calendar = new TestEditableCalendar("black", "test", [
                existing,
            ]);
            const cache = new EventCache(
                initializers((info) =>
                    info.type === "FOR_TEST_ONLY" ? calendar : null
                )
            );
            cache.reset([
                {
                    type: "FOR_TEST_ONLY",
                    id: "test",
                    color: "black",
                    events: [],
                },
            ]);

            // Hold the initial read open so the vault event lands mid-populate.
            let release: () => void = () => {};
            const held = new Promise<void>((resolve) => {
                release = resolve;
            });
            calendar.getEvents.mockImplementationOnce(async () => {
                await held;
                return [existing];
            });
            calendar.getEventsInFile.mockResolvedValue([existing]);

            const populating = cache.populate();
            const updating = cache.fileUpdated(existing[1].file as TFile);
            release();
            await Promise.all([populating, updating]);

            expect(contentsOf(cache)).toEqual({
                calendars: 1,
                files: 1,
                events: 1,
            });
        });
    });
});

describe("a source that can't be read", () => {
    it("is skipped, and doesn't take the others down with it", async () => {
        const good = mockEvent();
        const cache = new EventCache(
            initializers((info) => {
                if (info.type !== "FOR_TEST_ONLY") {
                    return null;
                }
                return info.id === "broken"
                    ? new TestBrokenCalendar(info.color, info.id)
                    : new TestReadonlyCalendar(
                          info.color,
                          info.id,
                          info.events || []
                      );
            })
        );
        cache.reset([
            {
                type: "FOR_TEST_ONLY",
                color: "#111111",
                id: "broken",
                events: [],
            },
            {
                type: "FOR_TEST_ONLY",
                color: "#222222",
                id: "good",
                events: [good],
            },
        ]);

        const errors = jest
            .spyOn(console, "error")
            .mockImplementation(() => {});

        await expect(cache.populate()).resolves.toBeUndefined();

        expect(cache.initialized).toBe(true);
        expect(
            cache.getAllEvents().flatMap((source) => eventsOf(source))
        ).toContain(good);
        // The failure is surfaced, not swallowed.
        expect(errors).toHaveBeenCalled();

        errors.mockRestore();
    });
});

describe("unknown calendar source types", () => {
    // A data.json written by a build that knew one more source type than the
    // current code (or hand-edited) must not take the whole plugin down: init()
    // used to call `this.calendarInitializers[info.type](info)` unguarded, so an
    // unknown type threw "is not a function" out of onload and Obsidian
    // disabled the plugin entirely.
    //
    // The type below must be one NO build ever supports. It used to be "auto",
    // which stopped being unknown the day auto calendars landed, and the test
    // silently stopped exercising the guard.
    const UNSUPPORTED_TYPE = "no-such-source-kind";
    const cacheWithUnknownType = () =>
        new EventCache(
            initializers((info) =>
                info.type === "FOR_TEST_ONLY"
                    ? new TestReadonlyCalendar(
                          info.color,
                          info.id,
                          info.events || []
                      )
                    : null
            )
        );

    it("skips a source whose type has no initializer instead of throwing", () => {
        const cache = cacheWithUnknownType();
        const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

        expect(() =>
            cache.reset([
                { type: UNSUPPORTED_TYPE, color: "#4a9d5f", id: "FR" } as any,
            ])
        ).not.toThrow();
        expect(cache.calendars.size).toBe(0);
        // The skip is surfaced, not swallowed.
        expect(warn).toHaveBeenCalled();

        warn.mockRestore();
    });

    it("still builds the known sources listed alongside an unknown one", () => {
        const cache = cacheWithUnknownType();
        const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
        const event = mockEvent();

        cache.reset([
            { type: UNSUPPORTED_TYPE, color: "#4a9d5f", id: "FR" } as any,
            {
                type: "FOR_TEST_ONLY",
                color: "#000000",
                id: "test",
                events: [event],
            },
        ]);

        expect(cache.calendars.size).toBe(1);
        expect(cache.calendars.has(calendarId("test"))).toBe(true);

        warn.mockRestore();
    });
});
