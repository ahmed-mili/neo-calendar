import { NeoEvent } from "../../types";

/**
 * The steps a task is made of.
 *
 * A task is one thing to get done; a subtask is one of the things it is made
 * of. They are kept on the task itself rather than as events of their own,
 * because a step has no place on the calendar — "pack the bags" does not want
 * an hour on Thursday, it wants a line under "move house" and a tick.
 *
 * On disk each one is a line of Markdown carrying its own checkbox (see
 * `SubtasksSchema` in types/schema.ts). This module is the only place that
 * knows that, so the panel deals in objects and the note stays readable.
 */

export interface Subtask {
    title: string;
    done: boolean;
}

/** `[x] Something`, `[ ] Something`, `[/] Something` — the mark and the rest. */
const MARKED = /^\s*\[(.)\]\s?(.*)$/s;

/**
 * Which marks mean "not done yet".
 *
 * The same three the rest of the app reads on an event's own checkbox (see
 * `checkboxTodo` in dailyNoteParsing): a blank box, and the two in-progress
 * marks other Obsidian plugins write. Anything else in the brackets is a tick
 * of some kind, whatever character was used to draw it.
 */
const OUTSTANDING_MARKS = new Set([" ", "", "/", "~"]);

/** One stored line, read back. A line with no checkbox is a step not started. */
export function parseSubtask(line: string): Subtask {
    const marked = MARKED.exec(line);
    if (!marked) return { title: line.trim(), done: false };
    return {
        done: !OUTSTANDING_MARKS.has(marked[1]),
        title: marked[2].trim(),
    };
}

/** One step, as the line that will be written for it. */
export function formatSubtask(subtask: Subtask): string {
    return `[${subtask.done ? "x" : " "}] ${subtask.title.trim()}`;
}

/**
 * The steps an event carries.
 *
 * Tolerant of what it finds: a note edited by hand can hold a single string, a
 * list with a stray number in it, or nothing at all, and none of those should
 * cost the person their other steps — or their event.
 */
export function readSubtasks(event: NeoEvent | null | undefined): Subtask[] {
    const raw = (event as { subtasks?: unknown } | null | undefined)?.subtasks;
    const lines =
        typeof raw === "string" ? [raw] : Array.isArray(raw) ? raw : [];
    return lines
        .filter((line): line is string => typeof line === "string")
        .map(parseSubtask)
        .filter((subtask) => subtask.title.length > 0);
}

/**
 * The steps, as they are saved — or nothing at all when there are none.
 *
 * `undefined` rather than `[]` is what removes the key from the note: an event
 * that has no steps carries no list, exactly as it did before it ever had one
 * (see KEYS_DROPPED_WHEN_ABSENT). Blank lines are dropped on the way out, so an
 * empty box added and never filled in leaves nothing behind.
 */
export function writeSubtasks(subtasks: Subtask[]): string[] | undefined {
    const lines = subtasks
        .filter((subtask) => subtask.title.trim().length > 0)
        .map(formatSubtask);
    return lines.length ? lines : undefined;
}

/** How far along the list is: what is ticked, out of what there is. */
export function subtaskProgress(subtasks: Subtask[]): {
    done: number;
    total: number;
} {
    const counted = subtasks.filter(
        (subtask) => subtask.title.trim().length > 0
    );
    return {
        done: counted.filter((subtask) => subtask.done).length,
        total: counted.length,
    };
}
