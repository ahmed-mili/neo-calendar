import {
    needsOccurrenceChoice,
    seriesStartDate,
    withFollowingRemoved,
    withOccurrenceRemoved,
} from "./recurrenceDeletion";
import { neoEventToDisplayEvents } from "./eventExpansion";
import { NeoEvent } from "../../types";

const weekdaySeries = {
    title: "Standup",
    type: "recurring",
    allDay: false,
    daysOfWeek: ["W"],
    startRecur: "2026-07-20",
    startTime: "08:00",
    endTime: "08:30",
    skipDates: [] as string[],
} as unknown as NeoEvent;

const rruleSeries = {
    title: "Standup",
    type: "rrule",
    allDay: false,
    startDate: "2026-07-22",
    rrule: "RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=WE",
    skipDates: [] as string[],
    completedDates: [] as string[],
} as unknown as NeoEvent;

describe("where a series starts", () => {
    it("starts a weekday series on its first matching day", () => {
        expect(seriesStartDate(weekdaySeries)).toBe("2026-07-22");
    });

    it("starts an rrule series on its first occurrence", () => {
        expect(seriesStartDate(rruleSeries)).toBe("2026-07-22");
    });

    // The whole point of the marker: once the first occurrences are deleted,
    // the series visibly begins somewhere else.
    it("moves to the first occurrence left once earlier ones are deleted", () => {
        expect(
            seriesStartDate({
                ...weekdaySeries,
                skipDates: ["2026-07-22", "2026-07-29"],
            } as NeoEvent)
        ).toBe("2026-08-05");

        expect(
            seriesStartDate({
                ...rruleSeries,
                skipDates: ["2026-07-22", "2026-07-29"],
            } as NeoEvent)
        ).toBe("2026-08-05");
    });

    it("has no start for an event that does not recur", () => {
        expect(
            seriesStartDate({
                title: "Lunch",
                type: "single",
                date: "2026-07-22",
                allDay: true,
            } as unknown as NeoEvent)
        ).toBeNull();
    });

    // A weekly series written before start dates were kept has no anchor to
    // count from, so nothing can be called its first occurrence.
    it("has no start for a weekday series with no start date", () => {
        expect(
            seriesStartDate({
                ...weekdaySeries,
                startRecur: undefined,
            } as NeoEvent)
        ).toBeNull();
    });

    it("has no start left once the series is entirely deleted", () => {
        expect(
            seriesStartDate({
                ...rruleSeries,
                rrule: "RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=WE;COUNT=2",
                skipDates: ["2026-07-22", "2026-07-29"],
            } as NeoEvent)
        ).toBeNull();
    });
});

/** The dates a series actually shows over a wide window, after an edit. */
const datesOf = (event: NeoEvent): string[] =>
    neoEventToDisplayEvents(
        event,
        "42",
        "cal",
        "Cal",
        "#ffffff",
        true,
        new Date("2026-07-01T00:00:00"),
        new Date("2026-09-30T23:59:59")
    ).map((occurrence) => occurrence.id.replace("42_", ""));

describe("deleting a single occurrence", () => {
    it("takes the date out of a weekday series and leaves the rest", () => {
        const next = withOccurrenceRemoved(weekdaySeries, "2026-07-29");

        expect(datesOf(next)).toEqual([
            "2026-07-22",
            "2026-08-05",
            "2026-08-12",
            "2026-08-19",
            "2026-08-26",
            "2026-09-02",
            "2026-09-09",
            "2026-09-16",
            "2026-09-23",
            "2026-09-30",
        ]);
    });

    it("takes the date out of an rrule series and leaves the rest", () => {
        const next = withOccurrenceRemoved(rruleSeries, "2026-07-29");

        expect(datesOf(next)).not.toContain("2026-07-29");
        expect(datesOf(next)).toContain("2026-07-22");
        expect(datesOf(next)).toContain("2026-08-05");
    });

    it("keeps the dates already deleted", () => {
        const next = withOccurrenceRemoved(
            { ...rruleSeries, skipDates: ["2026-07-22"] } as NeoEvent,
            "2026-07-29"
        );

        expect(datesOf(next)).not.toContain("2026-07-22");
        expect(datesOf(next)).not.toContain("2026-07-29");
    });
});

describe("deleting an occurrence and everything after it", () => {
    it("ends a weekday series the day before", () => {
        const next = withFollowingRemoved(weekdaySeries, "2026-08-12");

        expect(next).not.toBeNull();
        expect(datesOf(next!)).toEqual([
            "2026-07-22",
            "2026-07-29",
            "2026-08-05",
        ]);
    });

    it("ends an rrule series the day before", () => {
        const next = withFollowingRemoved(rruleSeries, "2026-08-12");

        expect(next).not.toBeNull();
        expect(datesOf(next!)).toEqual([
            "2026-07-22",
            "2026-07-29",
            "2026-08-05",
        ]);
    });

    // A series counted in occurrences ("12 times") would otherwise keep
    // running past the new end, COUNT and UNTIL being read together.
    it("drops the count a series was given", () => {
        const next = withFollowingRemoved(
            {
                ...rruleSeries,
                rrule: "RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=WE;COUNT=12",
            } as NeoEvent,
            "2026-08-12"
        );

        expect(datesOf(next!)).toEqual([
            "2026-07-22",
            "2026-07-29",
            "2026-08-05",
        ]);
    });

    // Nothing would be left of the series, so the event goes with it rather
    // than staying behind as a note that shows nowhere.
    it("has nothing left when the first occurrence is the one deleted", () => {
        expect(withFollowingRemoved(weekdaySeries, "2026-07-22")).toBeNull();
        expect(withFollowingRemoved(rruleSeries, "2026-07-22")).toBeNull();
    });

    it("has nothing left when the occurrences before it are already deleted", () => {
        const started = {
            ...rruleSeries,
            skipDates: ["2026-07-22", "2026-07-29"],
        } as NeoEvent;

        expect(withFollowingRemoved(started, "2026-08-05")).toBeNull();
    });
});

describe("deciding whether deleting has to ask", () => {
    it("asks before deleting one occurrence of a series", () => {
        expect(needsOccurrenceChoice(weekdaySeries, "42_2026-07-29")).toBe(
            true
        );
        expect(needsOccurrenceChoice(rruleSeries, "42_2026-07-29")).toBe(true);
    });

    it("does not ask for an event that does not recur", () => {
        expect(
            needsOccurrenceChoice(
                {
                    title: "Lunch",
                    type: "single",
                    date: "2026-07-22",
                } as unknown as NeoEvent,
                "42"
            )
        ).toBe(false);
    });

    // Nothing points at a date, so there is no single occurrence to keep or
    // drop: the series goes as a whole, as it always did.
    it("does not ask when the target is the series itself", () => {
        expect(needsOccurrenceChoice(weekdaySeries, "42")).toBe(false);
    });
});
