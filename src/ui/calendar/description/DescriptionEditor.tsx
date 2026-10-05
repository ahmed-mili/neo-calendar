/**
 * The description of an event, as ONE editor: Obsidian's live preview.
 *
 * It replaces the line-by-line rendering with a single CodeMirror 6 view over
 * the whole text, so a selection, Ctrl+A, copy, undo and the arrow keys all
 * work across lines the way they do in a note. The component is controlled by
 * `value` (the text stays the truth) and never fights the user's caret or undo
 * history: an outside value is only written when it differs from the document.
 *
 * Key behaviors live in `listCommands.ts` (pure, one test per measured row),
 * the drawing in `livePreview.ts`.
 */
import * as React from "react";
import {
    history,
    historyKeymap,
    defaultKeymap,
    redo,
} from "@codemirror/commands";
import { Annotation, Compartment, EditorState, Prec } from "@codemirror/state";
import {
    EditorView,
    keymap,
    placeholder as placeholderExt,
} from "@codemirror/view";
import { InlineLink } from "../descriptionInlineLinks";
import {
    applyDescriptionFormat,
    DescriptionFormatCommand,
} from "../descriptionFormatting";
import {
    EditResult,
    enter,
    indent,
    outdentLines,
    shiftEnter,
    toggleBold,
    toggleChecklist,
    toggleItalic,
} from "./listCommands";
import { livePreview, LivePreviewHandlers } from "./livePreview";

export type { DescriptionFormatCommand };

export interface DescriptionSelection {
    from: number;
    to: number;
    text: string;
}

export interface DescriptionEditorHandle {
    /** The CodeMirror view (tests and advanced callers). */
    getView(): EditorView | null;
    getSelection(): DescriptionSelection;
    /** Replaces the selection; the caret lands after the inserted text. */
    replaceSelection(text: string): void;
    /** The toolbar: the same rules as the keys, on the CodeMirror selection. */
    applyFormat(command: DescriptionFormatCommand): void;
    focus(): void;
    setSelection(from: number, to?: number): void;
}

export interface DescriptionEditorProps {
    value: string;
    /** False for a read-only (ICS) event: same drawing, no editing. */
    editable?: boolean;
    placeholder?: string;
    className?: string;
    onChange?: (text: string) => void;
    onBlur?: () => void;
    onOpenLink?: (link: InlineLink) => void;
    onLinkMenu?: (link: InlineLink, rect: DOMRect) => void;
    /** Return true when the paste was handled (the editor then does nothing). */
    onPaste?: (
        text: string,
        selection: { from: number; to: number }
    ) => boolean;
    /** After `onChange`, when a checkbox was clicked. */
    onToggle?: () => void;
    /** Focus (and place the caret) each time `nonce` changes. */
    focusRequest?: { nonce: number; from?: number; to?: number } | null;
}

const External = Annotation.define<boolean>();

/** Writes `next` over the document as the smallest change, selection mapped. */
function applyText(
    view: EditorView,
    next: string,
    selection?: { from: number; to: number },
    extra: { external?: boolean } = {}
): void {
    const current = view.state.doc.toString();
    if (current === next && !selection) return;
    let start = 0;
    const max = Math.min(current.length, next.length);
    while (start < max && current[start] === next[start]) start += 1;
    let endCurrent = current.length;
    let endNext = next.length;
    while (
        endCurrent > start &&
        endNext > start &&
        current[endCurrent - 1] === next[endNext - 1]
    ) {
        endCurrent -= 1;
        endNext -= 1;
    }
    view.dispatch({
        changes:
            current === next
                ? undefined
                : {
                      from: start,
                      to: endCurrent,
                      insert: next.slice(start, endNext),
                  },
        selection: selection
            ? { anchor: selection.from, head: selection.to }
            : undefined,
        annotations: extra.external ? [External.of(true)] : undefined,
        userEvent: extra.external ? undefined : "input",
        scrollIntoView: !extra.external,
    });
}

function applyResult(view: EditorView, result: EditResult): void {
    applyText(view, result.text, { from: result.from, to: result.to });
}

function selectionCommand(
    fn: (text: string, from: number, to: number) => EditResult
) {
    return (view: EditorView): boolean => {
        if (view.state.readOnly) return false;
        const { from, to } = view.state.selection.main;
        applyResult(view, fn(view.state.doc.toString(), from, to));
        return true;
    };
}

export const descriptionKeymap = [
    { key: "Enter", run: selectionCommand(enter) },
    { key: "Shift-Enter", run: selectionCommand(shiftEnter) },
    { key: "Tab", run: selectionCommand(indent) },
    { key: "Shift-Tab", run: selectionCommand(outdentLines) },
    {
        key: "Mod-l",
        run: selectionCommand(toggleChecklist),
        preventDefault: true,
    },
    { key: "Mod-b", run: selectionCommand(toggleBold), preventDefault: true },
    { key: "Mod-i", run: selectionCommand(toggleItalic), preventDefault: true },
    // Ctrl+Y is in the history keymap; Windows also redoes with Ctrl+Shift+Z.
    { key: "Mod-Shift-z", run: redo, preventDefault: true },
];

export function formatSelection(
    view: EditorView,
    command: DescriptionFormatCommand
): void {
    const { from, to } = view.state.selection.main;
    const text = view.state.doc.toString();
    if (command === "bold") {
        applyResult(view, toggleBold(text, from, to));
    } else if (command === "italic") {
        applyResult(view, toggleItalic(text, from, to));
    } else {
        const result = applyDescriptionFormat(text, from, to, command);
        applyText(view, result.text, {
            from: result.selectionStart,
            to: result.selectionEnd,
        });
    }
}

export const DescriptionEditor = React.forwardRef<
    DescriptionEditorHandle,
    DescriptionEditorProps
>(function DescriptionEditor(props, ref) {
    const { value, editable = true, placeholder, className } = props;
    const hostRef = React.useRef<HTMLDivElement>(null);
    const viewRef = React.useRef<EditorView | null>(null);
    const propsRef = React.useRef(props);
    propsRef.current = props;

    const editableCompartment = React.useRef(new Compartment());
    const placeholderCompartment = React.useRef(new Compartment());

    React.useEffect(() => {
        const handlers = (): LivePreviewHandlers => ({
            onOpenLink: (link) => propsRef.current.onOpenLink?.(link),
            onLinkMenu: (link, rect) =>
                propsRef.current.onLinkMenu?.(link, rect),
            onToggle: () => propsRef.current.onToggle?.(),
            isEditable: () => propsRef.current.editable !== false,
        });

        const view = new EditorView({
            parent: hostRef.current!,
            state: EditorState.create({
                doc: propsRef.current.value,
                extensions: [
                    history(),
                    Prec.high(keymap.of(descriptionKeymap)),
                    keymap.of([
                        ...historyKeymap,
                        ...defaultKeymap.filter((b) => b.key !== "Mod-Enter"),
                    ]),
                    livePreview(handlers),
                    editableCompartment.current.of([
                        EditorView.editable.of(
                            propsRef.current.editable !== false
                        ),
                        EditorState.readOnly.of(
                            propsRef.current.editable === false
                        ),
                    ]),
                    placeholderCompartment.current.of(
                        propsRef.current.placeholder
                            ? placeholderExt(propsRef.current.placeholder)
                            : []
                    ),
                    EditorView.contentAttributes.of({
                        "aria-multiline": "true",
                        spellcheck: "true",
                    }),
                    EditorView.updateListener.of((update) => {
                        if (
                            update.docChanged &&
                            !update.transactions.some((tr) =>
                                tr.annotation(External)
                            )
                        ) {
                            propsRef.current.onChange?.(
                                update.state.doc.toString()
                            );
                        }
                    }),
                    EditorView.domEventHandlers({
                        blur() {
                            propsRef.current.onBlur?.();
                            return false;
                        },
                        paste(event, pasteView) {
                            const onPaste = propsRef.current.onPaste;
                            if (!onPaste || pasteView.state.readOnly) {
                                return false;
                            }
                            const text =
                                event.clipboardData?.getData("text/plain") ??
                                "";
                            const { from, to } = pasteView.state.selection.main;
                            if (onPaste(text, { from, to })) {
                                event.preventDefault();
                                return true;
                            }
                            return false;
                        },
                    }),
                ],
            }),
        });
        viewRef.current = view;
        return () => {
            view.destroy();
            viewRef.current = null;
        };
    }, []);

    // The text is controlled, but only a DIFFERENT outside value is written:
    // typing echoes back as an equal value and must not touch caret or history.
    React.useEffect(() => {
        const view = viewRef.current;
        if (!view || view.state.doc.toString() === value) return;
        applyText(view, value, undefined, { external: true });
    }, [value]);

    React.useEffect(() => {
        viewRef.current?.dispatch({
            effects: [
                editableCompartment.current.reconfigure([
                    EditorView.editable.of(editable),
                    EditorState.readOnly.of(!editable),
                ]),
                placeholderCompartment.current.reconfigure(
                    placeholder ? placeholderExt(placeholder) : []
                ),
            ],
        });
    }, [editable, placeholder]);

    const focusNonce = props.focusRequest?.nonce;
    React.useEffect(() => {
        const request = propsRef.current.focusRequest;
        const view = viewRef.current;
        if (!request || !view) return;
        const length = view.state.doc.length;
        const from = Math.min(request.from ?? length, length);
        const to = Math.min(request.to ?? from, length);
        view.focus();
        view.dispatch({ selection: { anchor: from, head: to } });
    }, [focusNonce]);

    React.useImperativeHandle(
        ref,
        () => ({
            getView: () => viewRef.current,
            getSelection: () => {
                const view = viewRef.current;
                if (!view) return { from: 0, to: 0, text: "" };
                const { from, to } = view.state.selection.main;
                return {
                    from,
                    to,
                    text: view.state.doc.sliceString(from, to),
                };
            },
            replaceSelection: (text) => {
                const view = viewRef.current;
                if (!view || view.state.readOnly) return;
                const { from, to } = view.state.selection.main;
                view.dispatch({
                    changes: { from, to, insert: text },
                    selection: { anchor: from + text.length },
                    userEvent: "input.paste",
                    scrollIntoView: true,
                });
            },
            applyFormat: (command) => {
                const view = viewRef.current;
                if (!view || view.state.readOnly) return;
                formatSelection(view, command);
            },
            focus: () => viewRef.current?.focus(),
            setSelection: (from, to = from) => {
                const view = viewRef.current;
                if (!view) return;
                const length = view.state.doc.length;
                view.dispatch({
                    selection: {
                        anchor: Math.min(from, length),
                        head: Math.min(to, length),
                    },
                });
            },
        }),
        []
    );

    return (
        <div
            ref={hostRef}
            className={`nc-desc-editor${className ? ` ${className}` : ""}`}
        />
    );
});
