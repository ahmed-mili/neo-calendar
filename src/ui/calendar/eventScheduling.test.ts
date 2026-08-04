import { NeoEvent } from "../../types";
import { DisplayEvent } from "../types";
import {
    buildScheduledPayload,
    buildUnscheduledPayload,
    canScheduleByDrag,
    canUnschedule,
    mergeForSave,
} from "./eventScheduling";

const someday = (): NeoEvent =>
    ({
        title: "Reviser",
        type: "someday",
        allDay: true,
        completed: false,
    } as NeoEvent);

const single = (): NeoEvent =>
    ({
        title: "Reviser",
        type: "single",
        date: "2026-07-22",
        endDate: null,
        allDay: false,
        startTime: "09:30",
        endTime: "10:00",
        completed: false,
    } as NeoEvent);

/** Un someday qui n'est PAS une tache : `completed` est absent, et `isTask` est
    derive de la seule presence de la cle. */
const plainSomeday = (): NeoEvent =>
    ({
        title: "Reviser",
        type: "someday",
        allDay: true,
    } as unknown as NeoEvent);

/** Un evenement date ordinaire, sans `completed`. */
const plainSingle = (): NeoEvent =>
    ({
        title: "Reviser",
        type: "single",
        date: "2026-07-22",
        endDate: null,
        allDay: false,
        startTime: "09:30",
        endTime: "10:00",
    } as unknown as NeoEvent);

/** Carte du panneau. Par defaut : non planifiee, calendrier editable. */
const card = (over: Partial<DisplayEvent> = {}): DisplayEvent =>
    ({
        id: "e1",
        title: "Reviser",
        start: new Date(2026, 6, 22),
        end: new Date(2026, 6, 22),
        allDay: true,
        editable: true,
        isSomeday: true,
        ...over,
    } as DisplayEvent);

describe("buildScheduledPayload", () => {
    it("convertit un someday en evenement timed", () => {
        const out = buildScheduledPayload(
            someday(),
            new Date(2026, 6, 22, 9, 30),
            new Date(2026, 6, 22, 10, 0),
            false
        ) as Record<string, unknown>;
        expect(out.type).toBe("single");
        expect(out.date).toBe("2026-07-22");
        expect(out.allDay).toBe(false);
        expect(out.startTime).toBe("09:30");
        expect(out.endTime).toBe("10:00");
        expect(out.endDate).toBeNull();
    });

    it("convertit un someday en evenement all-day sans heures", () => {
        const out = buildScheduledPayload(
            someday(),
            new Date(2026, 6, 22),
            new Date(2026, 6, 23),
            true
        ) as Record<string, unknown>;
        expect(out.allDay).toBe(true);
        expect(out.startTime).toBeUndefined();
        expect(out.endTime).toBeUndefined();
        expect(out.endDate).toBeNull();
    });

    it("conserve le titre, la description et l'etat de tache", () => {
        const base = { ...someday(), description: "chapitre 3" } as NeoEvent;
        const out = buildScheduledPayload(
            base,
            new Date(2026, 6, 22, 9, 30),
            new Date(2026, 6, 22, 10, 0),
            false
        ) as Record<string, unknown>;
        expect(out.title).toBe("Reviser");
        expect(out.description).toBe("chapitre 3");
        expect(out.completed).toBe(false);
    });

    it("n'ajoute pas completed a un evenement qui n'est pas une tache", () => {
        // `isTask` est derive de la presence de la cle : l'ajouter a false
        // transformerait un evenement ordinaire en tache "to do".
        const out = buildScheduledPayload(
            plainSomeday(),
            new Date(2026, 6, 22, 9, 30),
            new Date(2026, 6, 22, 10, 0),
            false
        ) as Record<string, unknown>;
        expect("completed" in out).toBe(false);
    });
});

describe("buildUnscheduledPayload", () => {
    it("retire la date et les heures", () => {
        const out = buildUnscheduledPayload(single()) as Record<
            string,
            unknown
        >;
        expect(out.type).toBe("someday");
        expect(out.allDay).toBe(true);
        expect("date" in out).toBe(false);
        expect("endDate" in out).toBe(false);
        expect("startTime" in out).toBe(false);
        expect("endTime" in out).toBe(false);
    });

    it("conserve le titre et l'etat de tache", () => {
        const base = {
            ...single(),
            completed: "2026-07-01T10:00:00",
        } as NeoEvent;
        const out = buildUnscheduledPayload(base) as Record<string, unknown>;
        expect(out.title).toBe("Reviser");
        expect(out.completed).toBe("2026-07-01T10:00:00");
    });

    it("n'ajoute pas completed a un evenement qui n'est pas une tache", () => {
        const out = buildUnscheduledPayload(plainSingle()) as Record<
            string,
            unknown
        >;
        expect("completed" in out).toBe(false);
    });
});

describe("canScheduleByDrag", () => {
    it("accepte une carte non planifiee sur un calendrier editable", () => {
        expect(canScheduleByDrag(card())).toBe(true);
    });

    it("refuse une carte deja planifiee", () => {
        // Un evenement date serait tronque a la duree de depot, ou effondre sur
        // un seul jour s'il etait multi-jours.
        expect(canScheduleByDrag(card({ isSomeday: false }))).toBe(false);
    });

    it("refuse une occurrence de serie recurrente", () => {
        // Le glisser remplacerait la note de la serie entiere par un evenement
        // unique : rrule, daysOfWeek et skipDates perdus.
        expect(
            canScheduleByDrag(card({ isSomeday: false, isRecurring: true }))
        ).toBe(false);
    });

    it("refuse une carte d'un calendrier en lecture seule", () => {
        expect(canScheduleByDrag(card({ editable: false }))).toBe(false);
    });
});

describe("canUnschedule", () => {
    it("accepte un evenement unique", () => {
        expect(canUnschedule(single())).toBe(true);
    });

    it("refuse un evenement recurrent", () => {
        const rec = {
            title: "x",
            type: "recurring",
            daysOfWeek: ["M"],
        } as unknown as NeoEvent;
        expect(canUnschedule(rec)).toBe(false);
    });

    it("refuse une rrule", () => {
        const rr = {
            title: "x",
            type: "rrule",
            startDate: "2026-07-01",
            rrule: "FREQ=DAILY",
            skipDates: [],
        } as unknown as NeoEvent;
        expect(canUnschedule(rr)).toBe(false);
    });

    it("refuse un someday, il est deja non planifie", () => {
        expect(canUnschedule(someday())).toBe(false);
    });
});

describe("mergeForSave", () => {
    it("retire les cles de l'ancien type avant la fusion", () => {
        const merged = mergeForSave(
            single(),
            buildUnscheduledPayload(single())
        ) as Record<string, unknown>;
        expect("date" in merged).toBe(false);
        expect("endDate" in merged).toBe(false);
    });

    it("interdit les heures sur un all-day", () => {
        const merged = mergeForSave(single(), {
            title: "Reviser",
            type: "single",
            date: "2026-07-22",
            endDate: null,
            allDay: true,
            completed: false,
        } as NeoEvent) as Record<string, unknown>;
        expect("startTime" in merged).toBe(false);
        expect("endTime" in merged).toBe(false);
    });
});
