/** @jest-environment jsdom */
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act, Simulate } from "react-dom/test-utils";
import DesktopTasksPanel from "./DesktopTasksPanel";
import { t, applyLanguage } from "../i18n";
import { TaskItem } from "../tasks/taskList";

const tasks: TaskItem[] = [
    {
        id: "dated",
        title: "Tâche datée",
        date: "2026-09-02",
        due: null,
        status: "todo",
        completedAt: null,
        calendarId: "work",
        calendarName: "Travail",
        color: "#e9973f",
        editable: true,
    },
    {
        id: "undated",
        title: "Tâche sans date",
        date: null,
        due: null,
        status: "todo",
        completedAt: null,
        calendarId: "work",
        calendarName: "Travail",
        color: "#e9973f",
        editable: true,
    },
    {
        id: "complete",
        title: "Tâche terminée",
        date: "2026-09-01",
        due: null,
        status: "complete",
        completedAt: "2026-09-01T10:00:00.000Z",
        calendarId: "home",
        calendarName: "Maison",
        color: "#2f9e44",
        editable: true,
    },
];

describe("DesktopTasksPanel", () => {
    let host: HTMLDivElement;
    let onTaskClick: jest.Mock<void, [string]>;
    let onToggleTask: jest.Mock<Promise<boolean>, [string, boolean]>;

    const button = (label: string): HTMLButtonElement => {
        const found = Array.from(document.querySelectorAll("button")).find(
            (element) => element.textContent?.includes(label)
        );
        if (!found) throw new Error(`Button not found: ${label}`);
        return found as HTMLButtonElement;
    };

    beforeEach(() => {
        applyLanguage("fr");
        host = document.createElement("div");
        document.body.appendChild(host);
        onTaskClick = jest.fn();
        onToggleTask = jest.fn(async () => true);
        act(() => {
            ReactDOM.render(
                <DesktopTasksPanel
                    tasks={tasks}
                    today="2026-09-03"
                    onTaskClick={onTaskClick}
                    onToggleTask={onToggleTask}
                />,
                host
            );
        });
    });

    afterEach(() => {
        act(() => {
            ReactDOM.unmountComponentAtNode(host);
        });
        host.remove();
        document.body.innerHTML = "";
        applyLanguage("fr");
    });

    it("shows counts only until an outstanding group is opened", () => {
        expect(button(t("To do")).textContent).toContain("2");
        expect(button(t("Complete")).textContent).toContain("1");
        expect(document.body.textContent).not.toContain(t("No date"));
        expect(document.body.textContent).not.toContain(t("Add task"));

        act(() => Simulate.click(button(t("To do"))));

        expect(document.body.querySelector('[role="dialog"]')).toBeTruthy();
        expect(document.body.textContent).toContain("Tâche sans date");
        expect(
            (
                document.body.querySelector(
                    '[data-task-id="undated"] .nc-tasks-checkbox'
                ) as HTMLButtonElement
            ).disabled
        ).toBe(true);
    });

    it("opens completed tasks and closes its modal with Escape or the backdrop", () => {
        act(() => Simulate.click(button(t("Complete"))));
        expect(document.body.textContent).toContain("Tâche terminée");

        act(() => {
            document.dispatchEvent(
                new KeyboardEvent("keydown", { key: "Escape" })
            );
        });
        expect(document.body.querySelector('[role="dialog"]')).toBeNull();

        act(() => Simulate.click(button(t("Complete"))));
        const backdrop = document.body.querySelector(
            ".nc-task-modal-backdrop"
        ) as HTMLDivElement;
        act(() => Simulate.click(backdrop));
        expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    });

    it("closes before opening the selected task", () => {
        act(() => Simulate.click(button(t("To do"))));
        const task = document.body.querySelector(
            '[data-task-id="dated"]'
        ) as HTMLDivElement;

        act(() => Simulate.click(task));

        expect(onTaskClick).toHaveBeenCalledWith("dated");
        expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    });

    it("toggles a dated task from its checkbox keyboard control without opening it", () => {
        act(() => Simulate.click(button(t("To do"))));
        const checkbox = document.body.querySelector(
            '[data-task-id="dated"] .nc-tasks-checkbox'
        ) as HTMLButtonElement;

        checkbox.focus();
        act(() => Simulate.keyDown(checkbox, { key: " " }));

        expect(onToggleTask).toHaveBeenCalledWith("dated", true);
        expect(onTaskClick).not.toHaveBeenCalled();
        expect(document.body.querySelector('[role="dialog"]')).toBeTruthy();
    });

    it("focuses and traps the dialog before restoring focus to its trigger", () => {
        const trigger = button(t("To do"));
        act(() => Simulate.click(trigger));

        const dialog = document.body.querySelector(
            '[role="dialog"]'
        ) as HTMLElement;
        const close = dialog.querySelector(
            ".nc-task-modal-close"
        ) as HTMLButtonElement;
        const focusable = Array.from(
            dialog.querySelectorAll<HTMLElement>(
                'button:not(:disabled), [tabindex]:not([tabindex="-1"])'
            )
        );
        const last = focusable[focusable.length - 1];

        expect(document.activeElement).toBe(close);

        last.focus();
        act(() => Simulate.keyDown(last, { key: "Tab" }));
        expect(document.activeElement).toBe(close);

        close.focus();
        act(() => Simulate.keyDown(close, { key: "Tab", shiftKey: true }));
        expect(document.activeElement).toBe(last);

        act(() => Simulate.click(close));
        expect(document.activeElement).toBe(trigger);
    });
});
