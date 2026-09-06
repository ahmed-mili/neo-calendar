import { DisplayEvent } from "../types";
import {
    createUnscheduledPanelEvent,
    filterPanelEvents,
    formatCardDate,
    formatPanelDay,
    formatPanelPeriod,
    formatTotalMinutes,
    panelTimeframe,
    getCalendarColorName,
    getDisplayTitle,
    summarizePanelEvents,
} from "./CalendarEventsPanel.helpers";
import { addDays, formatTime } from "./CalendarUtils";

const event = (overrides: Partial<DisplayEvent> = {}): DisplayEvent => ({
    id: "event-1",
    title: "Planning",
    start: new Date("2026-07-20T09:00:00"),
    end: new Date("2026-07-20T09:30:00"),
    allDay: false,
    color: "#fd7941",
    editable: true,
    calendarId: "calendar-1",
    calendarName: "Work",
    isTask: true,
    taskCompleted: false,
    taskStatus: "todo",
    isRecurring: false,
    isMultiDay: false,
    isSomeday: false,
    ...overrides,
});

describe("panel date labels", () => {
    const card = (e: DisplayEvent) =>
        formatCardDate(e, true, formatTime, addDays, 2026);

    // The panel used to format its dates through the en-US locale while the rest
    // of the calendar read the dictionary, so a French calendar showed
    // "Sat Aug 8" above French labels. These read the language in force, which
    // the tests leave at its default.
    it("omits the year inside the current year", () => {
        expect(formatPanelDay(new Date("2026-11-01T00:00:00"), 2026)).toBe(
            "dim 1 nov"
        );
    });

    it("adds the year once the date leaves the current one", () => {
        expect(formatPanelDay(new Date("2027-01-01T00:00:00"), 2026)).toBe(
            "ven 1 janv 2027"
        );
        expect(formatPanelDay(new Date("2025-12-25T00:00:00"), 2026)).toBe(
            "jeu 25 déc 2025"
        );
    });

    // English is not asserted here: the day and month names are read once, when
    // the module loads, because the language is chosen at start-up and a change
    // reloads the view. Switching it mid-test would swap the word order without
    // swapping the names.

    it("labels an all-day event with its day", () => {
        const holiday = event({
            allDay: true,
            start: new Date("2027-03-28T00:00:00"),
            end: new Date("2027-03-29T00:00:00"),
            isTask: false,
        });
        expect(card(holiday)).toBe("dim 28 mars 2027");
    });

    it("carries the year onto both ends of a range that crosses years", () => {
        const spanning = event({
            allDay: true,
            start: new Date("2026-12-31T00:00:00"),
            end: new Date("2027-01-03T00:00:00"),
            isTask: false,
        });
        expect(card(spanning)).toBe("31 déc → 2 janv 2027");
    });

    it("keeps times alongside the dated label", () => {
        const timed = event({
            start: new Date("2027-02-03T09:00:00"),
            end: new Date("2027-02-03T10:30:00"),
        });
        expect(card(timed)).toBe("mer 3 févr 2027, 09:00 – 10:30");
    });
});

describe("calendar events panel helpers", () => {
    it("renders a stable fallback for blank event titles", () => {
        expect(getDisplayTitle("")).toBe("Sans titre");
        expect(getDisplayTitle("   ")).toBe("Sans titre");
        expect(getDisplayTitle("Planning")).toBe("Planning");
    });

    it("filters scheduled and unscheduled entries independently", () => {
        const scheduled = event();
        const unscheduled = event({ id: "event-2", isSomeday: true });

        expect(
            filterPanelEvents([scheduled, unscheduled], "all", "scheduled")
        ).toEqual([scheduled]);
        expect(
            filterPanelEvents([scheduled, unscheduled], "all", "unscheduled")
        ).toEqual([unscheduled]);
    });

    it("filters task status without hiding non-task entries from All", () => {
        const todo = event();
        const complete = event({
            id: "event-2",
            taskStatus: "complete",
            taskCompleted: "2026-07-20T10:00:00",
        });
        const note = event({ id: "event-3", isTask: false });

        expect(
            filterPanelEvents([todo, complete, note], "todo", "all")
        ).toEqual([todo]);
        expect(
            filterPanelEvents([todo, complete, note], "complete", "all")
        ).toEqual([complete]);
        expect(filterPanelEvents([todo, complete, note], "all", "all")).toEqual(
            [todo, complete, note]
        );
    });

    it("hides only the events from a hidden ICS link, leaving others untouched", () => {
        const linked = event({ id: "event-1", icsFeedId: "feed-1" });
        const otherLinked = event({ id: "event-2", icsFeedId: "feed-2" });
        const personal = event({ id: "event-3" });

        const result = filterPanelEvents(
            [linked, otherLinked, personal],
            "all",
            "all",
            "",
            null,
            new Set(["feed-1"])
        );

        expect(result).toEqual([otherLinked, personal]);
    });

    it("names Notion palette colors", () => {
        expect(getCalendarColorName("#fd7941")).toBe("Orange");
        expect(getCalendarColorName("#5ECC89")).toBe("Green");
        expect(getCalendarColorName("#123456")).toBe("Custom");
    });

    it("creates a blank dateless event that becomes a task when requested", () => {
        expect(createUnscheduledPanelEvent(true)).toEqual({
            title: "",
            type: "someday",
            allDay: true,
            completed: false,
        });
        expect(createUnscheduledPanelEvent(false)).toEqual({
            title: "",
            type: "someday",
            allDay: true,
        });
    });

    it("matches events that overlap an inclusive custom period", () => {
        const inside = event();
        const overlapsStart = event({
            id: "event-2",
            start: new Date("2026-07-19T23:30:00"),
            end: new Date("2026-07-20T00:30:00"),
        });
        const endsAtBoundary = event({
            id: "event-3",
            start: new Date("2026-07-19T22:00:00"),
            end: new Date("2026-07-20T00:00:00"),
        });
        const unscheduled = event({ id: "event-4", isSomeday: true });

        expect(
            filterPanelEvents(
                [inside, overlapsStart, endsAtBoundary, unscheduled],
                "all",
                "period",
                "",
                { start: "2026-07-20", end: "2026-07-20" }
            )
        ).toEqual([inside, overlapsStart]);
    });

    it("searches titles and descriptions without case or accent sensitivity", () => {
        const titleMatch = event({ title: "Développement" });
        const descriptionMatch = event({
            id: "event-2",
            title: "Planning",
            description: "Réunion équipe produit",
        });

        expect(
            filterPanelEvents(
                [titleMatch, descriptionMatch],
                "all",
                "all",
                "developpement"
            )
        ).toEqual([titleMatch]);
        expect(
            filterPanelEvents(
                [titleMatch, descriptionMatch],
                "all",
                "all",
                "REUNION"
            )
        ).toEqual([descriptionMatch]);
    });

    it("sums timed durations and counts tasks from the filtered result", () => {
        const timed = event({
            start: new Date("2026-07-20T09:00:00"),
            end: new Date("2026-07-20T10:35:00"),
        });
        const allDay = event({
            id: "event-2",
            start: new Date("2026-07-21T00:00:00"),
            end: new Date("2026-07-22T00:00:00"),
            allDay: true,
        });
        const note = event({
            id: "event-3",
            isTask: false,
            start: new Date("2026-07-22T14:00:00"),
            end: new Date("2026-07-22T14:25:00"),
        });
        const someday = event({ id: "event-4", isSomeday: true });

        expect(summarizePanelEvents([timed, allDay, note, someday])).toEqual({
            totalMinutes: 120,
            taskCount: 3,
        });
        expect(formatTotalMinutes(120)).toBe("2h 00min");
        expect(formatTotalMinutes(95)).toBe("1h 35min");
    });

    it("labels the active period", () => {
        expect(formatPanelPeriod("all", null)).toBe("Toutes les dates");
        expect(formatPanelPeriod("scheduled", null)).toBe("Planifiés");
        expect(
            formatPanelPeriod("period", {
                start: "2026-07-01",
                end: "2026-07-31",
            })
        ).toBe("1 juil – 31 juil 2026");
    });
});

describe("panelTimeframe", () => {
    const now = new Date("2026-08-10T14:00:00");
    const at = (iso: string) => new Date(iso);

    it("calls an event that has ended past", () => {
        expect(
            panelTimeframe(
                {
                    start: at("2026-08-10T10:00:00"),
                    end: at("2026-08-10T11:00:00"),
                },
                now
            )
        ).toBe("past");
    });

    it("calls an event that has not started future", () => {
        expect(
            panelTimeframe(
                {
                    start: at("2026-08-10T15:00:00"),
                    end: at("2026-08-10T16:00:00"),
                },
                now
            )
        ).toBe("future");
    });

    it("calls an event that is running now", () => {
        expect(
            panelTimeframe(
                {
                    start: at("2026-08-10T13:30:00"),
                    end: at("2026-08-10T14:30:00"),
                },
                now
            )
        ).toBe("now");
    });

    it("counts today's all-day event as now, all day", () => {
        // An all-day event runs to the following midnight, which is what makes
        // "today" and "happening now" the same thing for something untimed.
        expect(
            panelTimeframe(
                {
                    start: at("2026-08-10T00:00:00"),
                    end: at("2026-08-11T00:00:00"),
                },
                now
            )
        ).toBe("now");
        expect(
            panelTimeframe(
                {
                    start: at("2026-08-09T00:00:00"),
                    end: at("2026-08-10T00:00:00"),
                },
                now
            )
        ).toBe("past");
    });

    it("treats the instant an event ends as over", () => {
        expect(
            panelTimeframe(
                {
                    start: at("2026-08-10T13:00:00"),
                    end: at("2026-08-10T14:00:00"),
                },
                now
            )
        ).toBe("past");
    });

    it("has nothing to say about an undated event", () => {
        // Waiting is not late.
        expect(
            panelTimeframe(
                {
                    start: at("2026-01-01T00:00:00"),
                    end: at("2026-01-01T00:00:00"),
                    isSomeday: true,
                },
                now
            )
        ).toBeNull();
    });
});
