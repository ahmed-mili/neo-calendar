import { NeoEvent } from "../../types";
import { TaskStatus, getTaskStatus, isTask } from "./index";

/**
 * The task list, and the three questions it answers.
 *
 * A task differs from an event in that it does not pass: an event is over once
 * its hour has gone by, while a task stays due until it is done. The calendar
 * grid cannot express that — a task whose date has slipped by is buried in the
 * past, where nobody scrolls. So tasks need a list of their own, and that list
 * splits three ways:
 *
 *   - `todo`    dated and outstanding, most overdue first. This is the section
 *               that does the rolling over: an untouched task from last month
 *               sits at the top, not lost in March.
 *   - `undated` no date at all — the "someday" pile. It has nothing to be late
 *               for, so it stays out of `todo` rather than competing with real
 *               deadlines.
 *   - `done`    finished, most recently first. Kept, because "what did I get
 *               through" is a question worth answering, but collapsed by
 *               default because it is not work any more.
 *
 * Recurring series never appear here: the schema gives `completed` to `single`
 * and `someday` only, so a series has nowhere to record "done" and `isTask`
 * rejects it.
 */

export interface TaskItem {
    id: string;
    title: string;
    /** ISO `YYYY-MM-DD`, or null when the task carries no date at all. */
    date: string | null;
    status: TaskStatus;
    /** ISO timestamp of when it was finished; null while outstanding. */
    completedAt: string | null;
    calendarId: string;
    calendarName: string;
    color: string;
    editable: boolean;
}

export interface TaskSections {
    todo: TaskItem[];
    undated: TaskItem[];
    done: TaskItem[];
}

/** The shape `EventCache.getAllEvents()` hands back, narrowed to what we read. */
export interface TaskSource {
    id: string;
    name: string;
    color: string;
    editable: boolean;
    events: Array<{ id: string; event: NeoEvent }>;
}

/**
 * Every task across every calendar, straight from the cache.
 *
 * Deliberately NOT built from the windowed display events: those are expanded
 * over a few months around the current view, which is exactly where an overdue
 * task is not. A task from last year has to show up, so the raw store is the
 * only honest source.
 */
export function collectTasks(sources: TaskSource[]): TaskItem[] {
    const out: TaskItem[] = [];
    for (const source of sources) {
        for (const { id, event } of source.events) {
            if (!isTask(event)) continue;
            const status = getTaskStatus(event);
            if (!status) continue;
            // `completed` is the finish timestamp only once complete: while
            // outstanding it is `false` or the "in-progress" marker, neither
            // of which is a date.
            const completed = (event as { completed?: unknown }).completed;
            out.push({
                id,
                title: event.title,
                date: event.type === "single" ? event.date : null,
                status,
                completedAt:
                    status === "complete" && typeof completed === "string"
                        ? completed
                        : null,
                calendarId: source.id,
                calendarName: source.name,
                color: source.color,
                editable: source.editable,
            });
        }
    }
    return out;
}

/**
 * Outstanding, and its day has passed.
 *
 * `today` is an ISO `YYYY-MM-DD`; ISO dates sort lexicographically, so a plain
 * string compare is both correct and free of timezone drift — parsing to Date
 * would reintroduce the midnight-boundary bugs this format exists to avoid.
 */
export const isOverdue = (task: TaskItem, today: string): boolean =>
    task.status === "todo" && task.date !== null && task.date < today;

/** Split the flat list into the three sections, each in its reading order. */
export function buildTaskSections(
    tasks: TaskItem[],
    today: string
): TaskSections {
    const todo: TaskItem[] = [];
    const undated: TaskItem[] = [];
    const done: TaskItem[] = [];

    for (const task of tasks) {
        if (task.status === "complete") done.push(task);
        else if (task.date) todo.push(task);
        else undated.push(task);
    }

    // Oldest date first, so whatever is most overdue leads the list.
    todo.sort(
        (a, b) =>
            (a.date as string).localeCompare(b.date as string) ||
            a.title.localeCompare(b.title)
    );
    // Most recently finished first. A task completed before the plugin started
    // recording timestamps has no `completedAt`; those sink to the bottom
    // rather than claiming the top by accident.
    done.sort((a, b) => {
        if (a.completedAt && b.completedAt)
            return b.completedAt.localeCompare(a.completedAt);
        if (a.completedAt) return -1;
        if (b.completedAt) return 1;
        return a.title.localeCompare(b.title);
    });
    // `undated` keeps the order the calendars gave it: nothing about a dateless
    // task ranks it above another, and a stable list is easier to point at.

    return { todo, undated, done };
}

/** Today as the ISO day-string the sections compare against. */
export function todayISO(now: Date = new Date()): string {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
        now.getDate()
    )}`;
}
