import {
    isTask,
    getTaskStatus,
    setTaskStatus,
    cycleTaskStatus,
    isSeries,
    getOccurrenceStatus,
    setOccurrenceStatus,
    parseOccurrenceId,
} from "./index";
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

// ── Les occurrences d'une serie ────────────────────────────

const taskSeries = (over: Record<string, unknown> = {}): NeoEvent =>
    ({
        type: "recurring",
        title: "Arroser les plantes",
        daysOfWeek: ["T"],
        startRecur: "2026-01-01",
        allDay: true,
        completed: false,
        ...over,
    } as unknown as NeoEvent);

describe("isSeries", () => {
    it("reconnait une serie recurrente", () => {
        expect(isSeries(taskSeries())).toBe(true);
    });

    it("ne prend pas un evenement date pour une serie", () => {
        expect(
            isSeries({
                type: "single",
                title: "Vol",
                date: "2026-08-09",
                endDate: null,
                allDay: true,
            } as NeoEvent)
        ).toBe(false);
    });
});

describe("isTask sur une serie", () => {
    it("une serie portant completed est une tache", () => {
        expect(isTask(taskSeries())).toBe(true);
    });

    it("une serie sans completed n'en est pas une", () => {
        expect(isTask(taskSeries({ completed: undefined }))).toBe(false);
    });
});

describe("getOccurrenceStatus", () => {
    it("une occurrence non listee est a faire", () => {
        expect(getOccurrenceStatus(taskSeries(), "2026-08-11")).toBe("todo");
    });

    it("une occurrence listee est terminee", () => {
        expect(
            getOccurrenceStatus(
                taskSeries({ completedDates: ["2026-08-11"] }),
                "2026-08-11"
            )
        ).toBe("complete");
    });

    it("ne renvoie rien pour une serie qui n'est pas une tache", () => {
        expect(
            getOccurrenceStatus(
                taskSeries({ completed: undefined }),
                "2026-08-11"
            )
        ).toBeNull();
    });
});

describe("setOccurrenceStatus", () => {
    it("cocher un mardi ne coche pas les autres mardis", () => {
        // C'est LA raison d'etre de completedDates : une serie, un champ,
        // plusieurs occurrences.
        const after = setOccurrenceStatus(
            taskSeries(),
            "2026-08-11",
            "complete"
        );
        expect(getOccurrenceStatus(after, "2026-08-11")).toBe("complete");
        expect(getOccurrenceStatus(after, "2026-08-18")).toBe("todo");
        expect(getOccurrenceStatus(after, "2026-08-04")).toBe("todo");
    });

    it("decocher ne retire que le jour vise", () => {
        const before = taskSeries({
            completedDates: ["2026-08-04", "2026-08-11"],
        });
        const after = setOccurrenceStatus(before, "2026-08-11", "todo");
        expect((after as { completedDates?: string[] }).completedDates).toEqual(
            ["2026-08-04"]
        );
    });

    it("garde la liste triee pour ne pas brasser la note", () => {
        let e = setOccurrenceStatus(taskSeries(), "2026-08-18", "complete");
        e = setOccurrenceStatus(e, "2026-08-04", "complete");
        expect((e as { completedDates?: string[] }).completedDates).toEqual([
            "2026-08-04",
            "2026-08-18",
        ]);
    });

    it("cocher deux fois le meme jour ne le duplique pas", () => {
        let e = setOccurrenceStatus(taskSeries(), "2026-08-11", "complete");
        e = setOccurrenceStatus(e, "2026-08-11", "complete");
        expect((e as { completedDates?: string[] }).completedDates).toEqual([
            "2026-08-11",
        ]);
    });

    it("ne modifie pas la serie d'origine", () => {
        const before = taskSeries();
        setOccurrenceStatus(before, "2026-08-11", "complete");
        expect(
            (before as { completedDates?: string[] }).completedDates
        ).toBeUndefined();
    });
});

describe("parseOccurrenceId", () => {
    it("separe la serie du jour", () => {
        expect(parseOccurrenceId("local::Perso::plantes_2026-08-11")).toEqual({
            storedId: "local::Perso::plantes",
            date: "2026-08-11",
        });
    });

    it("renvoie null pour un identifiant simple", () => {
        expect(parseOccurrenceId("local::Perso::vol")).toBeNull();
    });

    it("renvoie null quand le suffixe n'est pas une date", () => {
        expect(parseOccurrenceId("local::Perso::salle_204")).toBeNull();
    });
});
