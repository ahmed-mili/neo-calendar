import * as React from "react";
import * as ReactDOM from "react-dom";
import { TaskItem, effectiveDue, isOverdue } from "../tasks/taskList";
import {
    buildDesktopTaskGroups,
    hasTaskCompletionDate,
} from "../tasks/desktopTaskGroups";
import { formatDatedDayWithYear } from "./calendarFormatters";
import { TaskCheckbox } from "./TaskCheckbox";
import { XIcon } from "./Icons";
import { t } from "../i18n";

type DesktopTaskGroup = "todo" | "complete";

interface DesktopTasksPanelProps {
    tasks: TaskItem[];
    today: string;
    onTaskClick: (taskId: string) => void;
    onToggleTask: (taskId: string, isDone: boolean) => Promise<boolean>;
}

function isoToLocalDate(iso: string): Date {
    const [year, month, day] = iso.split("-").map(Number);
    return new Date(year, month - 1, day);
}

function TaskRow({
    task,
    today,
    onTaskClick,
    onToggleTask,
}: {
    task: TaskItem;
    today: string;
    onTaskClick: (task: TaskItem) => void;
    onToggleTask: (taskId: string, isDone: boolean) => Promise<boolean>;
}) {
    const done = task.status === "complete";
    const late = isOverdue(task, today);
    const day = effectiveDue(task);
    const hasDeadline = task.due !== null;
    const canToggle =
        task.editable && hasTaskCompletionDate(task.date, task.due);
    const unavailableToggleLabel = t(
        "Add a date or deadline before completing this task"
    );

    return (
        <div
            className={`nc-tasks-item${done ? " nc-task-completed" : ""}`}
            data-task-id={task.id}
            onClick={() => onTaskClick(task)}
            onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onTaskClick(task);
                }
            }}
            role="button"
            tabIndex={0}
        >
            <button
                type="button"
                className="nc-tasks-checkbox"
                disabled={!canToggle}
                aria-label={
                    canToggle
                        ? done
                            ? t("Complete")
                            : t("To do")
                        : unavailableToggleLabel
                }
                title={canToggle ? undefined : unavailableToggleLabel}
                onClick={(event) => {
                    event.stopPropagation();
                    if (canToggle) void onToggleTask(task.id, !done);
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

export default function DesktopTasksPanel({
    tasks,
    today,
    onTaskClick,
    onToggleTask,
}: DesktopTasksPanelProps) {
    const [openGroup, setOpenGroup] = React.useState<DesktopTaskGroup | null>(
        null
    );
    const groups = React.useMemo(() => buildDesktopTaskGroups(tasks), [tasks]);
    const close = React.useCallback(() => setOpenGroup(null), []);

    React.useEffect(() => {
        if (openGroup === null) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") close();
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [close, openGroup]);

    const openTask = (task: TaskItem) => {
        close();
        onTaskClick(task.id);
    };

    const modal =
        openGroup !== null && typeof document !== "undefined"
            ? ReactDOM.createPortal(
                  <div
                      className="nc-task-modal-backdrop"
                      data-nc-popup-portal="true"
                      onClick={(event) => {
                          if (event.target === event.currentTarget) close();
                      }}
                  >
                      <section
                          className="nc-task-modal"
                          role="dialog"
                          aria-modal="true"
                          aria-labelledby="nc-task-modal-title"
                      >
                          <header className="nc-task-modal-header">
                              <h2 id="nc-task-modal-title">
                                  {t(
                                      openGroup === "todo"
                                          ? "To do"
                                          : "Complete"
                                  )}
                              </h2>
                              <button
                                  type="button"
                                  className="nc-task-modal-close"
                                  aria-label={t("Close")}
                                  title={t("Close")}
                                  onClick={close}
                              >
                                  <XIcon size={14} />
                              </button>
                          </header>
                          <div className="nc-task-modal-list">
                              {groups[openGroup].map((task) => (
                                  <TaskRow
                                      key={task.id}
                                      task={task}
                                      today={today}
                                      onTaskClick={openTask}
                                      onToggleTask={onToggleTask}
                                  />
                              ))}
                          </div>
                      </section>
                  </div>,
                  document.body
              )
            : null;

    return (
        <>
            <div className="nc-desktop-tasks-summary">
                <button
                    type="button"
                    className="nc-status-pill nc-status-todo"
                    onClick={() => setOpenGroup("todo")}
                >
                    <span className="nc-status-dot nc-dot-todo" />
                    {t("To do")}
                    <span className="nc-desktop-tasks-count">
                        {groups.todo.length}
                    </span>
                </button>
                <button
                    type="button"
                    className="nc-status-pill nc-status-complete"
                    onClick={() => setOpenGroup("complete")}
                >
                    <span className="nc-status-dot nc-dot-complete" />
                    {t("Complete")}
                    <span className="nc-desktop-tasks-count">
                        {groups.complete.length}
                    </span>
                </button>
            </div>
            {modal}
        </>
    );
}
