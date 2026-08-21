/**
 * The description, read as Obsidian reads a note.
 *
 * An event used to keep its steps in a list of its own, beside the description
 * — two places to write what has to be done, and only one of them was the note
 * the event actually is. A line beginning `- [ ]` in the description is a step
 * now, exactly as it is everywhere else in Obsidian, so what is typed in the
 * panel and what is typed in the file are the same thing.
 *
 * The text stays the truth. Nothing here holds a parsed list: a line is read
 * when it is drawn and rewritten in place when it is ticked, so a description
 * edited by hand, in the file, or on another machine never has to be
 * reconciled with a copy of itself.
 */

/** One line of a description, as the panel needs to draw it. */
export type ChecklistLine =
    | { kind: "text"; text: string }
    | { kind: "task"; done: boolean; title: string; indent: string };

/*
 * `- [ ] `, `* [x] `, `+ [/] `, with whatever indent precedes them.
 *
 * The three bullets are the three Markdown allows, and a task needs a bullet:
 * `[ ] alone` in a sentence is a pair of brackets, not a box. The space after
 * the box is required too, so `- [x]something` stays prose.
 */
const TASK_LINE = /^(\s*)([-*+]) \[(.)\] ?(.*)$/;

/** Marks other plugins write for "started", which is not "done". */
const DONE_MARKS = new Set(["x", "X"]);

/** Every line of a description, said as either prose or a step. */
export function readChecklist(description: string): ChecklistLine[] {
    return description.split("\n").map((line) => {
        const match = TASK_LINE.exec(line);
        if (!match) return { kind: "text", text: line };
        return {
            kind: "task",
            done: DONE_MARKS.has(match[3]),
            title: match[4],
            indent: match[1],
        };
    });
}

/**
 * The description with one box ticked or unticked, and nothing else touched.
 *
 * By line number rather than by title: two steps may read the same, and the one
 * that was pressed is the one that must change.
 */
export function toggleLine(description: string, index: number): string {
    const lines = description.split("\n");
    const line = lines[index];
    if (line === undefined) return description;

    const match = TASK_LINE.exec(line);
    if (!match) return description;

    const [, indent, bullet, mark, title] = match;
    const next = DONE_MARKS.has(mark) ? " " : "x";
    lines[index] = `${indent}${bullet} [${next}] ${title}`;
    return lines.join("\n");
}

/** A step as the panel used to keep it, before they became lines of text. */
export interface LegacyStep {
    title: string;
    done: boolean;
}

/**
 * The description an event with old-style steps should now be holding.
 *
 * Called once when such an event is opened: the steps are written out as lines
 * and the list they came from goes away. A step with no title says nothing once
 * it is a line, so it is left behind rather than written as an empty box.
 */
export function withStepsAppended(
    description: string,
    steps: readonly LegacyStep[]
): string {
    const lines = steps
        .filter((step) => step.title.trim())
        .map((step) => `- [${step.done ? "x" : " "}] ${step.title}`);
    if (!lines.length) return description.trim() ? description : "";

    const written = description.trim();
    return written ? `${written}\n${lines.join("\n")}` : lines.join("\n");
}

/** Where a line begins and ends inside the whole text, or nothing. */
function lineAt(
    description: string,
    index: number
): { lines: string[]; line: string } | null {
    const lines = description.split("\n");
    const line = lines[index];
    return line === undefined ? null : { lines, line };
}

/** The description with one line rewritten, and nothing else touched. */
export function replaceLine(
    description: string,
    index: number,
    replacement: string
): string {
    const found = lineAt(description, index);
    if (!found) return description;
    found.lines[index] = replacement;
    return found.lines.join("\n");
}

/** Where the caret lands after a line has been cut or joined. */
export interface CaretMove {
    text: string;
    /** Which line the caret is now on. */
    focus: number;
    /** How far into that line it sits. */
    caret: number;
}

/** The bullet and box a continued step is written with, or nothing. */
const stepPrefixOf = (line: string): string | null => {
    const match = TASK_LINE.exec(line);
    return match ? `${match[1]}${match[2]} [ ] ` : null;
};

/**
 * Enter, in the middle of a line.
 *
 * The list continues by itself: the line after a step is a step. Every Markdown
 * editor does this, and having to type `- [ ] ` again on each line is what puts
 * people off writing them at all.
 *
 * Except on an empty step, which is how one leaves a list — without that there
 * is no way back to prose underneath it.
 */
export function splitLine(
    description: string,
    index: number,
    caret: number
): CaretMove {
    const found = lineAt(description, index);
    if (!found) return { text: description, focus: index, caret };

    const { lines, line } = found;
    const before = line.slice(0, caret);
    const after = line.slice(caret);

    const prefix = stepPrefixOf(line);
    if (prefix && !line.slice(prefix.length).trim() && !after.trim()) {
        lines[index] = "";
        return { text: lines.join("\n"), focus: index, caret: 0 };
    }

    const continued = prefix ?? "";
    lines.splice(index, 1, before, continued + after);
    return {
        text: lines.join("\n"),
        focus: index + 1,
        caret: continued.length,
    };
}

/**
 * Backspace, at the very start of a line.
 *
 * A step loses its box first and stays where it is: that is how one takes a
 * checkbox off a line without losing what it says. A line that is already plain
 * joins the one above it, where the caret then sits at the join.
 */
export function mergeLine(description: string, index: number): CaretMove {
    const found = lineAt(description, index);
    if (!found) return { text: description, focus: index, caret: 0 };

    const { lines, line } = found;
    const match = TASK_LINE.exec(line);
    if (match) {
        lines[index] = match[4];
        return { text: lines.join("\n"), focus: index, caret: 0 };
    }

    if (index === 0) return { text: description, focus: 0, caret: 0 };
    const previous = lines[index - 1];
    lines.splice(index - 1, 2, previous + line);
    return {
        text: lines.join("\n"),
        focus: index - 1,
        caret: previous.length,
    };
}
