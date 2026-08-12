import {
    formatSubtask,
    parseSubtask,
    readSubtasks,
    subtaskProgress,
    writeSubtasks,
} from "./subtasks";
import { NeoEvent, validateEvent } from "../../types";

const task = (subtasks?: unknown): NeoEvent =>
    ({
        type: "single",
        title: "Move house",
        date: "2026-08-12",
        endDate: null,
        allDay: true,
        completed: false,
        subtasks,
    } as unknown as NeoEvent);

describe("parseSubtask", () => {
    it("reads a step that is still to do", () => {
        expect(parseSubtask("[ ] Pack the kitchen")).toEqual({
            title: "Pack the kitchen",
            done: false,
        });
    });

    it("reads a step that is done", () => {
        expect(parseSubtask("[x] Book the van")).toEqual({
            title: "Book the van",
            done: true,
        });
    });

    // The same marks an event's own checkbox understands: a plugin that writes
    // `[/]` must not read back as finished.
    it("treats the in-progress marks as still outstanding", () => {
        expect(parseSubtask("[/] Pack").done).toBe(false);
        expect(parseSubtask("[~] Pack").done).toBe(false);
    });

    it("takes a tick drawn with any other character as done", () => {
        expect(parseSubtask("[X] Pack").done).toBe(true);
        expect(parseSubtask("[✓] Pack").done).toBe(true);
    });

    it("takes a line written without a box as a step not started", () => {
        expect(parseSubtask("Call the landlord")).toEqual({
            title: "Call the landlord",
            done: false,
        });
    });
});

describe("formatSubtask", () => {
    it("writes the box the parser reads", () => {
        expect(formatSubtask({ title: "Pack", done: false })).toBe("[ ] Pack");
        expect(formatSubtask({ title: "Pack", done: true })).toBe("[x] Pack");
    });

    it("round-trips a title that has brackets of its own", () => {
        const step = { title: "Read [the lease]", done: true };
        expect(parseSubtask(formatSubtask(step))).toEqual(step);
    });
});

describe("readSubtasks", () => {
    it("reads the list an event carries", () => {
        expect(readSubtasks(task(["[x] Book the van", "[ ] Pack"]))).toEqual([
            { title: "Book the van", done: true },
            { title: "Pack", done: false },
        ]);
    });

    it("has nothing to show for an event with no list", () => {
        expect(readSubtasks(task())).toEqual([]);
        expect(readSubtasks(null)).toEqual([]);
    });

    // A note is a text file someone can edit. None of these should cost them
    // the rest of their steps.
    it("survives a list edited by hand into something else", () => {
        expect(readSubtasks(task("[ ] Pack"))).toEqual([
            { title: "Pack", done: false },
        ]);
        expect(readSubtasks(task(["[ ] Pack", 42, "", "   "]))).toEqual([
            { title: "Pack", done: false },
        ]);
        expect(readSubtasks(task(7))).toEqual([]);
    });
});

describe("writeSubtasks", () => {
    it("writes the lines back", () => {
        expect(
            writeSubtasks([
                { title: "Book the van", done: true },
                { title: "Pack", done: false },
            ])
        ).toEqual(["[x] Book the van", "[ ] Pack"]);
    });

    // Nothing rather than an empty list: that is what takes the key out of the
    // note when the last step is deleted, instead of leaving `subtasks: []`
    // behind on every event ever opened.
    it("carries no list at all when there are no steps", () => {
        expect(writeSubtasks([])).toBeUndefined();
        expect(writeSubtasks([{ title: "   ", done: false }])).toBeUndefined();
    });

    it("keeps the event valid", () => {
        const written = writeSubtasks([{ title: "Pack", done: false }]);
        expect(validateEvent(task(written))?.subtasks).toEqual(["[ ] Pack"]);
    });
});

describe("subtaskProgress", () => {
    it("counts what is done out of what there is", () => {
        expect(
            subtaskProgress([
                { title: "a", done: true },
                { title: "b", done: false },
                { title: "c", done: true },
            ])
        ).toEqual({ done: 2, total: 3 });
    });

    it("does not count a step still being typed", () => {
        expect(
            subtaskProgress([
                { title: "a", done: true },
                { title: "", done: false },
            ])
        ).toEqual({ done: 1, total: 1 });
    });
});
