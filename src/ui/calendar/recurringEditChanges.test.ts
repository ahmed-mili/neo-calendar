import { NeoEvent } from "../../types";
import { recurringEditChanges } from "./recurringEditChanges";

const series = (extra: Record<string, unknown> = {}): NeoEvent =>
    ({
        title: "Standup",
        allDay: false,
        startTime: "08:00",
        endTime: "08:30",
        type: "rrule",
        startDate: "2026-08-05",
        rrule: "FREQ=WEEKLY;BYDAY=WE",
        description: "Tour de table",
        reminders: [10],
        ...extra,
    } as unknown as NeoEvent);

describe("recurringEditChanges", () => {
    it("lists only fields that really changed", () => {
        const changes = recurringEditChanges(
            series(),
            series({
                title: "Client demo",
                startTime: "09:00",
                description: "Demo and questions",
            })
        );

        expect(changes.map((change) => change.key)).toEqual([
            "title",
            "startTime",
            "description",
        ]);
        expect(changes[0]).toMatchObject({
            before: "Standup",
            after: "Client demo",
        });
    });

    it("omits unchanged recurrence and reports a semantic recurrence change", () => {
        expect(
            recurringEditChanges(series(), series()).map((change) => change.key)
        ).not.toContain("repeat");

        const changed = recurringEditChanges(
            series(),
            series({ rrule: "FREQ=DAILY" })
        );
        expect(changed.map((change) => change.key)).toContain("repeat");
    });

    it("reports calendar, reminders, all-day and task-status changes readably", () => {
        const changes = recurringEditChanges(
            series(),
            series({
                allDay: true,
                startTime: undefined,
                endTime: undefined,
                completed: false,
                reminders: [60],
            }),
            {
                previousCalendarId: "work",
                nextCalendarId: "personal",
                previousCalendarLabel: "Work",
                nextCalendarLabel: "Personal",
            }
        );

        expect(changes).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    key: "allDay",
                    before: "Off",
                    after: "On",
                }),
                expect.objectContaining({
                    key: "calendar",
                    before: "Work",
                    after: "Personal",
                }),
                expect.objectContaining({
                    key: "status",
                    before: "Event",
                    after: "To do",
                }),
                expect.objectContaining({
                    key: "reminders",
                    after: "1 hour before",
                }),
            ])
        );
    });

    it("shortens long description values so the dialog cannot grow horizontally", () => {
        const changes = recurringEditChanges(
            series(),
            series({ description: "x".repeat(120) })
        );
        const description = changes.find(
            (change) => change.key === "description"
        );
        expect(description?.after.endsWith("…")).toBe(true);
        expect(description?.after.length).toBeLessThanOrEqual(72);
    });
});
