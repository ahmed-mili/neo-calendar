import * as React from "react";
import { TaskCheckbox } from "./TaskCheckbox";
import { TaskItem, isOverdue, effectiveDue } from "../tasks/taskList";
import {
    buildDesktopTaskGroups,
    hasTaskCompletionDate,
} from "../tasks/desktopTaskGroups";
import { formatDatedDayWithYear } from "./calendarFormatters";
import { ChevronDownIcon } from "./Icons";
import { t } from "../i18n";

interface TasksPanelProps {
    tasks: TaskItem[];
    /** Today as ISO `YYYY-MM-DD`, passed in so the panel stays pure to test. */
    today: string;
    onTaskClick: (taskId: string) => void;
    onAddTask: () => void;
    onToggleTask: (taskId: string, isDone: boolean) => Promise<boolean>;
}

/**
 * Parse an ISO day WITHOUT going through Date's UTC parsing.
 *
 * `new Date("2026-08-09")` is midnight UTC, which is the 8th once the machine
 * sits west of Greenwich — the label would be off by a day for half the world.
 * Splitting the parts builds the date in local time, where it belongs.
 */
function isoToLocalDate(iso: string): Date {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d);
}

function TaskRow({
    task,
    today,
    onTaskClick,
    onToggleTask,
}: {
    task: TaskItem;
    today: string;
    onTaskClick: (taskId: string) => void;
    onToggleTask: (taskId: string, isDone: boolean) => Promise<boolean>;
}) {
    const done = task.status === "complete";
    const late = isOverdue(task, today);
    // The day shown is the day the task is answerable for: its deadline when it
    // has one. Showing `date` instead would put a reassuring day next to a task
    // that is actually late, which is the confusion this panel exists to end.
    const day = effectiveDue(task);
    const hasDeadline = task.due !== null;
    // A dateless task has nothing to be "on time" or "late" for, so it can
    // never be marked complete — it stays in the outstanding pile until it
    // gets a date or a deadline.
    const canToggle =
        task.editable && hasTaskCompletionDate(task.date, task.due);
    const unavailableToggleLabel = t(
        "Add a date or deadline before completing this task"
    );
    return (
        <div
            className={`nc-tasks-item${done ? " nc-task-completed" : ""}`}
            onClick={() => onTaskClick(task.id)}
            onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onTaskClick(task.id);
                }
            }}
            role="button"
            tabIndex={0}
        >
            <button
                type="button"
                className="nc-tasks-checkbox"
                disabled={!canToggle}
                aria-label={done ? t("Complete") : t("To do")}
                title={canToggle ? undefined : unavailableToggleLabel}
                onClick={(e) => {
                    e.stopPropagation();
                    if (canToggle) onToggleTask(task.id, !done);
                }}
            >
                <TaskCheckbox completed={done} />
            </button>
            <span
                className="nc-tasks-dot"
                style={{ backgroundColor: task.color }}
                title={task.calendarName}
            />
            <span className="nc-tasks-title">
                {task.title || t("Untitled")}
            </span>
            {day && (
                <span
                    className={`nc-tasks-date${late ? " nc-tasks-late" : ""}`}
                    title={
                        late
                            ? t("Overdue")
                            : hasDeadline
                            ? t("Deadline")
                            : undefined
                    }
                >
                    {/* A deadline reads differently from a day set aside for
                        the work, so it is marked rather than left ambiguous. */}
                    {hasDeadline && (
                        <span className="nc-tasks-due-mark">⚑</span>
                    )}
                    {formatDatedDayWithYear(
                        isoToLocalDate(day),
                        isoToLocalDate(today).getFullYear()
                    )}
                </span>
            )}
        </div>
    );
}

/**
 * The task list: what is due, what has no date, and what is behind you.
 *
 * The grid answers "where do I have to be"; this answers "what do I have to
 * get done" — the question a calendar cannot hold, because a task that slipped
 * past its date is buried in a month nobody scrolls back to. Overdue tasks
 * lead the first section, which is the whole point of the panel existing.
 */
export default function TasksPanel({
    tasks,
    today,
    onTaskClick,
    onAddTask,
    onToggleTask,
}: TasksPanelProps) {
    // Finished work is kept but folded away: it answers "what did I get
    // through", which is worth asking and never urgent.
    const [doneOpen, setDoneOpen] = React.useState(false);

    // Same grouping as the desktop panel: outstanding and dateless tasks share
    // one pile instead of splitting into "To do" / "No date" — a task without
    // a date is still something to do, not a separate kind of thing.
    const groups = React.useMemo(
        () => buildDesktopTaskGroups(tasks),
        [tasks]
    );

    const rowsOf = (items: TaskItem[]) =>
        items.map((task) => (
            <TaskRow
                key={task.id}
                task={task}
                today={today}
                onTaskClick={onTaskClick}
                onToggleTask={onToggleTask}
            />
        ));

    const empty = groups.todo.length === 0 && groups.complete.length === 0;

    return (
        <div className="nc-tasks-panel">
            {empty && <div className="nc-tasks-empty">{t("No tasks yet")}</div>}

            {groups.todo.length > 0 && (
                <div className="nc-tasks-section">
                    <div className="nc-tasks-section-title">
                        {t("To do")}
                        <span className="nc-tasks-count">
                            {groups.todo.length}
                        </span>
                    </div>
                    {rowsOf(groups.todo)}
                </div>
            )}

            {groups.complete.length > 0 && (
                <div className="nc-tasks-section">
                    <div
                        className="nc-tasks-section-title nc-tasks-collapsible"
                        role="button"
                        tabIndex={0}
                        aria-expanded={doneOpen}
                        onClick={() => setDoneOpen((v) => !v)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setDoneOpen((v) => !v);
                            }
                        }}
                    >
                        <span
                            className={`nc-tasks-chevron${
                                doneOpen ? " nc-open" : ""
                            }`}
                        >
                            <ChevronDownIcon />
                        </span>
                        {t("Completed")}
                        <span className="nc-tasks-count">
                            {groups.complete.length}
                        </span>
                    </div>
                    {doneOpen && rowsOf(groups.complete)}
                </div>
            )}

            <button
                type="button"
                className="nc-tasks-add-btn"
                onClick={onAddTask}
            >
                {t("Add task")}
            </button>
        </div>
    );
}
