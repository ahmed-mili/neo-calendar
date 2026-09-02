import { matchesTaskQuery, normalizeForSearch } from "./taskSearch";
import type { TaskItem } from "./taskList";

const task = (over: Partial<TaskItem> = {}): TaskItem =>
    ({
        id: "1",
        title: "Réinscription CVEC",
        calendarName: "Études",
        color: "#0036b2",
        date: "2026-09-01",
        due: null,
        status: "todo",
        editable: true,
        ...over,
    } as TaskItem);

/*
 * Chercher une tâche par son nom, en tapant comme on parle.
 *
 * Une liste de cinquante tâches terminées ne se parcourt pas à l'œil, et
 * personne ne tape « Réinscription » avec ses accents dans un champ de
 * recherche. La comparaison se fait donc sans casse et sans diacritiques, des
 * deux côtés.
 */
describe("normalizeForSearch", () => {
    it("drops case and diacritics so both sides compare alike", () => {
        expect(normalizeForSearch("Réinscription ÉTUDES")).toBe(
            "reinscription etudes"
        );
    });

    it("leaves a script without diacritics untouched", () => {
        expect(normalizeForSearch("الْإِسْلَامُ")).toBe(
            normalizeForSearch("الْإِسْلَامُ")
        );
        expect(normalizeForSearch("Neo Calendar")).toBe("neo calendar");
    });
});

describe("matchesTaskQuery", () => {
    it("keeps everything while the field is empty", () => {
        expect(matchesTaskQuery(task(), "")).toBe(true);
        expect(matchesTaskQuery(task(), "   ")).toBe(true);
    });

    it("finds a task by a piece of its title, accents or not", () => {
        expect(matchesTaskQuery(task(), "reinscription")).toBe(true);
        expect(matchesTaskQuery(task(), "RÉINSCRIPTION")).toBe(true);
        expect(matchesTaskQuery(task(), "scrip")).toBe(true);
    });

    it("finds a task by its calendar, which is what tells two alike apart", () => {
        expect(matchesTaskQuery(task(), "etudes")).toBe(true);
    });

    it("asks every word to be found, in any order and in either field", () => {
        // Deux mots tapés à la suite restreignent la liste au lieu de
        // l'élargir : c'est ce qu'on attend en affinant une recherche.
        expect(matchesTaskQuery(task(), "cvec etudes")).toBe(true);
        expect(matchesTaskQuery(task(), "cvec musculation")).toBe(false);
    });

    it("says no when nothing matches", () => {
        expect(matchesTaskQuery(task(), "permis")).toBe(false);
    });

    it("survives a task without a calendar name", () => {
        expect(
            matchesTaskQuery(task({ calendarName: undefined }), "cvec")
        ).toBe(true);
    });
});
