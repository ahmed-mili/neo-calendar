import { modifyFrontmatterString } from "../calendars/FullNoteCalendar";
import {
    parseFrontmatter,
    serializeEventMarkdown,
} from "../../apps/windows/src/platform/desktopEventFormat";
import { NeoEvent, parseEvent } from "./schema";

const withDescription = (): NeoEvent =>
    parseEvent({
        title: "Write release notes",
        allDay: true,
        type: "single",
        date: "2026-08-28",
        description: "Old description",
    });

const withoutDescription = (): NeoEvent => {
    const { description: _description, ...event } = withDescription();
    return event as NeoEvent;
};

describe("clearing an event description", () => {
    it("removes the old frontmatter value in the shared note calendar", () => {
        const before = [
            "---",
            "title: Write release notes",
            "allDay: true",
            "type: single",
            "date: 2026-08-28",
            "endDate: null",
            "description: Old description",
            "---",
            "",
            "Body stays here.",
        ].join("\n");

        const after = modifyFrontmatterString(before, withoutDescription());

        expect(after).not.toContain("description:");
        expect(after).toContain("Body stays here.");
    });

    it("removes the old frontmatter value in the desktop and Android format", () => {
        const before = serializeEventMarkdown(withDescription());
        const after = serializeEventMarkdown(withoutDescription(), before);

        expect(after).not.toContain("description:");
        expect(parseFrontmatter(after)?.description).toBeUndefined();
    });
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const jsYaml = require("js-yaml") as { load: (text: string) => any };

const eventWith = (description: string): NeoEvent =>
    parseEvent({
        title: "T",
        allDay: true,
        type: "single",
        date: "2026-08-28",
        description,
    });

/** The lines of the written note between `description:` and the closing fence. */
const writtenDescription = (contents: string): string => {
    const lines = contents.split("\n");
    const start = lines.findIndex((line) => line.startsWith("description:"));
    let end = start + 1;
    while (
        end < lines.length &&
        (lines[end] === "" || /^[ \t]/.test(lines[end]))
    ) {
        end += 1;
    }
    return lines.slice(start, end).join("\n");
};

describe("a multi-line description is a YAML literal block, like Obsidian", () => {
    // [value, what Obsidian writes] (spec 2026-10-05, section 3)
    const table: Array<[string, string]> = [
        ["a\nb", "description: |-\n  a\n  b"],
        ["a\n\nb", "description: |-\n  a\n\n  b"],
        ["a\n", "description: |\n  a"],
        ["a\n\n", "description: |+\n  a\n"],
        [" a\nb", "description: |2-\n   a\n  b"],
        ["\ta\nb", "description: |-\n  \ta\n  b"],
        ["- [ ] \nb", "description: |-\n  - [ ] \n  b"],
        ["\na", "description: |-\n    \n  a".replace("    ", "  ")],
    ];

    it.each(table)("writes %j byte for byte", (value, expected) => {
        const written = writtenDescription(
            serializeEventMarkdown(eventWith(value))
        );
        expect(written).toBe(expected);
    });

    it.each(table)("reads %j back, in both readers", (value) => {
        const contents = serializeEventMarkdown(eventWith(value));
        expect(parseFrontmatter(contents)?.description).toBe(value);
        expect(jsYaml.load(contents.split("---\n")[1]).description).toBe(
            value
        );
    });

    it.each(["a\n ", "\n", "a\r\nb", "a\u0001\nb", "a\n---\nb", "a\n  \n"])(
        "keeps the quoted one-line form for %j",
        (value) => {
            const contents = serializeEventMarkdown(eventWith(value));
            expect(writtenDescription(contents)).toBe(
                `description: ${JSON.stringify(value)}`
            );
            expect(parseFrontmatter(contents)?.description).toBe(value);
        }
    );

    it("leaves a single-line description exactly as before", () => {
        expect(
            writtenDescription(serializeEventMarkdown(eventWith("a: b # c")))
        ).toBe('description: "a: b # c"');
    });

    const userLine =
        'description: "- [ ] [Elgato Wave Mic Arm LP (99,99 €)](https://www.elgato.com/fr/fr/p/wave-mic-arm-lp)\\n- [ ] \\n- [ ] \\nTotal : environ 1400 €"';
    const userText =
        "- [ ] [Elgato Wave Mic Arm LP (99,99 €)](https://www.elgato.com/fr/fr/p/wave-mic-arm-lp)\n- [ ] \n- [ ] \nTotal : environ 1400 €";

    it("reads the user's quoted line the same and rewrites it as a block", () => {
        const before = `---\ntitle: T\nallDay: true\ntype: single\ndate: 2026-08-28\n${userLine}\n---\nBody\n`;
        expect(parseFrontmatter(before)?.description).toBe(userText);

        const event = validateEventFrom(before);
        const after = serializeEventMarkdown(event, before);
        expect(writtenDescription(after)).toBe(
            [
                "description: |-",
                "  - [ ] [Elgato Wave Mic Arm LP (99,99 €)](https://www.elgato.com/fr/fr/p/wave-mic-arm-lp)",
                "  - [ ] ",
                "  - [ ] ",
                "  Total : environ 1400 €",
            ].join("\n")
        );
        expect(parseFrontmatter(after)?.description).toBe(userText);
        expect(after.endsWith("\n---\nBody\n")).toBe(true);

        // the plugin writer agrees byte for byte
        const viaPlugin = modifyFrontmatterString(before, event);
        expect(writtenDescription(viaPlugin)).toBe(
            writtenDescription(after)
        );
    });

    it("never reads an indented line of a block as a key", () => {
        const before =
            "---\ntitle: T\nallDay: true\ntype: single\ndate: 2026-08-28\ndescription: |-\n  a: b\n  title: not me\n  - c: d\n---\n";
        const raw = parseFrontmatter(before);
        expect(raw?.title).toBe("T");
        expect(raw?.description).toBe("a: b\ntitle: not me\n- c: d");
        expect(Object.keys(raw ?? {})).toEqual([
            "title",
            "allDay",
            "type",
            "date",
            "description",
        ]);
    });

    it("keeps an unknown multi-line key byte for byte and replaces a known one whole", () => {
        const notes =
            "---\nnotes: |+\n  keep: this\n\n  and this\n\ntitle: Old\ndescription: |-\n  old: 1\n  old: 2\nallDay: true\ntype: single\ndate: 2026-08-28\n---\nBody\n";
        const event = eventWith("new\ntext");
        for (const after of [
            serializeEventMarkdown(event, notes),
            modifyFrontmatterString(notes, event),
        ]) {
            expect(after).toContain(
                "notes: |+\n  keep: this\n\n  and this\n\ntitle:"
            );
            expect(after).toContain("description: |-\n  new\n  text\nallDay");
            expect(after).not.toContain("old: ");
        }
    });

    it("does not grow a kept trailing blank line on each rewrite", () => {
        const once = serializeEventMarkdown(eventWith("a\n\n"));
        const twice = serializeEventMarkdown(
            validateEventFrom(once),
            once
        );
        expect(twice).toBe(once);
        const plugin = modifyFrontmatterString(once, validateEventFrom(once));
        expect(writtenDescription(plugin)).toBe(writtenDescription(once));
        expect(
            modifyFrontmatterString(plugin, validateEventFrom(plugin))
        ).toBe(plugin);
    });

    it("reads indicators and folded blocks", () => {
        const read = (header: string, lines: string[]) =>
            parseFrontmatter(
                `---\ndescription: ${header}\n${lines.join("\n")}\n---\n`
            )?.description;
        expect(read("|", ["  a", "  b"])).toBe("a\nb\n");
        expect(read("|+", ["  a", "", ""])).toBe("a\n\n\n");
        expect(read("|2-", ["   a", "  b"])).toBe(" a\nb");
        expect(read("|-2", ["   a", "  b"])).toBe(" a\nb");
        expect(read(">-", ["  a", "  b", "", "  c"])).toBe("a b\nc");
        expect(read(">", ["  a", "    b", "  c"])).toBe("a\n  b\nc\n");
        expect(read("|- # note", ["  a"])).toBe("a");
    });
});

function validateEventFrom(contents: string): NeoEvent {
    const parsed = parseEvent(parseFrontmatter(contents) as any);
    return parsed;
}
