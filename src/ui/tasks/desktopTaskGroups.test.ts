import {
    buildDesktopTaskGroups,
    hasTaskCompletionDate,
    normalizedDesktopTaskStatus,
} from "./desktopTaskGroups";
import { TaskItem } from "./taskList";

const task = (overrides: Partial<TaskItem>): TaskItem => ({
    id: "task",
    title: "Task",
    date: null,
    due: null,
    status: "todo",
    completedAt: null,
    calendarId: "calendar",
    calendarName: "Calendar",
    color: "#000000",
    editable: true,
    ...overrides,
});

describe("desktop task grouping rules", () => {
    it("recognizes a completion date from either date or due", () => {
        expect(hasTaskCompletionDate(null, null)).toBe(false);
        expect(hasTaskCompletionDate("2026-08-31", null)).toBe(true);
        expect(hasTaskCompletionDate(null, "2026-09-03")).toBe(true);
    });

    it("normalizes a complete task without a date to todo", () => {
        const undatedComplete = task({
            id: "undated-complete",
            status: "complete",
            completedAt: "2026-08-31T10:00:00.000Z",
        });

        expect(normalizedDesktopTaskStatus(undatedComplete)).toBe("todo");
        expect(
            normalizedDesktopTaskStatus(
                task({
                    status: "complete",
                    date: "2026-08-31",
                })
            )
        ).toBe("complete");
    });

    it("groups dated and undated tasks and orders each section", () => {
        const input = [
            task({ id: "future", date: "2026-09-05" }),
            task({
                id: "recent-complete",
                date: "2026-08-30",
                status: "complete",
                completedAt: "2026-08-31T12:00:00.000Z",
            }),
            task({ id: "overdue", due: "2026-08-01", date: null }),
            task({ id: "undated", date: null, due: null }),
            task({
                id: "invalid-complete",
                date: null,
                due: null,
                status: "complete",
                completedAt: "2026-08-30T12:00:00.000Z",
            }),
        ];

        const groups = buildDesktopTaskGroups(input);

        expect(groups.todo.map(({ id }) => id)).toEqual([
            "overdue",
            "future",
            "undated",
            "invalid-complete",
        ]);
        expect(groups.complete.map(({ id }) => id)).toEqual([
            "recent-complete",
        ]);
        expect(
            groups.todo.find(({ id }) => id === "invalid-complete")
        ).toMatchObject({
            status: "todo",
            completedAt: null,
        });
    });

    it("sorts completed tasks newest first and keeps null timestamps last", () => {
        const groups = buildDesktopTaskGroups([
            task({
                id: "no-timestamp",
                date: "2026-08-01",
                status: "complete",
                completedAt: null,
            }),
            task({
                id: "older",
                date: "2026-08-01",
                status: "complete",
                completedAt: "2026-08-30T10:00:00.000Z",
            }),
            task({
                id: "newer",
                date: "2026-08-01",
                status: "complete",
                completedAt: "2026-08-31T10:00:00.000Z",
            }),
        ]);

        expect(groups.complete.map(({ id }) => id)).toEqual([
            "newer",
            "older",
            "no-timestamp",
        ]);
    });
});
