import { parseFrontmatter, serializeEventMarkdown } from "./desktopEventFormat";
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
