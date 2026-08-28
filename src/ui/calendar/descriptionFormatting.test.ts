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
    ])("applies $command to every selected line", ({ command, expected }) => {
        const result = applyDescriptionFormat(
            "Alpha\nBeta",
            0,
            "Alpha\nBeta".length,
            command
        );

        expect(result.text).toBe(expected);
    });

    it("replaces an existing list kind instead of stacking prefixes", () => {
        const result = applyDescriptionFormat(
            "- Alpha\n- [ ] Beta",
            0,
            "- Alpha\n- [ ] Beta".length,
            "ordered-list"
        );

        expect(result.text).toBe("1. Alpha\n2. Beta");
    });

    it("clears inline and list formatting from the selection", () => {
        const formatted =
            "**Fort** et _vite_\n- [ ] Vérifier\n2. Fin\n<u>ligne</u>";
        const result = applyDescriptionFormat(
            formatted,
            0,
            formatted.length,
            "clear"
        );

        expect(result.text).toBe("Fort et vite\nVérifier\nFin\nligne");
    });
});
