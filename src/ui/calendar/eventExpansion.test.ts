import { neoEventToDisplayEvents } from "./eventExpansion";
import { NeoEvent } from "../../types";

/** Expand an event over a window and return the ids it produced. */
const expandIds = (event: unknown, from: string, to: string): string[] =>
    neoEventToDisplayEvents(
        event as NeoEvent,
        "42",
        "cal",
        "Cal",
        "#ffffff",
        true,
        new Date(from),
        new Date(to)
    ).map((e) => e.id);

const WINDOW: [string, string] = ["2026-07-20T00:00:00", "2026-08-10T23:59:59"];

const weekdaySeries = {
    title: "Standup",
    type: "recurring",
    allDay: false,
    daysOfWeek: ["W"],
    startTime: "08:00",
    endTime: "08:30",
    skipDates: [] as string[],
};

describe("expanding a weekday series", () => {
    it("occurs on every matching weekday in range", () => {
        const ids = expandIds(weekdaySeries, ...WINDOW);

        expect(ids).toContain("42_2026-07-22");
        expect(ids).toContain("42_2026-07-29");
        expect(ids).toContain("42_2026-08-05");
    });

    // Detaching an occurrence writes its date into the series' skipDates. If
    // the expansion ignored them, the occurrence would come back on the next
    // read and sit on top of the copy that was moved away.
    it("leaves out a date the series was told to skip", () => {
        const ids = expandIds(
            { ...weekdaySeries, skipDates: ["2026-07-29"] },
            ...WINDOW
        );

        expect(ids).not.toContain("42_2026-07-29");
        expect(ids).toContain("42_2026-07-22");
        expect(ids).toContain("42_2026-08-05");
    });

    it("leaves out several skipped dates at once", () => {
        const ids = expandIds(
            { ...weekdaySeries, skipDates: ["2026-07-22", "2026-08-05"] },
            ...WINDOW
        );

        expect(ids).toEqual(["42_2026-07-29"]);
    });
});

/** Expand an event over a window and return the dates it marked as the start. */
const expandStarts = (event: unknown, from: string, to: string): string[] =>
    neoEventToDisplayEvents(
        event as NeoEvent,
        "42",
        "cal",
        "Cal",
        "#ffffff",
        true,
        new Date(from),
        new Date(to)
    )
        .filter((occurrence) => occurrence.isSeriesStart)
        .map((occurrence) => occurrence.id);

// Where the series begins is a fact about the series, not about what is on
// screen: scrolling to a later week must not crown a new first occurrence.
describe("marking where a series begins", () => {
    const dated = { ...weekdaySeries, startRecur: "2026-07-20" };

    it("marks the first occurrence of the series", () => {
        expect(expandStarts(dated, ...WINDOW)).toEqual(["42_2026-07-22"]);
    });

    it("marks nothing in a window that opens after the series started", () => {
        expect(
            expandStarts(dated, "2026-08-01T00:00:00", "2026-08-31T23:59:59")
        ).toEqual([]);
    });

    it("moves the mark to the occurrence that now comes first", () => {
        expect(
            expandStarts({ ...dated, skipDates: ["2026-07-22"] }, ...WINDOW)
        ).toEqual(["42_2026-07-29"]);
    });

    it("marks nothing on an event that does not recur", () => {
        expect(
            expandStarts(
                { title: "Lunch", type: "single", date: "2026-07-22" },
                ...WINDOW
            )
        ).toEqual([]);
    });
});
