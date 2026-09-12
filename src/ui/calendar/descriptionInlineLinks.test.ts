import {
    hasInlineLink,
    inlineLinkEndingAt,
    inlineLinkMarkdown,
    readInlineLinks,
    splitInlineLinks,
} from "./descriptionInlineLinks";

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
        expect(hasInlineLink("- [ ] une étape")).toBe(false);
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

describe("splitInlineLinks", () => {
    it("cuts the line into what has to be drawn", () => {
        expect(
            splitInlineLinks("avant [nom](https://example.com) après")
        ).toEqual([
            { kind: "text", text: "avant ", start: 0, end: 6 },
            {
                kind: "link",
                start: 6,
                end: 32,
                label: "nom",
                target: "https://example.com",
            },
            { kind: "text", text: " après", start: 32, end: 38 },
        ]);
    });

    it("says nothing about an empty line", () => {
        expect(splitInlineLinks("")).toEqual([]);
    });
});

describe("inlineLinkEndingAt", () => {
    it("finds the link a backspace would start to unmake", () => {
        const text = "a\n[nom](https://example.com)";
        expect(inlineLinkEndingAt(text, text.length)?.target).toBe(
            "https://example.com"
        );
        expect(inlineLinkEndingAt(text, text.length - 1)).toBeNull();
    });
});

describe("inlineLinkMarkdown", () => {
    it("escapes a bracket in the name", () => {
        expect(inlineLinkMarkdown("a]b", "https://example.com")).toBe(
            "[a\\]b](https://example.com)"
        );
    });
});
