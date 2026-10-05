import { inlineLinkMarkdown, readInlineLinks } from "./descriptionInlineLinks";

describe("readInlineLinks", () => {
    it("finds a link written in the middle of a line", () => {
        const line = "voir [le site](https://example.com/a) demain";
        expect(readInlineLinks(line)).toEqual([
            {
                start: 5,
                end: 37,
                label: "le site",
                target: "https://example.com/a",
            },
        ]);
        expect(line.slice(5, 37)).toBe("[le site](https://example.com/a)");
    });

    it("keeps parentheses that belong to the address", () => {
        const line =
            "[Note](obsidian://open?vault=V&file=B1%20(2025)/Cours.md)";
        const [link] = readInlineLinks(line);
        expect(link.target).toBe(
            "obsidian://open?vault=V&file=B1%20(2025)/Cours.md"
        );
        expect(link.end).toBe(line.length);
    });

    it("keeps a label with a closing bracket in it", () => {
        const [link] = readInlineLinks("[a\\]b](https://example.com)");
        expect(link.label).toBe("a]b");
    });

    it("never runs a link across two lines", () => {
        expect(readInlineLinks("[début\nfin](https://example.com)")).toEqual(
            []
        );
        expect(readInlineLinks("- [ ] une étape")).toEqual([]);
    });

    it("ignores a link with no address", () => {
        expect(readInlineLinks("[rien]()")).toEqual([]);
    });

    it("reads several links on one line", () => {
        const links = readInlineLinks(
            "[un](https://a.test) et [deux](https://b.test)"
        );
        expect(links.map((link) => link.target)).toEqual([
            "https://a.test",
            "https://b.test",
        ]);
    });
});

describe("inlineLinkMarkdown", () => {
    it("escapes a bracket in the name", () => {
        expect(inlineLinkMarkdown("a]b", "https://example.com")).toBe(
            "[a\\]b](https://example.com)"
        );
    });
});
