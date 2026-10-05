import {
    enter,
    indent,
    outdentLines,
    shiftEnter,
    toggleBold,
    toggleChecklist,
    toggleItalic,
    EditResult,
} from "./listCommands";

/**
 * `|` is the caret; `‹` and `›` bound a selection. One case per row of the
 * tables measured in Obsidian (spec 2026-10-05, 4.3 and 4.4).
 */
function parse(marked: string): { text: string; from: number; to: number } {
    const open = marked.indexOf("‹");
    if (open !== -1) {
        const close = marked.indexOf("›");
        const text = marked.replace("‹", "").replace("›", "");
        return { text, from: open, to: close - 1 };
    }
    const caret = marked.indexOf("|");
    return { text: marked.replace("|", ""), from: caret, to: caret };
}

function show(result: EditResult): string {
    const { text, from, to } = result;
    if (from === to) return text.slice(0, from) + "|" + text.slice(from);
    return (
        text.slice(0, from) + "‹" + text.slice(from, to) + "›" + text.slice(to)
    );
}

function run(
    fn: (text: string, from: number, to: number) => EditResult,
    marked: string
): string {
    const { text, from, to } = parse(marked);
    return show(fn(text, from, to));
}

describe("Enter (4.3)", () => {
    const cases: Array<[string, string]> = [
        ["- [ ] Tache|", "- [ ] Tache\n- [ ] |"],
        ["- [ ] Ta|che", "- [ ] Ta\n- [ ] |che"],
        ["- [ ] |Tache", "- [ ] \n- [ ] |Tache"],
        ["- [x] Fait|", "- [x] Fait\n- [ ] |"],
        ["- [-] Fait|", "- [-] Fait\n- [ ] |"],
        ["- [ ] a\n- [ ] |", "- [ ] a\n|"],
        ["- [x] |", "|"],
        ["- [ ] a\n\t- [ ] b|", "- [ ] a\n\t- [ ] b\n\t- [ ] |"],
        ["- [ ] a\n\t- [ ] |", "- [ ] a\n- [ ] |"],
        ["- a\n\t- |", "- a\n- |"],
        ["- item|", "- item\n- |"],
        ["* a|", "* a\n* |"],
        ["+ a|", "+ a\n+ |"],
        ["- item\n- |", "- item\n|"],
        ["1. a|", "1. a\n2. |"],
        ["9. a|", "9. a\n10. |"],
        ["1) a|", "1) a\n2) |"],
        ["1. a\n2. |", "1. a\n|"],
        ["> a|", "> a\n> |"],
        ["  - [ ] a|", "  - [ ] a\n  - [ ] |"],
        ["- [|] Tache", "- [\n|] Tache"],
        ["- [| ] Tache", "- [\n| ] Tache"],
        ["|- [ ] Tache", "\n|- [ ] Tache"],
        ["Total|", "Total\n|"],
        ["- [ ] a‹bc\n- [ ] de›f", "- [ ] a\n|f"],
    ];
    test.each(cases)("%j", (before, after) => {
        expect(run(enter, before)).toBe(after);
    });
});

describe("Shift+Enter (4.3)", () => {
    test("continuation aligned under the text", () => {
        expect(run(shiftEnter, "- [ ] Tache|")).toBe("- [ ] Tache\n      |");
    });
    test("plain text keeps a bare line break", () => {
        expect(run(shiftEnter, "Total|")).toBe("Total\n|");
    });
});

describe("Tab and Shift+Tab (4.3)", () => {
    test("whole list line, caret follows", () => {
        expect(run(indent, "- [ ] a\n- [ ] b|")).toBe("- [ ] a\n\t- [ ] b|");
    });
    test("caret inside the line", () => {
        expect(run(indent, "- [ ] a|bc")).toBe("\t- [ ] a|bc");
    });
    test("not a list: the line is still indented", () => {
        expect(run(indent, "a|bc")).toBe("\ta|bc");
    });
    test("selection over two list lines keeps the selection", () => {
        expect(run(indent, "‹- [ ] a\n- [ ] b›")).toBe(
            "‹\t- [ ] a\n\t- [ ] b›"
        );
    });
    test("Shift+Tab takes one level off", () => {
        expect(run(outdentLines, "- [ ] a\n\t- [ ] b|")).toBe(
            "- [ ] a\n- [ ] b|"
        );
    });
    test("Shift+Tab at level 0 changes nothing", () => {
        expect(run(outdentLines, "- [ ] a|")).toBe("- [ ] a|");
    });
    test("Shift+Tab takes one tab off a double indent", () => {
        expect(run(outdentLines, "\t\t- [ ] a|")).toBe("\t- [ ] a|");
    });
});

describe("Ctrl+L (4.4)", () => {
    const cases: Array<[string, string]> = [
        ["texte|", "- [ ] texte|".replace("texte|", "texte|")],
        ["- a|", "- [ ] a|"],
        ["- [ ] a|", "- [x] a|"],
        ["- [x] a|", "- [ ] a|"],
        ["|", "- [ ] |"],
        ["‹a\n- b\n- [ ] c›", "‹- [ ] a\n- [ ] b\n- c›"],
    ];
    test.each(cases)("%j", (before, after) => {
        const expected = before === "texte|" ? "- [ ] texte|" : after;
        expect(run(toggleChecklist, before)).toBe(expected);
    });

    test("text: the caret moves by six", () => {
        const result = toggleChecklist("abc", 1, 1);
        expect(result.text).toBe("- [ ] abc");
        expect(result.from).toBe(7);
    });
});

describe("Ctrl+B and Ctrl+I (4.4)", () => {
    const bold: Array<[string, string]> = [
        ["‹ab›", "**‹ab›**"],
        ["ab|c", "**ab|c**"],
        ["**‹ab›**", "‹ab›"],
        ["**a|b**", "a|b"],
        ["‹**ab**›", "‹ab›"],
        ["|", "**|**"],
        ["**|**", "|"],
        ["x ‹ab cd› y", "x **‹ab cd›** y"],
    ];
    test.each(bold)("bold %j", (before, after) => {
        expect(run(toggleBold, before)).toBe(after);
    });

    const italic: Array<[string, string]> = [
        ["‹ab›", "*‹ab›*"],
        ["ab|c", "*ab|c*"],
        ["*‹ab›*", "‹ab›"],
        ["**‹ab›**", "***‹ab›***"],
        ["***‹ab›***", "**‹ab›**"],
        ["|", "*|*"],
    ];
    test.each(italic)("italic %j", (before, after) => {
        expect(run(toggleItalic, before)).toBe(after);
    });
});
