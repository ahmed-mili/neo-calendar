import { EditorSelection, EditorState } from "@codemirror/state";
import { deleteCharBackward, deleteCharForward } from "@codemirror/commands";
import { buildDecorations, livePreview } from "./livePreview";

/**
 * The reveal rules of the live preview (spec 2026-10-05, 4.1 and 4.2), read
 * off the decoration set so no layout is needed.
 */
function stateAt(doc: string, anchor: number, head = anchor): EditorState {
    return EditorState.create({
        doc,
        selection: EditorSelection.single(anchor, head),
        extensions: [livePreview(() => ({}))],
    });
}

interface Seen {
    hidden: Array<[number, number]>;
    widgets: Array<[number, number, string]>;
    marks: Array<[number, number, string]>;
    lines: Array<[number, string]>;
}

function inspect(doc: string, anchor: number, head = anchor): Seen {
    const state = stateAt(doc, anchor, head);
    const set = buildDecorations(state, () => ({}));
    const seen: Seen = { hidden: [], widgets: [], marks: [], lines: [] };
    set.between(0, doc.length, (from, to, value) => {
        const spec = value.spec as {
            widget?: { constructor: { name: string } };
            class?: string;
        };
        if (spec.widget) {
            seen.widgets.push([from, to, spec.widget.constructor.name]);
        } else if (spec.class && from === to) {
            seen.lines.push([from, spec.class]);
        } else if (spec.class) {
            seen.marks.push([from, to, spec.class]);
        } else if (from !== to) {
            seen.hidden.push([from, to]);
        }
    });
    seen.hidden.sort((a, b) => a[0] - b[0]);
    return seen;
}

const LINK_DOC = "Total [lien](https://a.b) fin";

describe("links (4.2)", () => {
    test.each([
        [5, false],
        [6, true],
        [10, true],
        [25, true],
        [26, false],
    ])("caret %d: raw=%s", (caret, raw) => {
        const seen = inspect(LINK_DOC, caret);
        if (raw) {
            expect(seen.hidden).toEqual([]);
            expect(seen.marks.some((m) => m[2] === "nc-desc-link-raw")).toBe(
                true
            );
        } else {
            expect(seen.hidden).toEqual([
                [6, 7],
                [11, 25],
            ]);
            expect(seen.marks.find((m) => m[2] === "nc-desc-link")).toEqual([
                7,
                11,
                "nc-desc-link",
            ]);
        }
    });

    test("an autolink and a bare URL are links", () => {
        const near = inspect("<https://a.b>", 13);
        expect(near.marks.some((m) => m[2] === "nc-desc-link")).toBe(false);
        const away = inspect("x\n<https://a.b>", 0);
        expect(away.marks.some((m) => m[2] === "nc-desc-link")).toBe(true);
        const bare = inspect("see https://a.b now", 0);
        expect(bare.marks.some((m) => m[2] === "nc-desc-link")).toBe(true);
    });
});

describe("task marker (4.2)", () => {
    test.each([0, 1, 2, 3, 4, 5])("- [ ] a, caret %d: raw", (caret) => {
        expect(inspect("- [ ] a", caret).widgets).toEqual([]);
    });
    test("- [ ] a, caret 6: box", () => {
        expect(inspect("- [ ] a", 6).widgets).toEqual([
            [0, 6, "CheckboxWidget"],
        ]);
    });
    test("tab-indented: box at 0, raw 1 to 6, box at 7", () => {
        const doc = "\t- [ ] a";
        expect(inspect(doc, 0).widgets).toEqual([[1, 7, "CheckboxWidget"]]);
        for (const caret of [1, 2, 3, 4, 5, 6]) {
            expect(inspect(doc, caret).widgets).toEqual([]);
        }
        expect(inspect(doc, 7).widgets).toEqual([[1, 7, "CheckboxWidget"]]);
    });
    test("a done task strikes its text, an empty one stays a box", () => {
        const seen = inspect("- [x] fait\n- [ ] ", 17);
        expect(seen.marks).toContainEqual([6, 10, "nc-desc-done"]);
        expect(seen.widgets).toContainEqual([0, 6, "CheckboxWidget"]);
        expect(inspect("- [ ] \nx", 8).widgets).toEqual([
            [0, 6, "CheckboxWidget"],
        ]);
    });
    test("* and + boxes, and [X]", () => {
        for (const doc of ["* [ ] a\nz", "+ [X] a\nz"]) {
            expect(inspect(doc, doc.length).widgets).toEqual([
                [0, 6, "CheckboxWidget"],
            ]);
        }
    });
    test("a selection across lines reveals the markers it touches", () => {
        const doc = "- [ ] a\n- [ ] b";
        expect(inspect(doc, 0, doc.length).widgets).toEqual([]);
    });
});

describe("bullets, numbers, text (4.1)", () => {
    test("a bullet is never revealed", () => {
        for (const caret of [0, 1, 2, 4]) {
            expect(inspect("- item", caret).widgets).toEqual([
                [0, 2, "BulletWidget"],
            ]);
        }
    });
    test("a number is never replaced", () => {
        const seen = inspect("1. a", 0);
        expect(seen.widgets).toEqual([]);
        expect(seen.hidden).toEqual([]);
        expect(seen.marks).toContainEqual([0, 2, "nc-desc-number"]);
    });
    test("a Total line under a list is plain text", () => {
        const seen = inspect("- [ ] a\nTotal", 0);
        expect(seen.lines.filter((l) => l[0] === 8)).toEqual([]);
    });
    test("a heading shows its # on its own line only", () => {
        expect(inspect("# Titre\nx", 8).hidden).toEqual([[0, 2]]);
        expect(inspect("# Titre\nx", 3).hidden).toEqual([]);
    });
});

describe("inline marks (4.1, 4.2)", () => {
    const cases: Array<[string, string, Array<[number, number]>]> = [
        [
            "a **b** c",
            "nc-desc-strong",
            [
                [2, 4],
                [5, 7],
            ],
        ],
        [
            "a *b* c",
            "nc-desc-em",
            [
                [2, 3],
                [4, 5],
            ],
        ],
        [
            "a _b_ c",
            "nc-desc-em",
            [
                [2, 3],
                [4, 5],
            ],
        ],
        [
            "a ~~b~~ c",
            "nc-desc-strike",
            [
                [2, 4],
                [5, 7],
            ],
        ],
        [
            "a ==b== c",
            "nc-desc-highlight",
            [
                [2, 4],
                [5, 7],
            ],
        ],
        [
            "a `b` c",
            "nc-desc-code",
            [
                [2, 3],
                [4, 5],
            ],
        ],
        [
            "a <u>b</u> c",
            "nc-desc-underline",
            [
                [2, 5],
                [6, 10],
            ],
        ],
    ];
    test.each(cases)("%s", (doc, cls, hidden) => {
        // Away from it: styled, syntax hidden.
        const away = inspect(doc + "\nz", doc.length + 2);
        expect(away.marks.some((m) => m[2] === cls)).toBe(true);
        expect(away.hidden).toEqual(hidden);
        // Touching it, bounds included: raw but still styled.
        const [from, to] = away.marks.find((m) => m[2] === cls)!;
        for (const caret of [from, from + 2, to]) {
            const near = inspect(doc, caret);
            expect(near.hidden).toEqual([]);
            expect(near.marks.some((m) => m[2] === cls)).toBe(true);
        }
        // One character outside: rendered again.
        expect(inspect(doc, from - 1).hidden).toEqual(hidden);
        expect(inspect(doc, to + 1).hidden).toEqual(hidden);
    });

    test("***both*** is bold and italic", () => {
        const seen = inspect("***x***\nz", 9);
        expect(seen.marks.some((m) => m[2] === "nc-desc-strong")).toBe(true);
        expect(seen.marks.some((m) => m[2] === "nc-desc-em")).toBe(true);
    });
});

describe("native deletions (4.3)", () => {
    function apply(
        doc: string,
        caret: number,
        command: typeof deleteCharBackward
    ): string {
        let state = stateAt(doc, caret);
        command({
            state,
            dispatch: (tr: any) => {
                state = tr.state;
            },
        } as any);
        const at = state.selection.main.head;
        const text = state.doc.toString();
        return text.slice(0, at) + "|" + text.slice(at);
    }
    const cases: Array<[string, number, typeof deleteCharBackward, string]> = [
        ["- [ ] Tache", 6, deleteCharBackward, "- [ ]|Tache"],
        ["- [ ] a\n- [ ] ", 14, deleteCharBackward, "- [ ] a\n- [ ]|"],
        ["- item", 2, deleteCharBackward, "-|item"],
        ["abc\ndef", 4, deleteCharBackward, "abc|def"],
        ["- [ ] a\n- [ ] b", 7, deleteCharForward, "- [ ] a|- [ ] b"],
    ];
    test.each(cases)("%j at %d", (doc, caret, command, expected) => {
        expect(apply(doc, caret, command)).toBe(expected);
    });
});

describe("numbered task and quote", () => {
    test("1. [ ] a draws the number and a box", () => {
        const seen = inspect("1. [ ] a\nz", 10);
        expect(seen.widgets).toEqual([[3, 7, "CheckboxWidget"]]);
        const raw = inspect("1. [ ] a", 4);
        expect(raw.widgets).toEqual([]);
    });
    test("the quote marker is hidden on its own line too", () => {
        expect(inspect("> a", 2).hidden).toEqual([[0, 2]]);
    });
});
