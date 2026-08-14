import {
    extractEventBodyLinks,
    parseFrontmatter,
    renameMarkdownTargetInEventBody,
    serializeEventMarkdown,
} from "./desktopEventFormat";
import { NeoEvent } from "../../../../src/types";

const task = (subtasks?: string[]): NeoEvent =>
    ({
        title: "Move house",
        allDay: true,
        type: "single",
        date: "2026-08-12",
        endDate: null,
        completed: false,
        ...(subtasks ? { subtasks } : {}),
    } as unknown as NeoEvent);

describe("the steps of a task, in a note", () => {
    it("writes them and reads them back unchanged", () => {
        const steps = ["[x] Book the van", "[ ] Pack the kitchen"];
        const note = serializeEventMarkdown(task(steps));

        expect(note).toContain(
            'subtasks: ["[x] Book the van","[ ] Pack the kitchen"]'
        );
        expect(parseFrontmatter(note)?.subtasks).toEqual(steps);
    });

    // Each step begins with a box of its own. Written into the list unquoted,
    // the first bracket would close the list where it stood and the note would
    // stop being readable at all — taking the event off the calendar with it.
    it("keeps a step that begins with a box out of the list's way", () => {
        const note = serializeEventMarkdown(task(["[ ] Pack, then label"]));
        expect(parseFrontmatter(note)?.subtasks).toEqual([
            "[ ] Pack, then label",
        ]);
    });

    it("takes the line away when the last step is deleted", () => {
        const before = serializeEventMarkdown(task(["[ ] Pack"]));
        const after = serializeEventMarkdown(task(), before);

        expect(after).not.toContain("subtasks");
        expect(parseFrontmatter(after)?.subtasks).toBeUndefined();
    });

    it("leaves a note that never had steps alone", () => {
        const note = serializeEventMarkdown(task());
        expect(note).not.toContain("subtasks");
    });

    // Everything the app does not own stays byte for byte where it was.
    it("does not disturb the keys around it", () => {
        const before = serializeEventMarkdown(task(["[ ] Pack"])).replace(
            "---\n",
            "---\nbanner: cover.png\n"
        );
        const after = serializeEventMarkdown(task(["[x] Pack"]), before);

        expect(after).toContain("banner: cover.png");
        expect(parseFrontmatter(after)?.subtasks).toEqual(["[x] Pack"]);
    });
});

describe("nommer un lien soi-même", () => {
    const NOTE = [
        "---",
        "date: 2026-08-14",
        "---",
        "",
        "Des notes.",
        "",
        "- [vm.tiktok.com](https://vm.tiktok.com/ZN88SfmSj/)",
        "- [Une recette](https://exemple.fr/plat)",
        "",
    ].join("\n");

    it("réécrit le libellé sans toucher à l'adresse", () => {
        const next = renameMarkdownTargetInEventBody(
            NOTE,
            "https://vm.tiktok.com/ZN88SfmSj/",
            "La danse du chat"
        );

        expect(next).toContain(
            "- [La danse du chat](https://vm.tiktok.com/ZN88SfmSj/)"
        );
        expect(next).toContain("- [Une recette](https://exemple.fr/plat)");
        expect(next).toContain("date: 2026-08-14");
        expect(next).toContain("Des notes.");
    });

    // Un crochet fermerait le libellé et laisserait la suite en texte libre.
    it("retire les crochets d'un nom", () => {
        const next = renameMarkdownTargetInEventBody(
            NOTE,
            "https://exemple.fr/plat",
            "Recette [rapide]"
        );

        expect(next).toContain("- [Recette rapide](https://exemple.fr/plat)");
    });

    // Effacer le nom rend le lien à son libellé automatique — son hôte.
    it("accepte un nom vide", () => {
        const next = renameMarkdownTargetInEventBody(
            NOTE,
            "https://exemple.fr/plat",
            "   "
        );

        expect(next).toContain("- [](https://exemple.fr/plat)");
        expect(extractEventBodyLinks(next)).toContainEqual(
            expect.objectContaining({
                target: "https://exemple.fr/plat",
                label: "exemple.fr",
            })
        );
    });

    it("ne touche à rien quand l'adresse est absente", () => {
        expect(
            renameMarkdownTargetInEventBody(NOTE, "https://ailleurs.fr", "X")
        ).toBe(NOTE);
    });

    it("ne réécrit pas un fichier pour un nom identique", () => {
        expect(
            renameMarkdownTargetInEventBody(
                NOTE,
                "https://exemple.fr/plat",
                "Une recette"
            )
        ).toBe(NOTE);
    });
});
