import { DisplayEvent } from "../types";
import { formatDuration, groupEventsByDay } from "./CommandPalette";

function event(id: string, start: string, end: string): DisplayEvent {
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
    } as DisplayEvent;
}

describe("formatDuration", () => {
    it("reads short events in minutes", () => {
        expect(
            formatDuration(
                new Date("2026-06-20T07:00:00"),
                new Date("2026-06-20T07:30:00")
            )
        ).toBe("30 min");
    });

    it("drops the minutes when there are none", () => {
        expect(
            formatDuration(
                new Date("2026-06-20T07:00:00"),
                new Date("2026-06-20T08:00:00")
            )
        ).toBe("1 h");
    });

    it("reads hours and minutes together", () => {
        expect(
            formatDuration(
                new Date("2026-06-20T07:00:00"),
                new Date("2026-06-20T08:45:00")
            )
        ).toBe("1 h 45");
    });

    // An event dragged so its end lands before its start would otherwise read
    // as a negative length.
    it("never reads a negative length", () => {
        expect(
            formatDuration(
                new Date("2026-06-20T08:00:00"),
                new Date("2026-06-20T07:00:00")
            )
        ).toBe("0 min");
    });
});

describe("groupEventsByDay", () => {
    it("puts each day's matches under one heading", () => {
        const days = groupEventsByDay([
            event("a", "2026-06-20T07:00:00", "2026-06-20T07:30:00"),
            event("b", "2026-06-21T09:00:00", "2026-06-21T10:00:00"),
            event("c", "2026-06-20T12:00:00", "2026-06-20T13:00:00"),
        ]);

        expect(days).toHaveLength(2);
        expect(days[0].events.map((e) => e.id)).toEqual(["a", "c"]);
        expect(days[1].events.map((e) => e.id)).toEqual(["b"]);
    });

    it("reads each day in order, earliest first", () => {
        const days = groupEventsByDay([
            event("late", "2026-06-21T09:00:00", "2026-06-21T10:00:00"),
            event("early", "2026-06-20T07:00:00", "2026-06-20T07:30:00"),
        ]);

        expect(days.map((day) => day.events[0].id)).toEqual(["early", "late"]);
    });

    // Two events at the same clock time a year apart are not the same day.
    it("keeps the same date in different years apart", () => {
        const days = groupEventsByDay([
            event("a", "2026-06-20T07:00:00", "2026-06-20T07:30:00"),
            event("b", "2027-06-20T07:00:00", "2027-06-20T07:30:00"),
        ]);

        expect(days).toHaveLength(2);
    });

    it("has nothing to group when nothing matched", () => {
        expect(groupEventsByDay([])).toEqual([]);
    });
});
