import { DisplayEvent } from "../types";
import {
    createUnscheduledPanelEvent,
    filterPanelEvents,
    formatCardDate,
    formatPanelDay,
    formatPanelPeriod,
    formatTotalMinutes,
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

    it("omits the year inside the current year", () => {
        expect(formatPanelDay(new Date("2026-11-01T00:00:00"), 2026)).toBe(
            "Sun Nov 1"
        );
    });

    it("adds the year once the date leaves the current one", () => {
        expect(formatPanelDay(new Date("2027-01-01T00:00:00"), 2026)).toBe(
            "Fri Jan 1, 2027"
        );
        expect(formatPanelDay(new Date("2025-12-25T00:00:00"), 2026)).toBe(
            "Thu Dec 25, 2025"
        );
    });

    it("labels an all-day event with its day", () => {
        const holiday = event({
            allDay: true,
            start: new Date("2027-03-28T00:00:00"),
            end: new Date("2027-03-29T00:00:00"),
            isTask: false,
        });
        expect(card(holiday)).toBe("Sun Mar 28, 2027");
    });

    it("carries the year onto both ends of a range that crosses years", () => {
        const spanning = event({
            allDay: true,
            start: new Date("2026-12-31T00:00:00"),
            end: new Date("2027-01-03T00:00:00"),
            isTask: false,
        });
        expect(card(spanning)).toBe("Dec 31 → Jan 2, 2027");
    });

    it("keeps times alongside the dated label", () => {
        const timed = event({
            start: new Date("2027-02-03T09:00:00"),
            end: new Date("2027-02-03T10:30:00"),
        });
        expect(card(timed)).toBe("Wed Feb 3, 2027, 09:00 – 10:30");
    });
});

describe("calendar events panel helpers", () => {
    it("renders a stable fallback for blank event titles", () => {
        expect(getDisplayTitle("")).toBe("Untitled");
        expect(getDisplayTitle("   ")).toBe("Untitled");
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
        expect(formatPanelPeriod("all", null)).toBe("All dates");
        expect(formatPanelPeriod("scheduled", null)).toBe("Scheduled");
        expect(
            formatPanelPeriod("period", {
                start: "2026-07-01",
                end: "2026-07-31",
            })
        ).toBe("Jul 1 – Jul 31, 2026");
    });
});
