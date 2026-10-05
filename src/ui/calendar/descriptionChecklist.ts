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
    | { kind: "bullet"; text: string; indent: string }
    | { kind: "task"; done: boolean; title: string; indent: string };

/*
 * `- [ ] `, `* [x] `, `+ [/] `, with whatever indent precedes them.
 *
 * The three bullets are the three Markdown allows, and a task needs a bullet:
 * `[ ] alone` in a sentence is a pair of brackets, not a box. The space after
 * the box is required too, so `- [x]something` stays prose.
 */
const TASK_LINE = /^(\s*)([-*+]) \[(.)\] ?(.*)$/;

/**
 * `- `, `* `, `+ ` : une puce, et rien de plus.
 *
 * La meme famille que la case, une marche en dessous. Une ligne qui commence
 * ainsi EST un point de liste, en Markdown comme sous les yeux : la montrer
 * telle quelle laissait un tiret nu la ou tout autre editeur dessine un rond.
 * L'espace est exige pour la meme raison que sur la case : « -5 degres » n'est
 * pas une liste.
 */
const BULLET_LINE = /^(\s*)([-*+]) (.*)$/;

/** Marks other plugins write for "started", which is not "done". */
const DONE_MARKS = new Set(["x", "X"]);

/** Every line of a description, said as prose, as a bullet, or as a step. */
export function readChecklist(description: string): ChecklistLine[] {
    return description.split("\n").map((line) => {
        const match = TASK_LINE.exec(line);
        if (match) {
            return {
                kind: "task",
                done: DONE_MARKS.has(match[3]),
                title: match[4],
                indent: match[1],
            };
        }
        const bullet = BULLET_LINE.exec(line);
        if (bullet) {
            return { kind: "bullet", text: bullet[3], indent: bullet[1] };
        }
        return { kind: "text", text: line };
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
