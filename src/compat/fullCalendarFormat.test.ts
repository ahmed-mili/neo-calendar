/**
 * COMPATIBILITY CONTRACT — golden tests.
 *
 * These tests pin the exact on-disk event format that Obsidian Full Calendar
 * writes, so a vault migrated to Neo Calendar keeps every event intact. They
 * are the oracle for the clean-room rewrite of the model layer (see
 * docs/event-format-spec.md): today they pass against the current code; when a
 * module is deleted and rewritten, these go RED and the new code must make them
 * GREEN again — without changing a single expected value here.
 *
 * Assertions use explicit hand-written expected values (not auto-snapshots) so
 * they describe the CONTRACT, not whatever the implementation happens to emit.
 */
import { NeoEvent, parseEvent, serializeEvent } from "../types/schema";
import { modifyFrontmatterString } from "../calendars/FullNoteCalendar";
import { makeListItem } from "../calendars/dailyNoteSerialization";
import { getInlineEventFromLine } from "../calendars/dailyNoteParsing";

describe("compat: object → NeoEvent (parse)", () => {
    it("single all-day (minimal)", () => {
        expect(
            parseEvent({ title: "T", date: "2022-01-01", allDay: true })
        ).toEqual({
            title: "T",
            allDay: true,
            type: "single",
            date: "2022-01-01",
            endDate: null,
        });
    });

    it("single timed, both times", () => {
        expect(
            parseEvent({
                title: "T",
                date: "2022-01-01",
                startTime: "11:00",
                endTime: "12:00",
            })
        ).toEqual({
            title: "T",
            allDay: false,
            startTime: "11:00",
            endTime: "12:00",
            type: "single",
            date: "2022-01-01",
            endDate: null,
        });
    });

    it("single timed, missing endTime defaults to null", () => {
        expect(
            parseEvent({
                title: "T",
                date: "2022-01-01",
                startTime: "09:30",
            })
        ).toEqual({
            title: "T",
            allDay: false,
            startTime: "09:30",
            endTime: null,
            type: "single",
            date: "2022-01-01",
            endDate: null,
        });
    });

    it("single with endDate and a completed date", () => {
        expect(
            parseEvent({
                title: "T",
                date: "2022-01-01",
                endDate: "2022-01-03",
                allDay: true,
                completed: "2022-01-02T10:00:00",
            })
        ).toEqual({
            title: "T",
            allDay: true,
            type: "single",
            date: "2022-01-01",
            endDate: "2022-01-03",
            completed: "2022-01-02T10:00:00",
        });
    });

    it("completed can be false or in-progress", () => {
        expect(
            parseEvent({
                title: "T",
                date: "d",
                allDay: true,
                completed: false,
            })
        ).toMatchObject({ completed: false });
        expect(
            parseEvent({
                title: "T",
                date: "d",
                allDay: true,
                completed: "in-progress",
            })
        ).toMatchObject({ completed: "in-progress" });
    });

    it("type defaults to single when absent", () => {
        expect(
            parseEvent({ title: "T", date: "2022-01-01", allDay: true })
        ).toMatchObject({ type: "single" });
    });

    it("recurring, all-day, with recur bounds", () => {
        expect(
            parseEvent({
                title: "T",
                type: "recurring",
                daysOfWeek: ["M", "W"],
                startRecur: "2022-01-01",
                endRecur: "2022-12-31",
                allDay: true,
            })
        ).toEqual({
            title: "T",
            allDay: true,
            type: "recurring",
            daysOfWeek: ["M", "W"],
            startRecur: "2022-01-01",
            endRecur: "2022-12-31",
            // Defaulted in: a note without the key stays valid, and reading it
            // never invents an exception.
            skipDates: [],
        });
    });

    it("recurring, timed", () => {
        expect(
            parseEvent({
                title: "T",
                type: "recurring",
                daysOfWeek: ["F"],
                startTime: "10:00",
                endTime: "11:00",
            })
        ).toEqual({
            title: "T",
            allDay: false,
            startTime: "10:00",
            endTime: "11:00",
            type: "recurring",
            daysOfWeek: ["F"],
            skipDates: [],
        });
    });

    it("rrule", () => {
        expect(
            parseEvent({
                title: "T",
                type: "rrule",
                startDate: "2022-01-01",
                rrule: "FREQ=WEEKLY;BYDAY=TU",
                skipDates: ["2022-02-01"],
                allDay: true,
            })
        ).toEqual({
            title: "T",
            allDay: true,
            type: "rrule",
            startDate: "2022-01-01",
            rrule: "FREQ=WEEKLY;BYDAY=TU",
            skipDates: ["2022-02-01"],
        });
    });

    it("someday is forced all-day with no date/time", () => {
        expect(parseEvent({ title: "T", type: "someday" })).toEqual({
            title: "T",
            allDay: true,
            type: "someday",
        });
    });

    it("carries the common fields through", () => {
        expect(
            parseEvent({
                title: "T",
                date: "2022-01-01",
                allDay: true,
                id: "abc",
                location: "Room 1",
                description: "notes",
                attendees: ["a", "b"],
            })
        ).toEqual({
            title: "T",
            allDay: true,
            type: "single",
            date: "2022-01-01",
            endDate: null,
            id: "abc",
            location: "Room 1",
            description: "notes",
            attendees: ["a", "b"],
        });
    });
});

describe("compat: NeoEvent → frontmatter (serialize & merge)", () => {
    const body = "\nbody";

    it("updates a value in place, keeping key order and the note body", () => {
        const page =
            "---\ntitle: Test Event\nallDay: false\nstartTime: 11:00\nendTime: 12:30\ntype: single\ndate: 2022-01-01\nendDate: null\n---" +
            body;
        const event = parseEvent({
            title: "Test Event",
            allDay: false,
            date: "2022-01-01",
            endDate: null,
            startTime: "11:00",
            endTime: "13:30",
        });
        expect(modifyFrontmatterString(page, event)).toBe(
            "---\ntitle: Test Event\nallDay: false\nstartTime: 11:00\nendTime: 13:30\ntype: single\ndate: 2022-01-01\nendDate: null\n---" +
                body
        );
    });

    it("drops single-only keys when the type changes to rrule", () => {
        const page =
            "---\ntitle: X\nallDay: true\ndate: 2026-06-02\nendDate: 2026-06-03\n---" +
            body;
        const event = parseEvent({
            title: "X",
            allDay: true,
            type: "rrule",
            startDate: "2026-06-02",
            rrule: "FREQ=WEEKLY;BYDAY=TU",
            skipDates: [],
        });
        expect(modifyFrontmatterString(page, event)).toBe(
            "---\ntitle: X\nallDay: true\ntype: rrule\nstartDate: 2026-06-02\nrrule: FREQ=WEEKLY;BYDAY=TU\nskipDates: []\n---" +
                body
        );
    });

    it("drops stale times when an event becomes all-day", () => {
        const page =
            "---\ntitle: T\nallDay: false\nstartTime: 11:00\nendTime: 12:30\ntype: single\ndate: 2022-01-01\nendDate: null\n---" +
            body;
        const event = parseEvent({
            title: "T",
            allDay: true,
            date: "2022-01-01",
            endDate: null,
        });
        expect(modifyFrontmatterString(page, event)).toBe(
            "---\ntitle: T\nallDay: true\ntype: single\ndate: 2022-01-01\nendDate: null\n---" +
                body
        );
    });
});

describe("compat: NeoEvent → daily-note bullet (write)", () => {
    it("timed event, no checkbox", () => {
        const event = parseEvent({
            title: "Meeting",
            date: "2022-01-01",
            startTime: "11:00",
            endTime: "12:00",
        });
        expect(makeListItem(event)).toBe(
            "-  Meeting [startTime:: 11:00]  [endTime:: 12:00]"
        );
    });

    it("all-day, unchecked task → [ ] and allDy attr", () => {
        const event = parseEvent({
            title: "Do thing",
            date: "2022-01-01",
            allDay: true,
            completed: false,
        });
        expect(makeListItem(event)).toBe("- [ ] Do thing [allDay:: true]");
    });

    it("all-day, completed task → [x]", () => {
        const event = parseEvent({
            title: "Task",
            date: "2022-01-01",
            allDay: true,
            completed: "2022-01-01",
        });
        expect(makeListItem(event)).toBe("- [x] Task [allDay:: true]");
    });
});

describe("compat: daily-note bullet → NeoEvent (read)", () => {
    const global = { type: "single" as const, date: "2022-01-01" };

    it("timed unchecked line", () => {
        expect(
            getInlineEventFromLine(
                "- [ ] Meeting [startTime:: 11:00]  [endTime:: 12:00]",
                global
            )
        ).toEqual({
            title: "Meeting",
            allDay: false,
            startTime: "11:00",
            endTime: "12:00",
            type: "single",
            date: "2022-01-01",
            endDate: null,
            completed: false,
        });
    });

    it("all-day checked line", () => {
        expect(
            getInlineEventFromLine("- [x] Do thing [allDay:: true]", global)
        ).toEqual({
            title: "Do thing",
            allDay: true,
            type: "single",
            date: "2022-01-01",
            endDate: null,
            completed: "x",
        });
    });

    it("a line with no inline attributes is not an event", () => {
        expect(getInlineEventFromLine("- [ ] just a task", global)).toBeNull();
    });
});

describe("compat: round-trips", () => {
    it("bullet write → read is identity for a checkboxed event", () => {
        const event = parseEvent({
            title: "Do thing",
            date: "2022-01-01",
            allDay: true,
            completed: false,
        });
        const line = makeListItem(event);
        expect(
            getInlineEventFromLine(line, {
                type: "single",
                date: "2022-01-01",
            })
        ).toEqual(event);
    });

    it("serializeEvent is a faithful copy of the parsed event", () => {
        const event = parseEvent({
            title: "T",
            date: "2022-01-01",
            allDay: true,
        });
        expect(serializeEvent(event)).toEqual(event as unknown);
    });
});
