import {
    extractEventBodyLinks,
    parseFrontmatter,
    parseStoredEvent,
    renameMarkdownTargetInEventBody,
    serializeEventMarkdown,
} from "./desktopEventFormat";
import { serializeManagedEventMarkdown } from "./managedEventNote";
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

    // Effacer le nom rend le lien à son libellé automatique — son adresse.
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
                label: "exemple.fr/plat",
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

describe("le titre qui arrive après coup", () => {
    const NOTE = "- [vm.tiktok.com](https://vm.tiktok.com/ZN88SfmSj/)\n";
    const REAL = "https://www.tiktok.com/@quelquun/video/7412345678901234567";

    // Le lien est écrit tout de suite avec le nom qu'on a ; quand le site
    // répond, le nom ET l'adresse peuvent changer d'un coup.
    it("réécrit le nom et l'adresse ensemble", () => {
        expect(
            renameMarkdownTargetInEventBody(
                NOTE,
                "https://vm.tiktok.com/ZN88SfmSj/",
                "@quelquun",
                REAL
            )
        ).toBe(`- [@quelquun](${REAL})\n`);
    });

    it("garde l'adresse quand on ne lui en donne pas d'autre", () => {
        expect(
            renameMarkdownTargetInEventBody(
                NOTE,
                "https://vm.tiktok.com/ZN88SfmSj/",
                "@quelquun"
            )
        ).toBe("- [@quelquun](https://vm.tiktok.com/ZN88SfmSj/)\n");
    });

    it("n'écrit rien quand ni le nom ni l'adresse ne changent", () => {
        expect(
            renameMarkdownTargetInEventBody(
                NOTE,
                "https://vm.tiktok.com/ZN88SfmSj/",
                "vm.tiktok.com",
                "https://vm.tiktok.com/ZN88SfmSj/"
            )
        ).toBe(NOTE);
    });
});

describe("le nom d'un lien sans titre", () => {
    // Trois partages d'un même site donnaient trois lignes identiques.
    it("montre l'adresse entière plutôt que le seul hôte", () => {
        const links = extractEventBodyLinks(
            [
                "- [](https://vm.tiktok.com/ZN88SfmSj/)",
                "- [](https://vm.tiktok.com/ZN88unp8a/)",
            ].join("\n")
        );

        expect(links.map((link) => link.label)).toEqual([
            "vm.tiktok.com/ZN88SfmSj",
            "vm.tiktok.com/ZN88unp8a",
        ]);
    });

    // Ce que les versions précédentes écrivaient faute de titre ne dit rien de
    // plus que l'adresse : les liens déjà dans les fichiers se lisent mieux
    // sans qu'on les réécrive.
    it("traite un libellé réduit à l'hôte comme absent", () => {
        const links = extractEventBodyLinks(
            "- [vm.tiktok.com](https://vm.tiktok.com/ZN88SfmSj/)"
        );

        expect(links[0].label).toBe("vm.tiktok.com/ZN88SfmSj");
    });

    it("garde un vrai titre", () => {
        const links = extractEventBodyLinks(
            "- [La danse du chat](https://vm.tiktok.com/ZN88SfmSj/)"
        );

        expect(links[0].label).toBe("La danse du chat");
    });
});

describe("parseStoredEvent and managed notes", () => {
    it("keeps a note with valid managed markers read-only", () => {
        const contents = serializeManagedEventMarkdown(
            {
                title: "Cours",
                allDay: false,
                startTime: "10:00",
                endTime: "11:00",
                type: "single",
                date: "2026-09-01",
                endDate: null,
            } as unknown as NeoEvent,
            {
                neoManagedBy: "neo-calendar:ics",
                neoManagedVersion: 1,
                neoIcsFeedId: "school",
                neoIcsUid: "uid-1",
                neoIcsRecurrenceId: null,
                neoIcsStatus: "confirmed",
            }
        );

        const stored = parseStoredEvent(
            {
                relativePath: "Etudes/2026-09-01 Cours.md",
                calendarPath: "Etudes",
                fileName: "2026-09-01 Cours.md",
                contents,
            },
            new Set(["local::Etudes"])
        );

        expect(stored?.readOnly).toBe(true);
        expect(stored?.calendarId).toBe("local::Etudes");
    });
});

describe("the reminders of an event, in a note", () => {
    const dated = (reminders?: number[]): NeoEvent =>
        ({
            title: "Dentist",
            allDay: false,
            startTime: "09:00",
            endTime: "09:30",
            type: "single",
            date: "2026-08-19",
            endDate: null,
            ...(reminders ? { reminders } : {}),
        } as unknown as NeoEvent);

    it("writes them and reads them back as minutes", () => {
        const note = serializeEventMarkdown(dated([0, 10, 60]));

        expect(note).toContain("reminders: [0,10,60]");
        expect(parseFrontmatter(note)?.reminders).toEqual([0, 10, 60]);
    });

    /*
     * An empty list is not the absence of one: with no key at all the reminder
     * from the settings applies, while `[]` is this event asking for silence.
     * Dropping the empty line would put the setting's reminder back.
     */
    it("keeps the empty list of an event that asked for silence", () => {
        const note = serializeEventMarkdown(dated([]));

        expect(note).toContain("reminders: []");
        expect(parseFrontmatter(note)?.reminders).toEqual([]);
    });

    it("says nothing about an event that never asked", () => {
        expect(serializeEventMarkdown(dated())).not.toContain("reminders");
    });
});
