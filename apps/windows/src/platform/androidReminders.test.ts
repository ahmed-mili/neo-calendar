import type { DisplayEvent } from "../../../../src/ui/types";
import { ALL_DAY_REMINDER_HOUR, buildReminders } from "./androidReminders";

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

const build = (events: DisplayEvent[], minutesBefore = 10) =>
    buildReminders({ events, now: NOW, minutesBefore, timeFormat24h: true });

describe("buildReminders", () => {
    it("fires the chosen number of minutes before the event", () => {
        const [reminder] = build([
            event("a", "2026-08-07T14:00:00", "2026-08-07T15:00:00"),
        ]);

        expect(reminder.atMs).toBe(+new Date("2026-08-07T13:50:00"));
        expect(reminder.title).toBe("a");
        expect(reminder.body).toBe("Dans 10 min · 14:00");
    });

    it("honours a different delay", () => {
        const [reminder] = build(
            [event("a", "2026-08-07T14:00:00", "2026-08-07T15:00:00")],
            30
        );

        expect(reminder.atMs).toBe(+new Date("2026-08-07T13:30:00"));
        expect(reminder.body).toBe("Dans 30 min · 14:00");
    });

    // An all-day event has no hour to be ten minutes early for.
    it("announces an all-day event the evening before", () => {
        const [reminder] = build([
            event("whole", "2026-08-09T00:00:00", "2026-08-10T00:00:00", {
                allDay: true,
            }),
        ]);

        const evening = new Date("2026-08-08T00:00:00");
        evening.setHours(ALL_DAY_REMINDER_HOUR, 0, 0, 0);
        expect(reminder.atMs).toBe(+evening);
        expect(reminder.body).toBe("Demain, toute la journée");
    });

    /*
     * Being told at 10:20 that something started at 10:00 is worse than not
     * being told: it is a notification you cannot act on, arriving as if you
     * could. A reminder whose moment has passed is dropped, not fired late.
     */
    it("drops a reminder whose moment has passed", () => {
        expect(
            build([event("a", "2026-08-07T12:05:00", "2026-08-07T13:00:00")])
        ).toEqual([]);
    });

    it("keeps one whose moment is still ahead", () => {
        expect(
            build([event("a", "2026-08-07T12:30:00", "2026-08-07T13:00:00")])
        ).toHaveLength(1);
    });

    it("schedules nothing at all when reminders are off", () => {
        expect(
            build([event("a", "2026-08-07T14:00:00", "2026-08-07T15:00:00")], 0)
        ).toEqual([]);
    });

    it("leaves someday events alone", () => {
        expect(
            build([
                event("someday", "2026-08-07T14:00:00", "2026-08-07T15:00:00", {
                    isSomeday: true,
                }),
            ])
        ).toEqual([]);
    });

    it("stops at the horizon", () => {
        expect(
            build([event("far", "2026-12-25T14:00:00", "2026-12-25T15:00:00")])
        ).toEqual([]);
    });

    // The scheduler only ever looks at the first one, so the order is the
    // contract rather than a convenience.
    it("hands them over in the order they will fire", () => {
        const reminders = build([
            event("late", "2026-08-08T18:00:00", "2026-08-08T19:00:00"),
            event("soon", "2026-08-07T14:00:00", "2026-08-07T15:00:00"),
        ]);

        expect(reminders.map((reminder) => reminder.id)).toEqual([
            "soon",
            "late",
        ]);
    });

    it("names an event that has no title", () => {
        const [reminder] = build([
            event("x", "2026-08-07T14:00:00", "2026-08-07T15:00:00", {
                title: "",
            }),
        ]);

        expect(reminder.title).toBe("Sans titre");
    });
});
