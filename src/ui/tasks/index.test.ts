import { isTask, getTaskStatus, setTaskStatus, cycleTaskStatus } from "./index";
import { NeoEvent } from "src/types";

const someday = {
    title: "Read that paper",
    type: "someday",
    allDay: true,
    completed: false,
} as unknown as NeoEvent;

const oneOff = {
    title: "Standup",
    type: "single",
    allDay: false,
    date: "2026-07-29",
    startTime: "08:00",
    endTime: "08:30",
    completed: false,
} as unknown as NeoEvent;

const series = {
    title: "Standup",
    type: "recurring",
    allDay: false,
    daysOfWeek: ["M"],
} as unknown as NeoEvent;

describe("unscheduled events as tasks", () => {
    // A someday event carries `completed` in the schema, and the someday panel
    // draws a checkbox for it. Refusing to tick it made that checkbox a lie.
    it("counts an unscheduled event carrying a status as a task", () => {
        expect(isTask(someday)).toBe(true);
    });

    it("reads its status", () => {
        expect(getTaskStatus(someday)).toBe("todo");
    });

    it("ticks it off", () => {
        const done = setTaskStatus(someday, "complete");
        expect(getTaskStatus(done)).toBe("complete");
    });

    it("ticks it back", () => {
        const done = cycleTaskStatus(someday);
        expect(getTaskStatus(cycleTaskStatus(done))).toBe("todo");
    });
});

describe("what is not a task", () => {
    it("a recurring series has nowhere to record done", () => {
        expect(isTask(series)).toBe(false);
        expect(getTaskStatus(series)).toBeNull();
        expect(setTaskStatus(series, "complete")).toBe(series);
    });

    it("a one-off with a status still is one", () => {
        expect(isTask(oneOff)).toBe(true);
        expect(getTaskStatus(cycleTaskStatus(oneOff))).toBe("complete");
    });
});
