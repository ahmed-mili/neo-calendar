import {
    completedFor,
    dueFor,
    isDraftHandover,
    remindersFor,
} from "./useEventFormState";
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

describe("nommer un brouillon ne recharge pas le panneau", () => {
    // Regression : au premier caractere, le brouillon part a l'ecriture et le
    // panneau se retrouve un instant sans brouillon NI identifiant. Recharger
    // le formulaire sur cet instant-la, c'est le vider puis le remplir — ce que
    // l'on voyait comme un rechargement du panneau de creation.
    it("garde ce qui est tape pendant l'ecriture du fichier", () => {
        expect(isDraftHandover("__draft__", null, true)).toBe(true);
    });

    it("garde ce qui est tape quand l'identifiant arrive", () => {
        expect(isDraftHandover("__draft__", "cal::event.md", false)).toBe(true);
    });

    it("recharge quand le brouillon est abandonne sans etre ecrit", () => {
        expect(isDraftHandover("__draft__", null, false)).toBe(false);
    });

    it("recharge quand c'est un autre evenement que l'on ouvre", () => {
        expect(isDraftHandover("cal::a.md", "cal::b.md", false)).toBe(false);
        expect(isDraftHandover(null, "cal::b.md", false)).toBe(false);
        // Meme en pleine ecriture d'un brouillon : ce qui etait affiche avant
        // n'etait pas ce brouillon-la.
        expect(isDraftHandover("cal::a.md", null, true)).toBe(false);
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

describe("remindersFor", () => {
    // Ne rien avoir demande et avoir demande le silence ne disent pas la meme
    // chose : sans cle, le rappel des reglages s'applique ; avec une liste
    // vide, l'evenement a demande qu'on le laisse tranquille.
    it("n'ecrit aucune cle quand l'evenement n'a jamais rien demande", () => {
        expect(remindersFor(undefined)).toBeUndefined();
    });

    it("ecrit la liste vide d'un evenement qui veut le silence", () => {
        expect(remindersFor([])).toEqual([]);
    });

    it("garde les rappels poses sur l'evenement", () => {
        expect(remindersFor([0, 30])).toEqual([0, 30]);
    });
});
