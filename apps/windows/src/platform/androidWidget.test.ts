import type { DisplayEvent } from "../../../../src/ui/types";
import { buildWidgetPayload, __mixForTests } from "./androidWidget";

const THEME = {
    surface: "#252539",
    text: "#e6e9f5",
    muted: "#9aa0b4",
    accent: "#f38ba8",
};

function event(
    id: string,
    start: string,
    end: string,
    extra: Partial<DisplayEvent> = {}
): DisplayEvent {
    return {
        id,
        title: id,
        start: new Date(start),
        end: new Date(end),
        allDay: false,
        color: "#89b4fa",
        editable: true,
        calendarId: "cal",
        calendarName: "Calendar",
        isTask: false,
        taskCompleted: false,
        taskStatus: "todo",
        isRecurring: false,
        isMultiDay: false,
        isSomeday: false,
        ...extra,
    } as DisplayEvent;
}

const NOW = new Date("2026-08-07T12:00:00");

const build = (events: DisplayEvent[], now = NOW) =>
    buildWidgetPayload({ events, now, timeFormat24h: true, theme: THEME });

describe("buildWidgetPayload", () => {
    it("lists what is still to come, earliest first", () => {
        const rows = build([
            event("later", "2026-08-07T20:00:00", "2026-08-07T21:00:00"),
            event("soon", "2026-08-07T14:00:00", "2026-08-07T15:00:00"),
        ]).rows;

        expect(rows.map((row) => row.id)).toEqual(["soon", "later"]);
    });

    it("leaves out what has already ended", () => {
        const rows = build([
            event("done", "2026-08-07T09:00:00", "2026-08-07T10:00:00"),
        ]).rows;

        expect(rows).toEqual([]);
    });

    // What matters is whether an event has ended, not whether it has begun: an
    // all-morning meeting is still the one you are in at noon.
    it("keeps an event that started but has not ended", () => {
        const rows = build([
            event("running", "2026-08-07T09:00:00", "2026-08-07T18:00:00"),
        ]).rows;

        expect(rows.map((row) => row.id)).toEqual(["running"]);
    });

    /*
     * Which row opens a day is NOT decided here. The widget outlives this list
     * by hours: events end and midnight passes while it is on screen, so it
     * drops what is over and re-groups what is left on its own. Every row
     * therefore carries its day, and none of them is marked.
     */
    it("gives every row its own day rather than grouping them", () => {
        const rows = build([
            event("a", "2026-08-07T14:00:00", "2026-08-07T15:00:00"),
            event("b", "2026-08-07T16:00:00", "2026-08-07T17:00:00"),
            event("c", "2026-08-08T09:00:00", "2026-08-08T10:00:00"),
        ]).rows;

        expect(rows.map((row) => row.day)).toEqual(["7", "7", "8"]);
        expect(rows[0].dayKey).toBe(rows[1].dayKey);
        expect(rows[2].dayKey).not.toBe(rows[0].dayKey);
    });

    // The widget needs the times themselves to tell what has gone by.
    it("carries each event's own start and end", () => {
        const rows = build([
            event("a", "2026-08-07T14:00:00", "2026-08-07T15:00:00"),
        ]).rows;

        expect(rows[0].startMs).toBe(+new Date("2026-08-07T14:00:00"));
        expect(rows[0].endMs).toBe(+new Date("2026-08-07T15:00:00"));
    });

    /*
     * An all-day event spans no hours, so it carries no time at all: the widget
     * marks it with a dot beside its name, which says the same thing in no
     * words and leaves the second line free.
     */
    it("reads a timed event as a range and gives an all-day one no time", () => {
        const rows = build([
            event("timed", "2026-08-07T14:00:00", "2026-08-07T15:30:00"),
            event("whole", "2026-08-08T00:00:00", "2026-08-09T00:00:00", {
                allDay: true,
            }),
        ]).rows;

        expect(rows[0].time).toBe("14:00 – 15:30");
        expect(rows[0].allDay).toBe(false);
        expect(rows[1].time).toBe("");
        expect(rows[1].allDay).toBe(true);
    });

    it("names an event that has no title", () => {
        const rows = build([
            event("x", "2026-08-07T14:00:00", "2026-08-07T15:00:00", {
                title: "",
            }),
        ]).rows;

        expect(rows[0].title).toBe("Sans titre");
    });

    // Someday events have no date to be upcoming on.
    it("leaves someday events out", () => {
        const rows = build([
            event("someday", "2026-08-07T14:00:00", "2026-08-07T15:00:00", {
                isSomeday: true,
            }),
        ]).rows;

        expect(rows).toEqual([]);
    });

    it("stops at the horizon rather than listing the whole year", () => {
        const rows = build([
            event("far", "2026-12-25T14:00:00", "2026-12-25T15:00:00"),
        ]).rows;

        expect(rows).toEqual([]);
    });

    it("says nothing is coming, in the calendar's language", () => {
        const payload = build([]);

        expect(payload.rows).toEqual([]);
        expect(payload.emptyLabel).toBe("Aucun événement prévu");
    });

    // The widget names today itself, long after this list was written, so it is
    // given the weekday names rather than a finished date.
    it("hands over the weekday names, Sunday first", () => {
        expect(build([]).weekdays).toEqual([
            "dim",
            "lun",
            "mar",
            "mer",
            "jeu",
            "ven",
            "sam",
        ]);
    });
});

describe("the widget's theme colours", () => {
    /*
     * `--background-secondary` and `--text-muted` are declared as
     * `color-mix(...)`, and reading a custom property back gives that text
     * rather than a colour — Android cannot parse it, and a regex over it picks
     * the digits out of "#1e1e2e" and calls the surface black. The two mixes
     * are therefore computed here, with the recipe App.tsx uses for the CSS.
     */
    it("mixes the surface as 88% surface over the ink", () => {
        // The same #323346 measured off the settings screen, so the widget and
        // the app arrive at one colour rather than two that nearly match.
        expect(__mixForTests("#1e1e2e", "#c6d0f5", 0.88)).toBe("#323346");
    });

    it("mixes the muted text as 72% ink over the surface", () => {
        expect(__mixForTests("#c6d0f5", "#1e1e2e", 0.72)).toBe("#979ebd");
    });

    it("leaves a colour it cannot read alone", () => {
        expect(__mixForTests("not-a-colour", "#1e1e2e", 0.5)).toBe(
            "not-a-colour"
        );
    });
});
