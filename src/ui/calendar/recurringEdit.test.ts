import {
    detachedOccurrence,
    isSeriesEvent,
    needsScopeChoice,
    occurrenceDateOf,
    occurrenceIsDone,
    seriesWithoutOccurrence,
} from "./recurringEdit";
import { NeoEvent } from "../../types";

const series = (extra: Record<string, unknown> = {}): NeoEvent =>
    ({
        title: "Standup",
        allDay: false,
        startTime: "08:00",
        endTime: "08:30",
        type: "rrule",
        startDate: "2026-08-05",
        rrule: "FREQ=WEEKLY;BYDAY=WE",
        skipDates: [],
        description: "Tour de table",
        ...extra,
    } as unknown as NeoEvent);

describe("occurrenceDateOf", () => {
    it("reads the day an occurrence was opened on", () => {
        expect(occurrenceDateOf("42_2026-08-19")).toBe("2026-08-19");
        expect(occurrenceDateOf("path:Perso/(Every W) Standup.md")).toBeNull();
        expect(occurrenceDateOf(null)).toBeNull();
    });
});

describe("needsScopeChoice", () => {
    it("asks on one day of a series", () => {
        expect(
            needsScopeChoice({
                event: series(),
                eventId: "42_2026-08-19",
                isDraft: false,
            })
        ).toBe(true);
    });

    // The series itself, opened from somewhere with no day in hand, has
    // nothing to single out.
    it("stays quiet without a day to single out", () => {
        expect(
            needsScopeChoice({
                event: series(),
                eventId: "42",
                isDraft: false,
            })
        ).toBe(false);
    });

    it("stays quiet on a single event and on a draft", () => {
        const single = {
            title: "Vol",
            type: "single",
            date: "2026-08-19",
            allDay: true,
        } as unknown as NeoEvent;

        expect(
            needsScopeChoice({
                event: single,
                eventId: "42_2026-08-19",
                isDraft: false,
            })
        ).toBe(false);
        expect(
            needsScopeChoice({
                event: series(),
                eventId: null,
                isDraft: true,
            })
        ).toBe(false);
    });

    it("knows a series from anything else", () => {
        expect(isSeriesEvent(series())).toBe(true);
        expect(isSeriesEvent(series({ type: "recurring" }))).toBe(true);
        expect(isSeriesEvent(null)).toBe(false);
    });
});

describe("detachedOccurrence", () => {
    // A rule left on the copy would make it repeat as well, which is the one
    // thing detaching an occurrence must not do.
    it("keeps what was typed and drops what only a series can carry", () => {
        const single = detachedOccurrence({
            payload: series({ title: "Démo client" }),
            dateISO: "2026-08-19",
        }) as unknown as Record<string, unknown>;

        expect(single.type).toBe("single");
        expect(single.date).toBe("2026-08-19");
        expect(single.endDate).toBeNull();
        expect(single.title).toBe("Démo client");
        expect(single.description).toBe("Tour de table");
        expect(single.startTime).toBe("08:00");
        expect(single.rrule).toBeUndefined();
        expect(single.startDate).toBeUndefined();
        expect(single.skipDates).toBeUndefined();
        expect(single.completedDates).toBeUndefined();
    });

    it("leaves an ordinary event without a checkbox", () => {
        const single = detachedOccurrence({
            payload: series(),
            dateISO: "2026-08-19",
        }) as unknown as Record<string, unknown>;

        expect("completed" in single).toBe(false);
    });

    // On a series `completed` only says "this is a task"; a single event's
    // copy has to answer for the day as well.
    it("carries a task, finished or not", () => {
        const outstanding = detachedOccurrence({
            payload: series({ completed: false }),
            dateISO: "2026-08-19",
        }) as unknown as Record<string, unknown>;
        const finished = detachedOccurrence({
            payload: series({ completed: false }),
            dateISO: "2026-08-19",
            done: true,
            now: () => "2026-08-19T09:00:00",
        }) as unknown as Record<string, unknown>;

        expect(outstanding.completed).toBe(false);
        expect(finished.completed).toBe("2026-08-19T09:00:00");
    });
});

describe("seriesWithoutOccurrence", () => {
    it("takes the day out of the series", () => {
        const next = seriesWithoutOccurrence(
            series({ skipDates: ["2026-08-12"] }),
            "2026-08-19"
        ) as unknown as Record<string, unknown>;

        expect(next.skipDates).toEqual(["2026-08-12", "2026-08-19"]);
    });

    it("does not list the same day twice", () => {
        const next = seriesWithoutOccurrence(
            series({ skipDates: ["2026-08-19"] }),
            "2026-08-19"
        ) as unknown as Record<string, unknown>;

        expect(next.skipDates).toEqual(["2026-08-19"]);
    });
});

describe("occurrenceIsDone", () => {
    it("reads the day off the series' ticked list", () => {
        expect(
            occurrenceIsDone(
                series({ completedDates: ["2026-08-19"] }),
                "2026-08-19"
            )
        ).toBe(true);
        expect(occurrenceIsDone(series(), "2026-08-19")).toBe(false);
    });
});
