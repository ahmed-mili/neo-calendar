import { completedFor, dueFor } from "./useEventFormState";
import { isTask } from "../tasks";
import { NeoEvent } from "../../types";

// Un evenement date, construit comme le fait buildPayload : c'est le champ
// `completed` qui decide, a lui seul, si l'entree est une tache.
const dated = (completed: string | false | undefined): NeoEvent =>
    ({
        type: "single",
        title: "Vol Geneve",
        date: "2026-08-09",
        endDate: null,
        allDay: false,
        startTime: "14:05",
        endTime: "15:30",
        completed,
    } as NeoEvent);

describe("completedFor", () => {
    it("ne pose aucun champ quand ce n'est pas une tache", () => {
        expect(completedFor(null)).toBeUndefined();
    });

    it("marque une tache a faire", () => {
        expect(completedFor("todo")).toBe(false);
    });

    it("horodate une tache terminee", () => {
        expect(completedFor("complete", () => "2026-08-09T04:00:00")).toBe(
            "2026-08-09T04:00:00"
        );
    });
});

describe("dueFor", () => {
    it("garde l'echeance d'une tache", () => {
        expect(dueFor("todo", "2026-08-30")).toBe("2026-08-30");
    });

    it("garde l'echeance d'une tache terminee", () => {
        expect(dueFor("complete", "2026-08-30")).toBe("2026-08-30");
    });

    it("ne pose rien quand la tache n'a pas d'echeance", () => {
        expect(dueFor("todo", null)).toBeUndefined();
    });

    it("laisse tomber l'echeance quand ce n'est plus une tache", () => {
        // Un evenement n'a pas d'echeance : il EST sa date. Basculer en
        // evenement ne doit pas laisser une cle orpheline dans la note.
        expect(dueFor(null, "2026-08-30")).toBeUndefined();
    });
});

describe("le type choisi survit a l'enregistrement", () => {
    // Regression : la branche datee ecrivait `false` en dur, donc tout
    // evenement date ressortait en tache — le reglage et le choix de
    // l'utilisateur etaient ignores.
    it("un evenement date reste un evenement", () => {
        expect(isTask(dated(completedFor(null)))).toBe(false);
    });

    it("une tache datee reste une tache", () => {
        expect(isTask(dated(completedFor("todo")))).toBe(true);
    });

    it("une tache datee terminee reste une tache", () => {
        expect(isTask(dated(completedFor("complete")))).toBe(true);
    });
});
