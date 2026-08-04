import { diffCalendarVisibility } from "./useCalendarVisibility";

describe("calendar visibility transitions", () => {
    it("marks newly hidden calendars as exiting", () => {
        expect([
            ...diffCalendarVisibility(new Set(), new Set(["work"])),
        ]).toEqual([["work", "exiting"]]);
    });

    it("marks newly visible calendars as entering", () => {
        expect([
            ...diffCalendarVisibility(new Set(["work"]), new Set()),
        ]).toEqual([["work", "entering"]]);
    });

    it("handles show-only changes in both directions", () => {
        expect(
            [
                ...diffCalendarVisibility(
                    new Set(["personal"]),
                    new Set(["work"])
                ),
            ].sort(([a], [b]) => a.localeCompare(b))
        ).toEqual([
            ["personal", "entering"],
            ["work", "exiting"],
        ]);
    });

    it("returns no transition when visibility is unchanged", () => {
        expect(
            diffCalendarVisibility(new Set(["work"]), new Set(["work"])).size
        ).toBe(0);
    });
});
