/**
 * Live preview for the description editor, the way Obsidian draws a note.
 *
 * ONE CodeMirror editor holds the whole text; this extension only DECORATES
 * it. Nothing here owns a copy of the text or the list: the document stays
 * the truth, so what the file says and what the panel shows cannot drift.
 *
 * Block structure (task / bullet / number / heading / quote prefixes) is read
 * per LINE, because Obsidian reads it that way: a "Total" line under a list is
 * a line of text, never the continuation of the last item, which lezer's
 * markdown tree would make it. Inline structure (bold, italic, strikethrough,
 * highlight, code, links) comes from the `@lezer/markdown` tree (GFM plus a
 * `==highlight==` extension), so no regex guesses at emphasis.
 *
 * The reveal rules are those measured in Obsidian (spec 4.2):
 * - an inline element shows its raw syntax when a selection touches its range,
 *   bounds included;
 * - a task marker `- [ ] ` shows raw when the caret is in
 *   `[marker start, marker end)`;
 * - bullets and numbers are never revealed;
 * - a heading shows its `#` while the caret is on its line.
 */
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import {
    EditorState,
    Extension,
    Range,
    StateEffect,
    StateField,
    Transaction,
} from "@codemirror/state";
import {
    Decoration,
    DecorationSet,
    EditorView,
    WidgetType,
} from "@codemirror/view";
import type { InlineContext, MarkdownConfig } from "@lezer/markdown";
import { InlineLink } from "../descriptionInlineLinks";
import { TaskCheckbox } from "../TaskCheckbox";
import { readLinePrefix } from "./listCommands";

export interface LivePreviewHandlers {
    /** Left click on a rendered link. */
    onOpenLink?: (link: InlineLink) => void;
    /** Right click on a rendered link, with the link's box. */
    onLinkMenu?: (link: InlineLink, rect: DOMRect) => void;
    /** A checkbox was ticked or unticked (after `onChange`). */
    onToggle?: () => void;
    /** Read-only editors draw everything and toggle nothing. */
    isEditable?: () => boolean;
}

/* ── `==highlight==`, the one inline mark GFM does not know ───────────── */

const PUNCTUATION = /[!-/:-@[-`{-~¡-¿‐-‧‰-⁞]/;
const HighlightDelimiter = { resolve: "Highlight", mark: "HighlightMark" };

export const Highlight: MarkdownConfig = {
    defineNodes: ["Highlight", "HighlightMark"],
    parseInline: [
        {
            name: "Highlight",
            parse(cx: InlineContext, next: number, pos: number) {
                if (
                    next !== 61 /* = */ ||
                    cx.char(pos + 1) !== 61 ||
                    cx.char(pos + 2) === 61
                ) {
                    return -1;
                }
                const before = cx.slice(pos - 1, pos);
                const after = cx.slice(pos + 2, pos + 3);
                const spaceBefore = /\s|^$/.test(before);
                const spaceAfter = /\s|^$/.test(after);
                const punctBefore = PUNCTUATION.test(before);
                const punctAfter = PUNCTUATION.test(after);
                return cx.addDelimiter(
                    HighlightDelimiter,
                    pos,
                    pos + 2,
                    !spaceAfter && (!punctAfter || spaceBefore || punctBefore),
                    !spaceBefore && (!punctBefore || spaceAfter || punctAfter)
                );
            },
            after: "Emphasis",
        },
    ],
};

/* ── widgets ───────────────────────────────────────────────────────────── */

function toggleTaskAt(view: EditorView, dom: HTMLElement): boolean {
    const pos = view.posAtDOM(dom);
    const line = view.state.doc.lineAt(pos);
    const prefix = readLinePrefix(line.text);
    if (!prefix || prefix.kind !== "task") return false;
    const index = line.from + prefix.boxAt + 1;
    view.dispatch({
        changes: {
            from: index,
            to: index + 1,
            insert: prefix.mark === " " ? "x" : " ",
        },
        userEvent: "input",
    });
    return true;
}

class CheckboxWidget extends WidgetType {
    constructor(
        readonly done: boolean,
        readonly editable: boolean,
        readonly handlers: () => LivePreviewHandlers
    ) {
        super();
    }

    eq(other: CheckboxWidget): boolean {
        return other.done === this.done && other.editable === this.editable;
    }

    toDOM(view: EditorView): HTMLElement {
        const box = document.createElement("button");
        box.type = "button";
        box.className = "nc-desc-checkbox nc-panel-checklist-checkbox";
        box.setAttribute("role", "checkbox");
        box.setAttribute("aria-checked", String(this.done));
        box.tabIndex = -1;
        box.disabled = !this.editable;
        box.innerHTML = renderToStaticMarkup(
            React.createElement(TaskCheckbox, { completed: this.done })
        );
        // The box is a whole gesture of its own: it must neither move the
        // caret nor take the focus, so everything happens on the press.
        box.addEventListener("mousedown", (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!this.editable || event.button !== 0) return;
            if (toggleTaskAt(view, box)) this.handlers().onToggle?.();
        });
        return box;
    }

    ignoreEvent(): boolean {
        return true;
    }
}

class BulletWidget extends WidgetType {
    eq(): boolean {
        return true;
    }

    toDOM(): HTMLElement {
        const dot = document.createElement("span");
        dot.className = "nc-desc-bullet nc-panel-checklist-bullet";
        dot.setAttribute("aria-hidden", "true");
        return dot;
    }

    ignoreEvent(): boolean {
        return false;
    }
}

/* ── decorations ───────────────────────────────────────────────────────── */

/*
 * Hanging indent. A wrapped line of a list item starts under the first
 * character of the item's TEXT, never under its marker. Each piece in front
 * of the text has a width that is known exactly (the indent and the number
 * are inline-blocks of a set width, the box and the dot are 14 px + 7 px), so
 * the line takes `padding-left: W` and `text-indent: -W` with W their sum.
 * W does not depend on whether the marker is drawn or revealed raw: focus
 * entering never moves the first line, the raw marker just wraps as text.
 */
const INDENT_TAB_PX = 28;
const INDENT_SPACE_PX = 7;
const MARKER_WIDGET_PX = 21;

function indentWidthPx(indent: string): number {
    let width = 0;
    for (const ch of indent) {
        width += ch === "	" ? INDENT_TAB_PX : INDENT_SPACE_PX;
    }
    return width;
}

/** The line decoration of a list item: its class and its hanging indent. */
export function hangingLine(cls: string, px: number, ch: number): Decoration {
    const width = `calc(${px}px + ${ch}ch)`;
    return Decoration.line({
        attributes: {
            class: cls,
            style: `padding-left:${width};text-indent:calc(-1 * ${width})`,
        },
    });
}

const HIDDEN = Decoration.replace({});

const INLINE_MARKS: Record<string, { cls: string; marks: string }> = {
    StrongEmphasis: { cls: "nc-desc-strong", marks: "EmphasisMark" },
    Emphasis: { cls: "nc-desc-em", marks: "EmphasisMark" },
    Strikethrough: { cls: "nc-desc-strike", marks: "StrikethroughMark" },
    Highlight: { cls: "nc-desc-highlight", marks: "HighlightMark" },
    InlineCode: { cls: "nc-desc-code", marks: "CodeMark" },
};

function unescapeLabel(value: string): string {
    return value.replace(/\\([\\\]])/g, "$1");
}

function linkMark(link: InlineLink): Decoration {
    return Decoration.mark({
        class: "nc-desc-link",
        attributes: {
            "data-nc-start": String(link.start),
            "data-nc-end": String(link.end),
            "data-nc-target": link.target,
            "data-nc-label": link.label,
        },
    });
}

export function buildDecorations(
    state: EditorState,
    handlers: () => LivePreviewHandlers,
    /** False while the editor does not hold the focus: nothing is revealed. */
    revealing = true
): DecorationSet {
    const doc = state.doc;
    const tree = ensureSyntaxTree(state, doc.length, 200) ?? syntaxTree(state);
    const out: Range<Decoration>[] = [];
    const selections = revealing ? state.selection.ranges : [];
    const editable = handlers().isEditable?.() ?? true;

    const touchesInline = (from: number, to: number) =>
        selections.some((r) => r.from <= to && r.to >= from);
    const touchesMarker = (from: number, to: number) =>
        selections.some((r) =>
            r.empty ? r.from >= from && r.from < to : r.from < to && r.to > from
        );
    const touchesLine = (from: number, to: number) =>
        selections.some((r) => r.from <= to && r.to >= from);

    const fenced: Array<[number, number]> = [];
    const code: Array<[number, number]> = [];

    tree.iterate({
        enter(node) {
            const name = node.name;
            if (name === "FencedCode") {
                fenced.push([node.from, node.to]);
                return false;
            }

            const inline = INLINE_MARKS[name];
            if (inline) {
                if (name === "InlineCode") code.push([node.from, node.to]);
                out.push(
                    Decoration.mark({ class: inline.cls }).range(
                        node.from,
                        node.to
                    )
                );
                if (!touchesInline(node.from, node.to)) {
                    for (
                        let child = node.node.firstChild;
                        child;
                        child = child.nextSibling
                    ) {
                        if (child.name === inline.marks) {
                            out.push(HIDDEN.range(child.from, child.to));
                        }
                    }
                }
                return name === "InlineCode" ? false : undefined;
            }

            if (name === "Link") {
                const marks: Array<{ from: number; to: number }> = [];
                let url: { from: number; to: number } | null = null;
                for (
                    let child = node.node.firstChild;
                    child;
                    child = child.nextSibling
                ) {
                    if (child.name === "LinkMark") {
                        marks.push({ from: child.from, to: child.to });
                    } else if (child.name === "URL") {
                        url = { from: child.from, to: child.to };
                    }
                }
                if (!url || marks.length < 4) return undefined;
                const labelFrom = marks[0].to;
                const labelTo = marks[1].from;
                if (labelTo <= labelFrom) return undefined;
                const link: InlineLink = {
                    start: node.from,
                    end: node.to,
                    label: unescapeLabel(doc.sliceString(labelFrom, labelTo)),
                    target: doc
                        .sliceString(url.from, url.to)
                        .replace(/^<|>$/g, "")
                        .trim(),
                };
                if (touchesInline(node.from, node.to)) {
                    out.push(
                        Decoration.mark({ class: "nc-desc-link-raw" }).range(
                            node.from,
                            node.to
                        )
                    );
                } else {
                    out.push(HIDDEN.range(node.from, labelFrom));
                    out.push(linkMark(link).range(labelFrom, labelTo));
                    out.push(HIDDEN.range(labelTo, node.to));
                }
                return undefined;
            }

            if (name === "Autolink") {
                let url: { from: number; to: number } | null = null;
                for (
                    let child = node.node.firstChild;
                    child;
                    child = child.nextSibling
                ) {
                    if (child.name === "URL") {
                        url = { from: child.from, to: child.to };
                    }
                }
                if (!url) return undefined;
                const target = doc.sliceString(url.from, url.to);
                const link: InlineLink = {
                    start: node.from,
                    end: node.to,
                    label: target,
                    target,
                };
                if (touchesInline(node.from, node.to)) {
                    out.push(
                        Decoration.mark({ class: "nc-desc-link-raw" }).range(
                            node.from,
                            node.to
                        )
                    );
                } else {
                    out.push(HIDDEN.range(node.from, url.from));
                    out.push(linkMark(link).range(url.from, url.to));
                    out.push(HIDDEN.range(url.to, node.to));
                }
                return false;
            }

            if (name === "URL") {
                const parent = node.node.parent?.name;
                if (parent === "Link" || parent === "Image") return undefined;
                if (parent === "Autolink") return undefined;
                const target = doc.sliceString(node.from, node.to);
                out.push(
                    linkMark({
                        start: node.from,
                        end: node.to,
                        label: target,
                        target,
                    }).range(node.from, node.to)
                );
            }
            return undefined;
        },
    });

    const inside = (ranges: Array<[number, number]>, pos: number) =>
        ranges.some(([from, to]) => from <= pos && pos < to);

    for (let n = 1; n <= doc.lines; n += 1) {
        const line = doc.line(n);
        if (inside(fenced, line.from)) continue;
        const text = line.text;

        const heading = /^(#{1,6})[ \t]+/.exec(text);
        if (heading) {
            out.push(
                Decoration.line({
                    class: `nc-desc-heading nc-desc-heading-${heading[1].length}`,
                }).range(line.from)
            );
            if (!touchesLine(line.from, line.to)) {
                out.push(
                    HIDDEN.range(line.from, line.from + heading[0].length)
                );
            }
            continue;
        }

        const prefix = readLinePrefix(text);
        if (prefix) {
            const markerFrom =
                line.from +
                (prefix.kind === "task" && !prefix.bullet
                    ? prefix.boxAt
                    : prefix.indent.length);
            const markerTo = line.from + prefix.length;
            if (prefix.indent.length > 0) {
                out.push(
                    Decoration.mark({
                        class: "nc-desc-indent",
                        attributes: {
                            style: `width:${indentWidthPx(prefix.indent)}px`,
                        },
                    }).range(line.from, line.from + prefix.indent.length)
                );
            }
            if (prefix.kind === "task" && !prefix.bullet) {
                // "1. " of a numbered task stays text, at a set width.
                const numberFrom = line.from + prefix.indent.length;
                out.push(
                    Decoration.mark({
                        class: "nc-desc-number",
                        attributes: {
                            style: `width:${markerFrom - numberFrom}ch`,
                        },
                    }).range(numberFrom, markerFrom)
                );
            }

            if (prefix.kind === "task") {
                const done = prefix.mark === "x" || prefix.mark === "X";
                out.push(
                    hangingLine(
                        "nc-desc-line nc-desc-task",
                        indentWidthPx(prefix.indent) + MARKER_WIDGET_PX,
                        prefix.bullet ? 0 : prefix.boxAt - prefix.indent.length
                    ).range(line.from)
                );
                if (!touchesMarker(markerFrom, markerTo)) {
                    out.push(
                        Decoration.replace({
                            widget: new CheckboxWidget(
                                done,
                                editable,
                                handlers
                            ),
                        }).range(markerFrom, markerTo)
                    );
                }
                if (done && markerTo < line.to) {
                    out.push(
                        Decoration.mark({ class: "nc-desc-done" }).range(
                            markerTo,
                            line.to
                        )
                    );
                }
            } else if (prefix.kind === "bullet") {
                out.push(
                    hangingLine(
                        "nc-desc-line nc-desc-bulleted",
                        indentWidthPx(prefix.indent) + MARKER_WIDGET_PX,
                        0
                    ).range(line.from)
                );
                out.push(
                    Decoration.replace({ widget: new BulletWidget() }).range(
                        markerFrom,
                        markerFrom + 2
                    )
                );
            } else if (prefix.kind === "number") {
                out.push(
                    hangingLine(
                        "nc-desc-line nc-desc-numbered",
                        indentWidthPx(prefix.indent),
                        markerTo - markerFrom
                    ).range(line.from)
                );
                out.push(
                    Decoration.mark({
                        class: "nc-desc-number",
                        attributes: {
                            style: `width:${markerTo - markerFrom}ch`,
                        },
                    }).range(markerFrom, markerTo)
                );
            } else {
                out.push(
                    Decoration.line({ class: "nc-desc-quote" }).range(line.from)
                );
                // Never visible, on its own line either: the bar stands for it.
                out.push(HIDDEN.range(markerFrom, markerTo));
            }
        }

        // `<u>under</u>`: no markdown node, so it is read per line.
        const underline = /<u>([^<\n]*)<\/u>/g;
        for (let m = underline.exec(text); m; m = underline.exec(text)) {
            const from = line.from + m.index;
            const to = from + m[0].length;
            if (inside(code, from)) continue;
            out.push(
                Decoration.mark({ class: "nc-desc-underline" }).range(from, to)
            );
            if (!touchesInline(from, to)) {
                out.push(HIDDEN.range(from, from + 3));
                out.push(HIDDEN.range(to - 4, to));
            }
        }
    }

    return Decoration.set(out, true);
}

/* ── links: DOM events ─────────────────────────────────────────────────── */

function readLinkElement(target: EventTarget | null): {
    link: InlineLink;
    element: HTMLElement;
} | null {
    const element = (target as HTMLElement | null)?.closest?.(
        ".nc-desc-link"
    ) as HTMLElement | null;
    if (!element) return null;
    const start = Number(element.getAttribute("data-nc-start"));
    const end = Number(element.getAttribute("data-nc-end"));
    const targetUrl = element.getAttribute("data-nc-target");
    if (!Number.isFinite(start) || !Number.isFinite(end) || !targetUrl) {
        return null;
    }
    return {
        element,
        link: {
            start,
            end,
            target: targetUrl,
            label: element.getAttribute("data-nc-label") ?? targetUrl,
        },
    };
}

const theme = EditorView.theme({
    "&": {
        backgroundColor: "transparent",
        color: "inherit",
        fontSize: "inherit",
    },
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": {
        overflow: "visible",
        fontFamily: "inherit",
        lineHeight: "inherit",
    },
    ".cm-content": {
        padding: "0",
        caretColor: "currentColor",
        tabSize: "4",
        fontFamily: "inherit",
    },
    ".cm-line": { padding: "0" },
    ".cm-placeholder": { color: "var(--nc-text-faint, var(--text-faint))" },
    ".nc-desc-checkbox": {
        verticalAlign: "-2px",
        marginRight: "7px",
    },
    ".nc-desc-bullet": {
        display: "inline-grid",
        verticalAlign: "-2px",
        marginRight: "7px",
    },
    // Inline-blocks of a set width: the hanging indent counts on them. They
    // must not inherit the line's negative text-indent.
    ".nc-desc-indent": {
        display: "inline-block",
        whiteSpace: "pre",
        textIndent: "0",
        overflow: "hidden",
        verticalAlign: "bottom",
    },
    ".nc-desc-number": {
        display: "inline-block",
        whiteSpace: "pre",
        textIndent: "0",
        verticalAlign: "bottom",
    },
    ".nc-desc-done": {
        textDecoration: "line-through",
        color: "var(--nc-text-faint, var(--text-faint))",
    },
    ".nc-desc-strong": { fontWeight: "700" },
    ".nc-desc-em": { fontStyle: "italic" },
    ".nc-desc-strike": { textDecoration: "line-through" },
    ".nc-desc-underline": { textDecoration: "underline" },
    ".nc-desc-highlight": {
        backgroundColor:
            "color-mix(in srgb, var(--nc-accent, #f5c542) 30%, transparent)",
        borderRadius: "2px",
    },
    ".nc-desc-code": {
        fontFamily: "var(--font-monospace, ui-monospace, monospace)",
        backgroundColor: "color-mix(in srgb, currentColor 10%, transparent)",
        borderRadius: "3px",
    },
    ".nc-desc-link": {
        color: "var(--nc-accent, #4f8cff)",
        textDecoration: "underline",
        cursor: "pointer",
    },
    ".nc-desc-link-raw": { color: "var(--nc-accent, #4f8cff)" },
    ".nc-desc-heading": { fontWeight: "700" },
    ".nc-desc-heading-1": { fontSize: "1.5em" },
    ".nc-desc-heading-2": { fontSize: "1.3em" },
    ".nc-desc-heading-3": { fontSize: "1.15em" },
    ".nc-desc-quote": {
        borderLeft: "3px solid var(--nc-text-faint, currentColor)",
        paddingLeft: "10px",
    },
});

/**
 * The live preview extension. `handlers` is read on every use, so the owner
 * can hand over fresh callbacks each render without rebuilding the editor.
 */
export function livePreview(handlers: () => LivePreviewHandlers): Extension {
    // A caret that is not being used reveals nothing: a panel opened on a
    // description that starts with a task or a link must show the box and the
    // name, not `- [ ]` and `[name](address)` because the caret rests at 0.
    const setFocused = StateEffect.define<boolean>();
    const focused = StateField.define<boolean>({
        create: () => false,
        update(value, tr) {
            for (const effect of tr.effects) {
                if (effect.is(setFocused)) return effect.value;
            }
            return value;
        },
    });
    const field = StateField.define<DecorationSet>({
        create: (state) => buildDecorations(state, handlers, false),
        update(value, tr: Transaction) {
            if (
                tr.docChanged ||
                tr.selection ||
                tr.effects.some((effect) => effect.is(setFocused)) ||
                syntaxTree(tr.state) !== syntaxTree(tr.startState) ||
                tr.reconfigured
            ) {
                return buildDecorations(
                    tr.state,
                    handlers,
                    tr.state.field(focused)
                );
            }
            return value;
        },
        provide: (f) => EditorView.decorations.from(f),
    });

    return [
        // No markdown keymap: its Backspace swallows a whole list marker (
        // "- [ ] |a" became "|a"); Obsidian deletes one character.
        markdown({
            base: markdownLanguage,
            extensions: [Highlight],
            addKeymap: false,
        }),
        focused,
        field,
        theme,
        EditorView.lineWrapping,
        EditorView.domEventHandlers({
            focus(_event, view) {
                view.dispatch({ effects: setFocused.of(true) });
                return false;
            },
            blur(_event, view) {
                view.dispatch({ effects: setFocused.of(false) });
                return false;
            },
            mousedown(event, view) {
                const hit = readLinkElement(event.target);
                if (!hit) return false;
                // The press itself acts, so the caret never lands in the link
                // and swaps the rendering out from under the click.
                event.preventDefault();
                if (event.button === 0) handlers().onOpenLink?.(hit.link);
                return true;
            },
            contextmenu(event) {
                const hit = readLinkElement(event.target);
                if (!hit) return false;
                event.preventDefault();
                handlers().onLinkMenu?.(
                    hit.link,
                    hit.element.getBoundingClientRect()
                );
                return true;
            },
        }),
    ];
}
