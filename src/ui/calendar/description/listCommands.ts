/**
 * The text transforms behind the description editor's keys, as pure functions.
 *
 * Every function maps `(text, from, to)` (a selection in a plain string) to the
 * new text and the new selection. Each row of the tables measured in Obsidian's
 * live preview (spec 2026-10-05, 4.3 and 4.4) is one case of
 * `listCommands.test.ts`: that file is the parity contract, so a change here
 * that turns a case red is a departure from Obsidian, not a test to adjust.
 *
 * Indentation is a TAB (Obsidian setting `useTab`, `tabSize: 4`).
 */

export interface EditResult {
    text: string;
    from: number;
    to: number;
}

/** One list-ish prefix at the start of a line: indent, then a marker. */
export interface LinePrefix {
    kind: "task" | "bullet" | "number" | "quote";
    indent: string;
    /** Whole prefix, indent included. */
    length: number;
    bullet: string;
    number: number;
    delimiter: string;
    /** The character inside `[ ]` of a task. */
    mark: string;
}

const LINE_PREFIX = /^([ \t]*)(?:([-*+]) \[(.)\] |([-*+]) |(\d+)([.)]) |(>) )/;

export function readLinePrefix(line: string): LinePrefix | null {
    const m = LINE_PREFIX.exec(line);
    if (!m) return null;
    const base = { indent: m[1], length: m[0].length };
    if (m[2]) {
        return {
            ...base,
            kind: "task",
            bullet: m[2],
            number: 0,
            delimiter: "",
            mark: m[3],
        };
    }
    if (m[4]) {
        return {
            ...base,
            kind: "bullet",
            bullet: m[4],
            number: 0,
            delimiter: "",
            mark: "",
        };
    }
    if (m[5]) {
        return {
            ...base,
            kind: "number",
            bullet: "",
            number: parseInt(m[5], 10),
            delimiter: m[6],
            mark: "",
        };
    }
    return {
        ...base,
        kind: "quote",
        bullet: ">",
        number: 0,
        delimiter: "",
        mark: "",
    };
}

function lineStartOf(text: string, pos: number): number {
    return pos <= 0 ? 0 : text.lastIndexOf("\n", pos - 1) + 1;
}

function lineEndOf(text: string, pos: number): number {
    const end = text.indexOf("\n", pos);
    return end === -1 ? text.length : end;
}

/** The lines a selection touches (one ending at a line start stops short of it). */
function touchedLines(
    text: string,
    from: number,
    to: number
): [number, number] {
    const first = lineStartOf(text, from);
    const lastPos = to > from && text[to - 1] === "\n" ? to - 1 : to;
    return [first, lineEndOf(text, lastPos)];
}

interface Edit {
    at: number;
    del: number;
    ins: string;
}

function mapPosition(pos: number, edit: Edit, assoc: 1 | -1): number {
    const end = edit.at + edit.del;
    const delta = edit.ins.length - edit.del;
    if (pos < edit.at) return pos;
    if (pos > end) return pos + delta;
    if (edit.del === 0) return assoc > 0 ? pos + delta : pos;
    if (pos === edit.at) return pos;
    if (pos === end) return pos + delta;
    return edit.at + (assoc > 0 ? edit.ins.length : 0);
}

/** Apply ascending, non-overlapping edits and carry the selection through. */
function applyEdits(
    text: string,
    edits: Edit[],
    from: number,
    to: number
): EditResult {
    let out = "";
    let cursor = 0;
    for (const edit of edits) {
        out += text.slice(cursor, edit.at) + edit.ins;
        cursor = edit.at + edit.del;
    }
    out += text.slice(cursor);

    const collapsed = from === to;
    let nextFrom = from;
    let nextTo = to;
    // Each edit is mapped in the coordinates the previous ones left behind.
    let shift = 0;
    for (const edit of edits) {
        const shifted = { ...edit, at: edit.at + shift };
        nextFrom = mapPosition(nextFrom, shifted, collapsed ? 1 : -1);
        nextTo = mapPosition(nextTo, shifted, 1);
        shift += edit.ins.length - edit.del;
    }
    return { text: out, from: nextFrom, to: nextTo };
}

function outdent(indent: string): string {
    if (indent.endsWith("\t")) return indent.slice(0, -1);
    return indent.slice(Math.min(4, indent.length));
}

function replaceRange(
    text: string,
    from: number,
    to: number,
    insert: string
): EditResult {
    const caret = from + insert.length;
    return {
        text: text.slice(0, from) + insert + text.slice(to),
        from: caret,
        to: caret,
    };
}

/** Enter. */
export function enter(text: string, from: number, to: number): EditResult {
    // A selection is replaced by a bare line break, never a list continuation.
    if (from !== to) return replaceRange(text, from, to, "\n");

    const caret = from;
    const start = lineStartOf(text, caret);
    const end = lineEndOf(text, caret);
    const line = text.slice(start, end);
    const prefix = readLinePrefix(line);
    const column = caret - start;

    // Between the brackets of a box (`- [|]`, even with its space gone) the
    // line is cut raw as well.
    const box = /^[ \t]*[-*+] \[[^\]\n]?\]/.exec(line);
    if (box && column > box[0].indexOf("[") && column < box[0].length) {
        return replaceRange(text, caret, caret, "\n");
    }

    if (!prefix) {
        const lead = /^[ \t]*/.exec(line)![0];
        return replaceRange(
            text,
            caret,
            caret,
            "\n" + (column >= lead.length ? lead : "")
        );
    }

    // Inside (or before) the marker the line is cut raw, as plain text.
    if (column < prefix.length) return replaceRange(text, caret, caret, "\n");

    // An empty item: out one level, or out of the list altogether.
    if (caret === end && line.length === prefix.length) {
        if (prefix.indent) {
            const next =
                outdent(prefix.indent) + line.slice(prefix.indent.length);
            return {
                text: text.slice(0, start) + next + text.slice(end),
                from: start + next.length,
                to: start + next.length,
            };
        }
        return {
            text: text.slice(0, start) + text.slice(end),
            from: start,
            to: start,
        };
    }

    let marker: string;
    if (prefix.kind === "task") marker = `${prefix.bullet} [ ] `;
    else if (prefix.kind === "bullet") marker = `${prefix.bullet} `;
    else if (prefix.kind === "number") {
        marker = `${prefix.number + 1}${prefix.delimiter} `;
    } else marker = "> ";
    return replaceRange(text, caret, caret, "\n" + prefix.indent + marker);
}

/** Shift+Enter: a new line aligned under the item's text, no new marker. */
export function shiftEnter(text: string, from: number, to: number): EditResult {
    const start = lineStartOf(text, from);
    const line = text.slice(start, lineEndOf(text, from));
    const prefix = readLinePrefix(line);
    if (prefix && prefix.kind !== "quote" && from - start >= prefix.length) {
        return replaceRange(
            text,
            from,
            to,
            "\n" +
                prefix.indent +
                " ".repeat(prefix.length - prefix.indent.length)
        );
    }
    if (prefix) return replaceRange(text, from, to, "\n");
    const lead = /^[ \t]*/.exec(line)![0];
    return replaceRange(
        text,
        from,
        to,
        "\n" + (from - start >= lead.length ? lead : "")
    );
}

/** Tab: indents every touched line by one tab, list or not. */
export function indent(text: string, from: number, to: number): EditResult {
    const [first, last] = touchedLines(text, from, to);
    const edits: Edit[] = [];
    let at = first;
    for (;;) {
        edits.push({ at, del: 0, ins: "\t" });
        const next = text.indexOf("\n", at);
        if (next === -1 || next >= last) break;
        at = next + 1;
    }
    return applyEdits(text, edits, from, to);
}

/** Shift+Tab: takes one indentation level off every touched line. */
export function outdentLines(
    text: string,
    from: number,
    to: number
): EditResult {
    const [first, last] = touchedLines(text, from, to);
    const edits: Edit[] = [];
    let at = first;
    for (;;) {
        const lead = /^[ \t]*/.exec(text.slice(at, lineEndOf(text, at)))![0];
        const removed = lead.length - outdent(lead).length;
        if (removed > 0) edits.push({ at, del: removed, ins: "" });
        const next = text.indexOf("\n", at);
        if (next === -1 || next >= last) break;
        at = next + 1;
    }
    return applyEdits(text, edits, from, to);
}

/** Ctrl+L: cycles the checkbox of the touched lines. */
export function toggleChecklist(
    text: string,
    from: number,
    to: number
): EditResult {
    const [first, last] = touchedLines(text, from, to);
    const multi = lineEndOf(text, first) < last;
    const edits: Edit[] = [];
    let at = first;
    for (;;) {
        const end = lineEndOf(text, at);
        const line = text.slice(at, end);
        const prefix = readLinePrefix(line);
        const lead = /^[ \t]*/.exec(line)![0].length;

        if (prefix?.kind === "task") {
            if (multi) {
                // task -> bullet
                edits.push({ at: at + lead + 2, del: 4, ins: "" });
            } else {
                edits.push({
                    at: at + lead + 3,
                    del: 1,
                    ins: prefix.mark === " " ? "x" : " ",
                });
            }
        } else if (prefix?.kind === "bullet") {
            edits.push({ at: at + lead + 2, del: 0, ins: "[ ] " });
        } else if (prefix?.kind === "number") {
            edits.push({
                at: at + lead,
                del: prefix.length - lead,
                ins: "- [ ] ",
            });
        } else if (!multi || line.trim() !== "") {
            edits.push({ at: at + lead, del: 0, ins: "- [ ] " });
        }

        if (end >= last) break;
        at = end + 1;
    }
    return applyEdits(text, edits, from, to);
}

const WORD = /[\p{L}\p{N}]/u;

function starRunBefore(text: string, pos: number): number {
    let n = 0;
    while (pos - n - 1 >= 0 && text[pos - n - 1] === "*") n += 1;
    return n;
}

function starRunAfter(text: string, pos: number): number {
    let n = 0;
    while (pos + n < text.length && text[pos + n] === "*") n += 1;
    return n;
}

/** `**` is present when both runs hold at least two stars; `*` when both are odd. */
function marked(mark: string, left: number, right: number): boolean {
    if (mark === "**") return left >= 2 && right >= 2;
    return left % 2 === 1 && right % 2 === 1;
}

/** Ctrl+B / Ctrl+I on `**` / `*`. */
export function toggleMark(
    text: string,
    from: number,
    to: number,
    mark: "**" | "*"
): EditResult {
    const m = mark.length;
    let a = from;
    let b = to;

    if (from === to) {
        while (a > 0 && WORD.test(text[a - 1])) a -= 1;
        while (b < text.length && WORD.test(text[b])) b += 1;
        if (a === b) {
            // No word under the caret: an empty pair, or the pair removed.
            if (
                text.slice(from - m, from) === mark &&
                text.slice(from, from + m) === mark
            ) {
                return {
                    text: text.slice(0, from - m) + text.slice(from + m),
                    from: from - m,
                    to: from - m,
                };
            }
            return {
                text: text.slice(0, from) + mark + mark + text.slice(from),
                from: from + m,
                to: from + m,
            };
        }
    }

    const keepCaret = from === to;
    const caretOffset = from - a;
    const inner = text.slice(a, b);

    // Marks inside the selection (`**sel**` selected whole).
    const leading = /^\**/.exec(inner)![0].length;
    const trailing = /\**$/.exec(inner)![0].length;
    if (inner.length > leading && marked(mark, leading, trailing)) {
        const next =
            text.slice(0, a) + inner.slice(m, inner.length - m) + text.slice(b);
        return { text: next, from: a, to: b - 2 * m };
    }

    // Marks just outside the selection.
    if (marked(mark, starRunBefore(text, a), starRunAfter(text, b))) {
        const next = text.slice(0, a - m) + inner + text.slice(b + m);
        return keepCaret
            ? {
                  text: next,
                  from: a - m + caretOffset,
                  to: a - m + caretOffset,
              }
            : { text: next, from: a - m, to: b - m };
    }

    const next = text.slice(0, a) + mark + inner + mark + text.slice(b);
    return keepCaret
        ? { text: next, from: a + m + caretOffset, to: a + m + caretOffset }
        : { text: next, from: a + m, to: b + m };
}

export const toggleBold = (text: string, from: number, to: number) =>
    toggleMark(text, from, to, "**");
export const toggleItalic = (text: string, from: number, to: number) =>
    toggleMark(text, from, to, "*");
