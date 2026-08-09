import {
    isMisfiledEvent,
    asPlainEvent,
    findMisfiledEvents,
} from "./misfiledEvents";
import { isTask } from "./index";
import { NeoEvent } from "../../types";

const timed = (over: Record<string, unknown> = {}): NeoEvent =>
    ({
        type: "single",
        title: "Vol Geneve",
        date: "2026-08-09",
        endDate: null,
        allDay: false,
        startTime: "14:05",
        endTime: "15:30",
        completed: false,
        ...over,
    } as NeoEvent);

describe("isMisfiledEvent", () => {
    it("reconnait un evenement horaire marque comme tache", () => {
        expect(isMisfiledEvent(timed())).toBe(true);
    });

    it("laisse une tache sur toute la journee", () => {
        // "Renouveler le permis" le 30 : c'est a quoi ressemble une vraie
        // tache datee, on n'y touche pas.
        expect(
            isMisfiledEvent(
                timed({
                    allDay: true,
                    startTime: undefined,
                    endTime: undefined,
                })
            )
        ).toBe(false);
    });

    it("laisse une entree qui n'a pas d'heure de fin", () => {
        // Un seul instant, pas une plage : c'est la forme d'une tache.
        expect(isMisfiledEvent(timed({ endTime: null }))).toBe(false);
    });

    it("laisse une tache terminee, meme horaire", () => {
        // L'horodatage de fin est une information reelle ; aucune commande de
        // masse ne doit pouvoir l'effacer.
        expect(
            isMisfiledEvent(timed({ completed: "2026-08-09T16:00:00" }))
        ).toBe(false);
    });

    it("laisse une tache portant une echeance", () => {
        // Le bug n'ecrivait que `completed`. Une echeance a ete saisie a la
        // main : c'est donc une vraie tache, meme avec des horaires.
        expect(isMisfiledEvent(timed({ due: "2026-08-30" }))).toBe(false);
    });

    it("laisse une tache en cours", () => {
        expect(isMisfiledEvent(timed({ completed: "in-progress" }))).toBe(
            false
        );
    });

    it("laisse un evenement qui n'est deja plus une tache", () => {
        expect(isMisfiledEvent(timed({ completed: undefined }))).toBe(false);
    });

    it("laisse une entree sans date", () => {
        expect(
            isMisfiledEvent({
                type: "someday",
                title: "Apprendre le piano",
                allDay: true,
                completed: false,
            } as NeoEvent)
        ).toBe(false);
    });

    it("laisse une serie recurrente", () => {
        expect(
            isMisfiledEvent({
                type: "recurring",
                title: "Arroser les plantes",
                daysOfWeek: ["M"],
                startRecur: "2026-01-01",
                allDay: false,
                startTime: "09:00",
                endTime: "09:15",
            } as unknown as NeoEvent)
        ).toBe(false);
    });
});

describe("asPlainEvent", () => {
    it("retire completed et ne garde rien d'autre en moins", () => {
        const before = timed({ location: "Aeroport" });
        const after = asPlainEvent(before);
        expect("completed" in (after as object)).toBe(false);
        expect(after).toMatchObject({
            type: "single",
            title: "Vol Geneve",
            date: "2026-08-09",
            startTime: "14:05",
            endTime: "15:30",
            location: "Aeroport",
        });
    });

    it("le resultat n'est plus une tache", () => {
        expect(isTask(asPlainEvent(timed()))).toBe(false);
    });

    it("retire aussi l'echeance", () => {
        // Un evenement n'a pas d'echeance : la laisser serait une cle orpheline
        // decrivant une promesse que l'entree ne peut plus tenir.
        const after = asPlainEvent(timed({ due: "2026-08-30" }));
        expect("due" in (after as object)).toBe(false);
    });

    it("ne modifie pas l'objet d'origine", () => {
        const before = timed();
        asPlainEvent(before);
        expect((before as { completed?: unknown }).completed).toBe(false);
    });
});

describe("findMisfiledEvents", () => {
    it("ne propose que les entrees convertibles", () => {
        const found = findMisfiledEvents([
            {
                editable: true,
                events: [
                    { id: "vol", event: timed() },
                    { id: "permis", event: timed({ allDay: true }) },
                    {
                        id: "fait",
                        event: timed({ completed: "2026-01-01T09:00:00" }),
                    },
                ],
            },
        ]);
        expect(found.map((c) => c.id)).toEqual(["vol"]);
    });

    it("ignore les calendriers en lecture seule", () => {
        // Un .ics abonne ne peut pas etre reecrit : le proposer echouerait.
        const found = findMisfiledEvents([
            { editable: false, events: [{ id: "vol", event: timed() }] },
        ]);
        expect(found).toEqual([]);
    });
});
