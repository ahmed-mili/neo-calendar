import {
    applyDescriptionFormat,
    DescriptionFormatCommand,
} from "./descriptionFormatting";

describe("description toolbar formatting", () => {
    it.each<{
        command: DescriptionFormatCommand;
        expected: string;
        selection: [number, number];
    }>([
        {
            command: "bold",
            expected: "Un **mot** utile",
            selection: [5, 8],
        },
        {
            command: "italic",
            expected: "Un _mot_ utile",
            selection: [4, 7],
        },
        {
            command: "underline",
            expected: "Un <u>mot</u> utile",
            selection: [6, 9],
        },
        {
            command: "inline-code",
            expected: "Un `mot` utile",
            selection: [4, 7],
        },
    ])(
        "applies $command around the selected text",
        ({ command, expected, selection }) => {
            const result = applyDescriptionFormat(
                "Un mot utile",
                3,
                6,
                command
            );

            expect(result).toEqual({
                text: expected,
                selectionStart: selection[0],
                selectionEnd: selection[1],
            });
        }
    );

    it.each<{
        command: DescriptionFormatCommand;
        expected: string;
    }>([
        { command: "ordered-list", expected: "1. Alpha\n2. Beta" },
        { command: "bullet-list", expected: "- Alpha\n- Beta" },
        { command: "checklist", expected: "- [ ] Alpha\n- [ ] Beta" },
        { command: "heading-1", expected: "# Alpha\n# Beta" },
        { command: "heading-2", expected: "## Alpha\n## Beta" },
        { command: "heading-3", expected: "### Alpha\n### Beta" },
        { command: "quote", expected: "> Alpha\n> Beta" },
    ])("applies $command to every selected line", ({ command, expected }) => {
        const result = applyDescriptionFormat(
            "Alpha\nBeta",
            0,
            "Alpha\nBeta".length,
            command
        );

        expect(result.text).toBe(expected);
    });

    it("replaces an existing list or block prefix instead of stacking prefixes", () => {
        const result = applyDescriptionFormat(
            "- Alpha\n> Beta\n### Gamma",
            0,
            "- Alpha\n> Beta\n### Gamma".length,
            "ordered-list"
        );

        expect(result.text).toBe("1. Alpha\n2. Beta\n3. Gamma");
    });

    it("inserts a horizontal rule on its own line at the caret", () => {
        const result = applyDescriptionFormat("AvantAprès", 5, 5, "horizontal-rule");

        expect(result).toEqual({
            text: "Avant\n---\nAprès",
            selectionStart: 10,
            selectionEnd: 10,
        });
    });

    it("has no clear-formatting command anymore", () => {
        const unavailable: string = "clear";
        expect(
            [
                "bold",
                "italic",
                "underline",
                "inline-code",
                "ordered-list",
                "bullet-list",
                "checklist",
                "heading-1",
                "heading-2",
                "heading-3",
                "quote",
                "horizontal-rule",
            ] satisfies DescriptionFormatCommand[]
        ).not.toContain(unavailable);
    });
});
