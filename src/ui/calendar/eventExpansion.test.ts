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
