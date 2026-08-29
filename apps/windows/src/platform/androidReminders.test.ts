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

    // Existing all-day events with no own reminder list keep their pre-upgrade
    // default, so installing this version does not move a notification silently.
    it("keeps the legacy default for an all-day event with no own reminders", () => {
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

    it("fires an explicit all-day reminder at 09:00 on the same day", () => {
        const [reminder] = build([
            event("whole", "2026-08-09T00:00:00", "2026-08-10T00:00:00", {
                allDay: true,
                reminders: [-540],
            }),
        ]);

        expect(reminder.atMs).toBe(+new Date("2026-08-09T09:00:00"));
        expect(reminder.key).toBe("whole#day:-540");
        expect(reminder.body).toBe("Toute la journée");
    });

    it("fires an explicit all-day reminder at 09:00 one day before", () => {
        const [reminder] = build([
            event("whole", "2026-08-09T00:00:00", "2026-08-10T00:00:00", {
                allDay: true,
                reminders: [900],
            }),
        ]);

        expect(reminder.atMs).toBe(+new Date("2026-08-08T09:00:00"));
        expect(reminder.key).toBe("whole#day:900");
    });

    it("keeps multiple all-day reminder times instead of collapsing them to one", () => {
        const reminders = build([
            event("whole", "2026-08-09T00:00:00", "2026-08-10T00:00:00", {
                allDay: true,
                reminders: [-540, 900],
            }),
        ]);

        expect(reminders.map((item) => item.atMs)).toEqual([
            +new Date("2026-08-08T09:00:00"),
            +new Date("2026-08-09T09:00:00"),
        ]);
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

/*
 * The setting in the preferences is the default, not the law: an event that
 * carries its own reminders is announced on its own terms, and an event that
 * carries an empty list has asked for silence.
 */
describe("reminders an event carries itself", () => {
    it("uses the event's own delay rather than the default", () => {
        const [reminder] = build([
            event("a", "2026-08-07T14:00:00", "2026-08-07T15:00:00", {
                reminders: [30],
            }),
        ]);

        expect(reminder.atMs).toBe(+new Date("2026-08-07T13:30:00"));
        expect(reminder.body).toBe("Dans 30 min · 14:00");
    });

    it("announces the event once per reminder, soonest last", () => {
        const reminders = build([
            event("a", "2026-08-07T16:00:00", "2026-08-07T17:00:00", {
                reminders: [10, 60],
            }),
        ]);

        expect(reminders.map((item) => item.atMs)).toEqual([
            +new Date("2026-08-07T15:00:00"),
            +new Date("2026-08-07T15:50:00"),
        ]);
    });

    // The phone tells them apart by key, and opens the event by id.
    it("gives each of them its own key and the same event id", () => {
        const reminders = build([
            event("a", "2026-08-07T16:00:00", "2026-08-07T17:00:00", {
                reminders: [10, 60],
            }),
        ]);

        expect(reminders.map((item) => item.key)).toEqual(["a#60", "a#10"]);
        expect(reminders.map((item) => item.id)).toEqual(["a", "a"]);
    });

    it("says so when the reminder is the event itself starting", () => {
        const [reminder] = build([
            event("a", "2026-08-07T14:00:00", "2026-08-07T15:00:00", {
                reminders: [0],
            }),
        ]);

        expect(reminder.atMs).toBe(+new Date("2026-08-07T14:00:00"));
        expect(reminder.body).toBe("Ça commence · 14:00");
    });

    it("counts an hour out in hours", () => {
        const [reminder] = build([
            event("a", "2026-08-07T16:00:00", "2026-08-07T17:00:00", {
                reminders: [60],
            }),
        ]);

        expect(reminder.body).toBe("Dans 1 h · 16:00");
    });

    it("stays quiet for an event that asked for silence", () => {
        expect(
            build([
                event("a", "2026-08-07T14:00:00", "2026-08-07T15:00:00", {
                    reminders: [],
                }),
            ])
        ).toEqual([]);
    });

    it("keeps an all-day event quiet when its own reminder list is empty", () => {
        expect(
            build([
                event("whole", "2026-08-09T00:00:00", "2026-08-10T00:00:00", {
                    allDay: true,
                    reminders: [],
                }),
            ])
        ).toEqual([]);
    });

    // The setting says "no reminder", but this event asked for one.
    it("speaks up for an event of its own even with reminders off", () => {
        expect(
            build(
                [
                    event("a", "2026-08-07T14:00:00", "2026-08-07T15:00:00", {
                        reminders: [10],
                    }),
                ],
                0
            )
        ).toHaveLength(1);
    });

    it("also honours an all-day event's own reminder when defaults are off", () => {
        expect(
            build(
                [
                    event(
                        "whole",
                        "2026-08-09T00:00:00",
                        "2026-08-10T00:00:00",
                        {
                            allDay: true,
                            reminders: [-540],
                        }
                    ),
                ],
                0
            )
        ).toHaveLength(1);
    });
});
