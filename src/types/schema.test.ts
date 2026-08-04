import fc from "fast-check";
import { ZodFastCheck } from "zod-fast-check";
import {
    CommonSchema,
    EventSchema,
    ParsedDate,
    ParsedTime,
    TimeSchema,
    parseEvent,
    serializeEvent,
} from "./schema";

/**
 * Normalizing arbitrary objects into events (docs/event-format-spec.md §1–2).
 *
 * The exhaustive on-disk compatibility cases live in
 * src/compat/fullCalendarFormat.test.ts; this file pins the schema's own rules —
 * the defaults it fills in, and the round-trip property every event must satisfy.
 */

describe("single events", () => {
    it("fills in the type and the missing end date", () => {
        expect(
            parseEvent({ title: "Test", date: "2021-01-01", allDay: true })
        ).toEqual({
            title: "Test",
            type: "single",
            allDay: true,
            date: "2021-01-01",
            endDate: null,
        });
    });

    it("keeps a date verbatim, whatever shape it is in", () => {
        // Dates are never coerced to a Date — the string is stored as given.
        expect(
            parseEvent({
                title: "Test",
                type: "single",
                date: "2021-01-01T10:30:00.000Z",
                allDay: false,
                startTime: "10:30",
                endTime: null,
            })
        ).toEqual({
            title: "Test",
            type: "single",
            allDay: false,
            date: "2021-01-01T10:30:00.000Z",
            endDate: null,
            startTime: "10:30",
            endTime: null,
        });
    });

    it("keeps a time verbatim, am/pm and all", () => {
        expect(
            parseEvent({
                title: "Test",
                date: "2021-01-01",
                allDay: false,
                startTime: "10:30 pm",
                endTime: null,
            })
        ).toMatchObject({ startTime: "10:30 pm", endTime: null });
    });

    it("spans days when given an end date", () => {
        expect(
            parseEvent({
                title: "Test",
                type: "single",
                date: "2021-01-01",
                endDate: "2021-01-03",
                allDay: true,
            })
        ).toMatchObject({ date: "2021-01-01", endDate: "2021-01-03" });
    });

    it.each([
        ["a to-do with no state", null],
        ["an unchecked to-do", false],
        ["one in progress", "in-progress"],
        ["one finished at a given time", "2021-01-01T10:30:00.000Z"],
    ])("carries %s through", (_, completed) => {
        expect(
            parseEvent({
                title: "Test",
                type: "single",
                date: "2021-01-01",
                allDay: true,
                completed,
            })
        ).toMatchObject({ completed });
    });
});

describe("recurring events", () => {
    it("recurs on the given weekdays", () => {
        expect(
            parseEvent({
                title: "Test",
                type: "recurring",
                daysOfWeek: ["M", "W"],
                allDay: true,
            })
        ).toEqual({
            title: "Test",
            type: "recurring",
            allDay: true,
            daysOfWeek: ["M", "W"],
            skipDates: [],
        });
    });

    it("keeps the dates an occurrence was detached from", () => {
        expect(
            parseEvent({
                title: "Test",
                type: "recurring",
                daysOfWeek: ["M"],
                allDay: true,
                skipDates: ["2026-07-29"],
            })
        ).toMatchObject({ skipDates: ["2026-07-29"] });
    });

    it("defaults to no exception date, so older notes stay valid", () => {
        // Notes written before `skipDates` existed on this type — including
        // every one the upstream plugin wrote — carry no such key.
        expect(
            parseEvent({
                title: "Test",
                type: "recurring",
                daysOfWeek: ["M"],
                allDay: true,
            })
        ).toMatchObject({ skipDates: [] });
    });

    it("accepts a bound on either side, or both", () => {
        const recurring = {
            title: "Test",
            type: "recurring",
            daysOfWeek: ["M"],
            allDay: true,
        };

        expect(
            parseEvent({ ...recurring, startRecur: "2023-01-05" })
        ).toMatchObject({ startRecur: "2023-01-05" });

        expect(
            parseEvent({ ...recurring, endRecur: "2023-01-05" })
        ).toMatchObject({ endRecur: "2023-01-05" });

        expect(
            parseEvent({
                ...recurring,
                startRecur: "2023-01-05",
                endRecur: "2023-05-12",
            })
        ).toMatchObject({
            startRecur: "2023-01-05",
            endRecur: "2023-05-12",
        });
    });
});

describe("rrule events", () => {
    it("carries the rule, its start, and the dates it skips", () => {
        expect(
            parseEvent({
                title: "Test",
                type: "rrule",
                id: "hi",
                rrule: "RRULE",
                skipDates: [],
                startDate: "2023-01-05",
                allDay: true,
            })
        ).toEqual({
            title: "Test",
            type: "rrule",
            id: "hi",
            allDay: true,
            rrule: "RRULE",
            skipDates: [],
            startDate: "2023-01-05",
        });
    });
});

describe("someday events", () => {
    it("has no date and no time at all", () => {
        // A someday event sits outside the calendar, so the all-day/timed
        // distinction is meaningless for it: it is forced all-day.
        expect(parseEvent({ title: "Test", type: "someday" })).toEqual({
            title: "Test",
            type: "someday",
            allDay: true,
        });
    });
});

describe("properties", () => {
    // Dates and times are free-form strings in the schema, so left alone
    // fast-check would generate arbitrary text for them. Pin realistic shapes.
    const zfc = ZodFastCheck()
        .override(
            ParsedDate,
            fc
                .date({ min: new Date(2000, 0, 1), max: new Date(2150, 0, 1) })
                .map((d) => d.toISOString().slice(0, 10))
        )
        .override(
            ParsedTime,
            fc
                .tuple(
                    fc.integer({ min: 0, max: 23 }),
                    fc.integer({ min: 0, max: 59 })
                )
                .map(
                    ([hour, minute]) =>
                        `${String(hour).padStart(2, "0")}:${String(
                            minute
                        ).padStart(2, "0")}`
                )
        );

    it("parses anything the schema can describe", () => {
        const inputs = fc
            .tuple(
                zfc.inputOf(CommonSchema),
                zfc.inputOf(TimeSchema),
                zfc.inputOf(EventSchema)
            )
            .map(([common, time, event]) => ({ ...common, ...time, ...event }));

        fc.assert(
            fc.property(inputs, (obj) => {
                expect(() => parseEvent(obj)).not.toThrow();
            })
        );
    });

    it("round-trips: serializing then re-parsing gives the event back", () => {
        const events = fc
            .tuple(
                zfc.outputOf(CommonSchema),
                zfc.outputOf(TimeSchema),
                zfc.outputOf(EventSchema)
            )
            .map(([common, time, event]) =>
                // A someday event never carries a time facet.
                event.type === "someday"
                    ? { ...common, allDay: true as const, ...event }
                    : { ...common, ...time, ...event }
            );

        fc.assert(
            fc.property(events, (event) => {
                expect(parseEvent(serializeEvent(event))).toEqual(event);
            })
        );
    });
});
