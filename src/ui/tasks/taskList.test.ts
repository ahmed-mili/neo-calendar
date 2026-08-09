import {
    collectTasks,
    buildTaskSections,
    isOverdue,
    effectiveDue,
    todayISO,
    TaskItem,
    TaskSource,
} from "./taskList";
import { NeoEvent } from "../../types";

const TODAY = "2026-08-09";

const task = (over: Partial<TaskItem> = {}): TaskItem => ({
    id: "t1",
    title: "Rappeler le proprietaire",
    date: null,
    due: null,
    status: "todo",
    completedAt: null,
    calendarId: "local::Perso",
    calendarName: "Perso",
    color: "#888",
    editable: true,
    ...over,
});

const source = (
    events: Array<{ id: string; event: NeoEvent }>
): TaskSource => ({
    id: "local::Perso",
    name: "Perso",
    color: "#888",
    editable: true,
    events,
});

// ── collectTasks ───────────────────────────────────────────

describe("collectTasks", () => {
    it("ignore les evenements qui ne sont pas des taches", () => {
        const tasks = collectTasks([
            source([
                {
                    id: "e1",
                    event: {
                        type: "single",
                        title: "Vol Geneve",
                        date: "2026-08-09",
                        endDate: null,
                        allDay: false,
                        startTime: "14:05",
                        endTime: "15:30",
                    } as NeoEvent,
                },
            ]),
        ]);
        expect(tasks).toEqual([]);
    });

    it("ramasse une tache datee avec sa date", () => {
        const tasks = collectTasks([
            source([
                {
                    id: "e1",
                    event: {
                        type: "single",
                        title: "Payer l'electricite",
                        date: "2026-08-01",
                        endDate: null,
                        allDay: true,
                        completed: false,
                    } as NeoEvent,
                },
            ]),
        ]);
        expect(tasks).toHaveLength(1);
        expect(tasks[0]).toMatchObject({
            title: "Payer l'electricite",
            date: "2026-08-01",
            status: "todo",
            completedAt: null,
            calendarName: "Perso",
        });
    });

    it("ramasse une tache sans date avec date null", () => {
        const tasks = collectTasks([
            source([
                {
                    id: "e1",
                    event: {
                        type: "someday",
                        title: "Apprendre le piano",
                        allDay: true,
                        completed: false,
                    } as NeoEvent,
                },
            ]),
        ]);
        expect(tasks[0]).toMatchObject({ date: null, status: "todo" });
    });

    it("garde l'horodatage de fin d'une tache terminee", () => {
        const tasks = collectTasks([
            source([
                {
                    id: "e1",
                    event: {
                        type: "single",
                        title: "Faire la valise",
                        date: "2026-08-08",
                        endDate: null,
                        allDay: true,
                        completed: "2026-08-08T21:14:00",
                    } as NeoEvent,
                },
            ]),
        ]);
        expect(tasks[0]).toMatchObject({
            status: "complete",
            completedAt: "2026-08-08T21:14:00",
        });
    });

    it("ne prend pas le marqueur in-progress pour un horodatage", () => {
        // "in-progress" est une chaine, mais ce n'est pas une date : la tache
        // est encore a faire et n'a pas de date de fin.
        const tasks = collectTasks([
            source([
                {
                    id: "e1",
                    event: {
                        type: "single",
                        title: "Ecrire le rapport",
                        date: "2026-08-07",
                        endDate: null,
                        allDay: true,
                        completed: "in-progress",
                    } as NeoEvent,
                },
            ]),
        ]);
        expect(tasks[0]).toMatchObject({
            status: "todo",
            completedAt: null,
        });
    });

    it("ramasse l'echeance quand la tache en porte une", () => {
        const tasks = collectTasks([
            source([
                {
                    id: "e1",
                    event: {
                        type: "single",
                        title: "Ecrire le rapport",
                        date: "2026-08-03",
                        endDate: null,
                        allDay: false,
                        startTime: "14:00",
                        endTime: "17:00",
                        completed: false,
                        due: "2026-08-07",
                    } as NeoEvent,
                },
            ]),
        ]);
        expect(tasks[0]).toMatchObject({
            date: "2026-08-03",
            due: "2026-08-07",
        });
    });

    it("met l'echeance a null quand il n'y en a pas", () => {
        const tasks = collectTasks([
            source([
                {
                    id: "e1",
                    event: {
                        type: "someday",
                        title: "Apprendre le piano",
                        allDay: true,
                        completed: false,
                    } as NeoEvent,
                },
            ]),
        ]);
        expect(tasks[0].due).toBeNull();
    });

    it("ignore les series recurrentes, qui ne peuvent pas etre des taches", () => {
        const tasks = collectTasks([
            source([
                {
                    id: "e1",
                    event: {
                        type: "recurring",
                        title: "Arroser les plantes",
                        daysOfWeek: ["M"],
                        startRecur: "2026-01-01",
                        allDay: true,
                    } as unknown as NeoEvent,
                },
            ]),
        ]);
        expect(tasks).toEqual([]);
    });
});

// ── isOverdue ──────────────────────────────────────────────

describe("isOverdue", () => {
    it("une tache d'hier non faite est en retard", () => {
        expect(isOverdue(task({ date: "2026-08-08" }), TODAY)).toBe(true);
    });

    it("une tache du jour n'est pas en retard", () => {
        expect(isOverdue(task({ date: TODAY }), TODAY)).toBe(false);
    });

    it("une tache future n'est pas en retard", () => {
        expect(isOverdue(task({ date: "2026-08-10" }), TODAY)).toBe(false);
    });

    it("une tache terminee n'est jamais en retard", () => {
        expect(
            isOverdue(task({ date: "2026-01-01", status: "complete" }), TODAY)
        ).toBe(false);
    });

    it("une tache sans date n'est jamais en retard", () => {
        expect(isOverdue(task({ date: null }), TODAY)).toBe(false);
    });
});

// ── buildTaskSections ──────────────────────────────────────

describe("buildTaskSections", () => {
    it("repartit les taches dans les trois sections", () => {
        const sections = buildTaskSections(
            [
                task({ id: "a", date: "2026-08-10" }),
                task({ id: "b", date: null }),
                task({
                    id: "c",
                    date: "2026-08-01",
                    status: "complete",
                    completedAt: "2026-08-01T10:00:00",
                }),
            ],
            TODAY
        );
        expect(sections.todo.map((t) => t.id)).toEqual(["a"]);
        expect(sections.undated.map((t) => t.id)).toEqual(["b"]);
        expect(sections.done.map((t) => t.id)).toEqual(["c"]);
    });

    it("range une tache terminee sans date dans les terminees", () => {
        // "Terminee" prime sur "sans date" : une tache faite n'est plus du
        // travail, elle ne doit pas trainer dans la pile "un jour".
        const sections = buildTaskSections(
            [task({ id: "a", date: null, status: "complete" })],
            TODAY
        );
        expect(sections.undated).toEqual([]);
        expect(sections.done.map((t) => t.id)).toEqual(["a"]);
    });

    it("fait remonter la tache la plus en retard en tete", () => {
        const sections = buildTaskSections(
            [
                task({ id: "futur", date: "2026-09-01" }),
                task({ id: "aujourdhui", date: TODAY }),
                task({ id: "vieux", date: "2026-03-15" }),
            ],
            TODAY
        );
        expect(sections.todo.map((t) => t.id)).toEqual([
            "vieux",
            "aujourdhui",
            "futur",
        ]);
    });

    it("classe les terminees de la plus recente a la plus ancienne", () => {
        const sections = buildTaskSections(
            [
                task({
                    id: "vieille",
                    status: "complete",
                    completedAt: "2026-01-02T09:00:00",
                }),
                task({
                    id: "recente",
                    status: "complete",
                    completedAt: "2026-08-08T21:14:00",
                }),
            ],
            TODAY
        );
        expect(sections.done.map((t) => t.id)).toEqual(["recente", "vieille"]);
    });

    it("renvoie en fin de liste une terminee sans horodatage", () => {
        const sections = buildTaskSections(
            [
                task({ id: "sans", status: "complete", completedAt: null }),
                task({
                    id: "avec",
                    status: "complete",
                    completedAt: "2026-01-02T09:00:00",
                }),
            ],
            TODAY
        );
        expect(sections.done.map((t) => t.id)).toEqual(["avec", "sans"]);
    });

    it("garde l'ordre des calendriers pour les taches sans date", () => {
        const sections = buildTaskSections(
            [
                task({ id: "z", title: "Zebre", date: null }),
                task({ id: "a", title: "Abricot", date: null }),
            ],
            TODAY
        );
        expect(sections.undated.map((t) => t.id)).toEqual(["z", "a"]);
    });
});

// ── L'echeance, distincte de la date ───────────────────────

describe("effectiveDue", () => {
    it("prend l'echeance quand il y en a une", () => {
        expect(
            effectiveDue(task({ date: "2026-08-03", due: "2026-08-30" }))
        ).toBe("2026-08-30");
    });

    it("retombe sur la date quand il n'y a pas d'echeance", () => {
        expect(effectiveDue(task({ date: "2026-08-03" }))).toBe("2026-08-03");
    });

    it("accepte une echeance sans date", () => {
        // "Renouveler le permis avant le 30" : rien de prevu, mais c'est du.
        expect(effectiveDue(task({ date: null, due: "2026-08-30" }))).toBe(
            "2026-08-30"
        );
    });

    it("renvoie null quand il n'y a ni l'un ni l'autre", () => {
        expect(effectiveDue(task())).toBeNull();
    });
});

describe("isOverdue avec une echeance", () => {
    it("n'est pas en retard tant que l'echeance n'est pas passee", () => {
        // Prevu le 3, du le 30 : le 9, ce n'est pas en retard. Juger sur la
        // date seule le declarerait a tort.
        expect(
            isOverdue(task({ date: "2026-08-03", due: "2026-08-30" }), TODAY)
        ).toBe(false);
    });

    it("est en retard une fois l'echeance passee", () => {
        expect(
            isOverdue(task({ date: "2026-08-01", due: "2026-08-05" }), TODAY)
        ).toBe(true);
    });

    it("est en retard sur une echeance sans date", () => {
        expect(isOverdue(task({ date: null, due: "2026-08-05" }), TODAY)).toBe(
            true
        );
    });
});

describe("buildTaskSections avec une echeance", () => {
    it("classe une tache sans date mais avec echeance dans les a faire", () => {
        const sections = buildTaskSections(
            [task({ id: "permis", date: null, due: "2026-08-30" })],
            TODAY
        );
        expect(sections.undated).toEqual([]);
        expect(sections.todo.map((t) => t.id)).toEqual(["permis"]);
    });

    it("trie sur l'echeance, pas sur la date", () => {
        // "tot" est prevu plus tard mais du plus tot : c'est lui qui presse.
        const sections = buildTaskSections(
            [
                task({ id: "tard", date: "2026-08-01", due: "2026-12-01" }),
                task({ id: "tot", date: "2026-08-20", due: "2026-08-25" }),
            ],
            TODAY
        );
        expect(sections.todo.map((t) => t.id)).toEqual(["tot", "tard"]);
    });
});

describe("todayISO", () => {
    it("formate la date locale en AAAA-MM-JJ", () => {
        // Un jour et un mois a un chiffre doivent rester sur deux caracteres,
        // sinon la comparaison lexicographique de isOverdue se casse.
        expect(todayISO(new Date(2026, 0, 5))).toBe("2026-01-05");
    });
});
