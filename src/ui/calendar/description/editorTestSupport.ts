import { EditorView } from "@codemirror/view";

/**
 * CodeMirror measures text with ranges, and jsdom has no layout: give it empty
 * rectangles so a view can be mounted and driven in a test.
 */
export function stubEditorLayout(): void {
    const rect = {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: 0,
        height: 0,
        toJSON: () => ({}),
    };
    const rects = () => ({
        length: 0,
        item: () => null,
        [Symbol.iterator]: function* () {},
    });
    (Range.prototype as any).getClientRects = rects;
    (Range.prototype as any).getBoundingClientRect = () => rect;
    (document as any).elementFromPoint = () => null;
}

/** The CodeMirror view mounted somewhere under `root`. */
export function editorViewIn(root: ParentNode): EditorView {
    const host = root.querySelector(".cm-editor");
    const view = host instanceof HTMLElement ? EditorView.findFromDOM(host) : null;
    if (!view) throw new Error("no description editor mounted");
    return view;
}

/** Types `text` at the selection, as the keyboard would. */
export function typeInto(view: EditorView, text: string): void {
    const { from, to } = view.state.selection.main;
    view.dispatch({
        changes: { from, to, insert: text },
        selection: { anchor: from + text.length },
        userEvent: "input.type",
    });
}

/** Puts the caret (or a selection) in the document. */
export function selectIn(view: EditorView, anchor: number, head = anchor): void {
    view.dispatch({ selection: { anchor, head } });
}

/** The raw text of the document. */
export function docOf(view: EditorView): string {
    return view.state.doc.toString();
}
