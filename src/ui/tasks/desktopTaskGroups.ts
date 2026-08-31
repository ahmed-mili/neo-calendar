import { TaskStatus } from "./index";
import { TaskItem, effectiveDue } from "./taskList";

export interface DesktopTaskGroups {
    todo: TaskItem[];
    complete: TaskItem[];
}

export const hasTaskCompletionDate = (
    date: string | null | undefined,
    due: string | null | undefined
): boolean => Boolean(due ?? date);

export const normalizedDesktopTaskStatus = (task: TaskItem): TaskStatus =>
    task.status === "complete" && !hasTaskCompletionDate(task.date, task.due)
        ? "todo"
        : task.status;

export function buildDesktopTaskGroups(tasks: TaskItem[]): DesktopTaskGroups {
    const todo: TaskItem[] = [];
    const complete: TaskItem[] = [];

    for (const task of tasks) {
        const status = normalizedDesktopTaskStatus(task);
        const normalized =
            status === task.status
                ? task
                : { ...task, status: "todo" as const, completedAt: null };
        if (status === "complete") complete.push(normalized);
        else todo.push(normalized);
    }

    todo.sort((a, b) => {
        const aDue = effectiveDue(a);
        const bDue = effectiveDue(b);
        if (aDue && bDue) return aDue.localeCompare(bDue);
        if (aDue) return -1;
        if (bDue) return 1;
        return 0;
    });

    complete.sort((a, b) => {
        if (a.completedAt && b.completedAt)
            return b.completedAt.localeCompare(a.completedAt);
        if (a.completedAt) return -1;
        if (b.completedAt) return 1;
        return 0;
    });

    return { todo, complete };
}
