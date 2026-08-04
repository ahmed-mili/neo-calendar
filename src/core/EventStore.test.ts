import { TFile } from "obsidian";
import { Calendar } from "../calendars/Calendar";
import EventStore from "./EventStore";
import { EventLocation, NeoEvent } from "../types";

/**
 * The in-memory store: events keyed by id, cross-indexed by calendar and by file.
 *
 * Everything is generated from counters rather than drawn at random — a random
 * line number once made this suite flaky, because it occasionally drew 0, which
 * is a perfectly valid line the store must not confuse with "no line".
 */

const counter = (label: string) => {
    let n = 0;
    return () => `${label}${n++}`;
};

const nextCalendarId = counter("calendar");
const nextFileName = counter("file");
const nextTitle = counter("event");
const nextId = counter("id");

const mockCalendar = () => ({ id: nextCalendarId() } as Calendar);
const mockFile = () => ({ path: nextFileName() } as TFile);
const mockEvent = () => ({ title: nextTitle() } as NeoEvent);

let nextLine = 0;
const mockLocation = (onALine = false): EventLocation => ({
    file: mockFile(),
    lineNumber: onALine ? ++nextLine : undefined,
});

/** What the store hands back for an event added at `location`. */
const stored = (
    event: NeoEvent,
    id: string,
    calendar: Calendar,
    location: EventLocation | null
) => ({
    event,
    id,
    calendarId: calendar.id,
    location: location
        ? { path: location.file.path, lineNumber: location.lineNumber }
        : null,
});

const counts = (store: EventStore) => ({
    events: store.eventCount,
    files: store.fileCount,
    calendars: store.calendarCount,
});

// The store must behave identically whether or not its events sit on a line.
describe.each([true, false])("EventStore (inline events: %p)", (inline) => {
    let store: EventStore;
    beforeEach(() => {
        store = new EventStore();
    });

    describe("adding", () => {
        it("indexes an event by calendar and by file", () => {
            const calendar = mockCalendar();
            const location = mockLocation(inline);
            const event = mockEvent();
            const id = nextId();

            store.add({ calendar, location, id, event });

            const expected = [stored(event, id, calendar, location)];
            expect(store.getEventsInCalendar(calendar)).toEqual(expected);
            expect(store.getEventsInFile(location.file)).toEqual(expected);
            expect(store.getEventById(id)).toBe(event);
            expect(counts(store)).toEqual({
                events: 1,
                files: 1,
                calendars: 1,
            });
        });

        it("accepts an event that lives nowhere in the vault", () => {
            const calendar = mockCalendar();
            const event = mockEvent();
            const id = nextId();

            store.add({ calendar, location: null, id, event });

            expect(store.getEventsInCalendar(calendar)).toEqual([
                stored(event, id, calendar, null),
            ]);
            expect(counts(store)).toEqual({
                events: 1,
                files: 0,
                calendars: 1,
            });
        });

        it("refuses to overwrite an id already in the store", () => {
            const calendar = mockCalendar();
            const location = mockLocation(inline);
            const event = mockEvent();
            const id = nextId();

            store.add({ calendar, location, id, event });

            // Not the calendar, the location, nor the event lets an id through twice.
            expect(() =>
                store.add({ calendar, location, id, event })
            ).toThrow();
            expect(() =>
                store.add({
                    calendar: mockCalendar(),
                    location,
                    id,
                    event,
                })
            ).toThrow();
            expect(() =>
                store.add({
                    calendar,
                    location: mockLocation(inline),
                    id,
                    event,
                })
            ).toThrow();
            expect(() =>
                store.add({ calendar, location, id, event: mockEvent() })
            ).toThrow();
        });

        it("frees an id up again once it is deleted", () => {
            const calendar = mockCalendar();
            const location = mockLocation(inline);
            const id = nextId();
            const first = mockEvent();
            const second = mockEvent();

            store.add({ calendar, location, id, event: first });
            store.delete(id);
            store.add({ calendar, location, id, event: second });

            expect(store.getEventById(id)).toBe(second);
            expect(store.eventCount).toBe(1);
        });

        it("keeps several events in one file, in insertion order", () => {
            const calendar = mockCalendar();
            const first = mockLocation(inline);
            const second = { file: first.file, lineNumber: 102 };
            const [e1, e2] = [mockEvent(), mockEvent()];
            const [id1, id2] = [nextId(), nextId()];

            store.add({ calendar, location: first, id: id1, event: e1 });
            store.add({ calendar, location: second, id: id2, event: e2 });

            expect(store.getEventsInFile(first.file)).toEqual([
                stored(e1, id1, calendar, first),
                stored(e2, id2, calendar, second),
            ]);
            expect(counts(store)).toEqual({
                events: 2,
                files: 1,
                calendars: 1,
            });
        });
    });

    describe("querying", () => {
        it("says a calendar or file it has never seen is empty", () => {
            expect(store.getEventsInCalendar(mockCalendar())).toEqual([]);
            expect(store.getEventsInFile(mockFile())).toEqual([]);
            expect(store.getEventById("nope")).toBeNull();
            expect(store.getEventDetails("nope")).toBeNull();
        });

        it("separates events by calendar and by file", () => {
            const [calA, calB] = [mockCalendar(), mockCalendar()];
            const [locA, locB1, locB2] = [
                mockLocation(inline),
                mockLocation(inline),
                mockLocation(inline),
            ];
            const [eA, eB1, eB2] = [mockEvent(), mockEvent(), mockEvent()];
            const [idA, idB1, idB2] = [nextId(), nextId(), nextId()];

            store.add({ calendar: calA, location: locA, id: idA, event: eA });
            store.add({
                calendar: calB,
                location: locB1,
                id: idB1,
                event: eB1,
            });
            store.add({
                calendar: calB,
                location: locB2,
                id: idB2,
                event: eB2,
            });

            expect(counts(store)).toEqual({
                events: 3,
                files: 3,
                calendars: 2,
            });

            expect(store.getEventsInCalendar(calA)).toEqual([
                stored(eA, idA, calA, locA),
            ]);
            expect(store.getEventsInCalendar(calB)).toEqual([
                stored(eB1, idB1, calB, locB1),
                stored(eB2, idB2, calB, locB2),
            ]);
            expect(store.getEventsInFile(locB1.file)).toEqual([
                stored(eB1, idB1, calB, locB1),
            ]);

            expect(Object.fromEntries(store.eventsByCalendar)).toEqual({
                [calA.id]: [stored(eA, idA, calA, locA)],
                [calB.id]: [
                    stored(eB1, idB1, calB, locB1),
                    stored(eB2, idB2, calB, locB2),
                ],
            });

            expect(store.getEventDetails(idA)?.calendarId).toBe(calA.id);
            expect(store.getEventDetails(idB2)?.calendarId).toBe(calB.id);
            expect(store.getEventsInFileAndCalendar(locB1.file, calB)).toEqual([
                stored(eB1, idB1, calB, locB1),
            ]);
            // Right file, wrong calendar.
            expect(store.getEventsInFileAndCalendar(locB1.file, calA)).toEqual(
                []
            );
        });
    });

    describe("deleting", () => {
        it("returns the event it removed, and forgets it everywhere", () => {
            const calendar = mockCalendar();
            const location = mockLocation(inline);
            const event = mockEvent();
            const id = nextId();

            store.add({ calendar, location, id, event });
            expect(store.delete(id)).toBe(event);

            expect(store.getEventsInCalendar(calendar)).toEqual([]);
            expect(store.getEventsInFile(location.file)).toEqual([]);
            expect(counts(store)).toEqual({
                events: 0,
                files: 0,
                calendars: 0,
            });
        });

        it("yields null for an id it never had", () => {
            expect(store.delete("nope")).toBeNull();
        });

        it("drops the counts as its last event goes", () => {
            const [calA, calB] = [mockCalendar(), mockCalendar()];
            const [locA, locB] = [mockLocation(inline), mockLocation(inline)];
            const [idA, idB] = [nextId(), nextId()];

            store.add({
                calendar: calA,
                location: locA,
                id: idA,
                event: mockEvent(),
            });
            store.add({
                calendar: calB,
                location: locB,
                id: idB,
                event: mockEvent(),
            });
            expect(counts(store)).toEqual({
                events: 2,
                files: 2,
                calendars: 2,
            });

            store.delete(idA);
            expect(counts(store)).toEqual({
                events: 1,
                files: 1,
                calendars: 1,
            });

            store.delete(idB);
            expect(counts(store)).toEqual({
                events: 0,
                files: 0,
                calendars: 0,
            });
        });

        it("empties a whole file at once", () => {
            const calendar = mockCalendar();
            const location = mockLocation(inline);
            const [id1, id2] = [nextId(), nextId()];

            store.add({ calendar, location, id: id1, event: mockEvent() });
            store.add({
                calendar,
                location: { file: location.file, lineNumber: 7 },
                id: id2,
                event: mockEvent(),
            });

            expect(store.deleteEventsAtPath(location.file.path)).toEqual(
                new Set([id1, id2])
            );
            expect(counts(store)).toEqual({
                events: 0,
                files: 0,
                calendars: 0,
            });
        });

        it("empties a whole calendar at once, leaving the others alone", () => {
            const [calA, calB] = [mockCalendar(), mockCalendar()];
            const [idA, idB] = [nextId(), nextId()];

            store.add({
                calendar: calA,
                location: mockLocation(inline),
                id: idA,
                event: mockEvent(),
            });
            store.add({
                calendar: calB,
                location: mockLocation(inline),
                id: idB,
                event: mockEvent(),
            });

            expect(store.deleteEventsInCalendar(calA)).toEqual(new Set([idA]));
            expect(store.getEventsInCalendar(calA)).toEqual([]);
            expect(store.getEventById(idB)).not.toBeNull();
            expect(store.eventCount).toBe(1);
        });
    });

    it("clears everything", () => {
        store.add({
            calendar: mockCalendar(),
            location: mockLocation(inline),
            id: nextId(),
            event: mockEvent(),
        });

        store.clear();

        expect(counts(store)).toEqual({ events: 0, files: 0, calendars: 0 });
    });
});

describe("line numbers", () => {
    it("keeps a line number of 0 rather than reading it as 'no line'", () => {
        // Line 0 is a valid position for an inline event. Treating 0 as falsy
        // would file a daily-note event on the first line as a whole-note event.
        const store = new EventStore();
        const calendar = mockCalendar();
        const location = { file: mockFile(), lineNumber: 0 };
        const event = mockEvent();
        const id = nextId();

        store.add({ calendar, location, id, event });

        const expected = stored(event, id, calendar, location);
        expect(store.getEventsInCalendar(calendar)).toEqual([expected]);
        expect(store.getEventsInFile(location.file)).toEqual([expected]);
        expect(store.getEventDetails(id)).toEqual(expected);
    });
});
