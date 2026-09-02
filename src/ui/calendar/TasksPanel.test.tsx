/** @jest-environment jsdom */
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act, Simulate } from "react-dom/test-utils";
import TasksPanel from "./TasksPanel";
import { t, applyLanguage } from "../i18n";
import { TaskItem } from "../tasks/taskList";

const tasks: TaskItem[] = [
    {
        id: "cvec",
        title: "Réinscription CVEC",
        date: "2026-09-02",
        due: null,
        status: "todo",
        completedAt: null,
        calendarId: "school",
        calendarName: "Études",
        color: "#0036b2",
        editable: true,
    },
    {
        id: "gym",
        title: "Séance jambes",
        date: "2026-09-02",
        due: null,
        status: "todo",
        completedAt: null,
        calendarId: "gym",
        calendarName: "Musculation",
        color: "#ff4000",
        editable: true,
    },
    {
        id: "vault",
        title: "Organisation du vault",
        date: "2026-09-01",
        due: null,
        status: "complete",
        completedAt: "2026-09-01T10:00:00.000Z",
        calendarId: "prod",
        calendarName: "Productivité",
        color: "#ffb300",
        editable: true,
    },
];

describe("TasksPanel", () => {
    let host: HTMLDivElement;

    const render = (items: TaskItem[] = tasks) => {
        act(() => {
            ReactDOM.render(
                <TasksPanel
                    tasks={items}
                    today="2026-09-03"
                    onTaskClick={() => {}}
                    onAddTask={() => {}}
                    onToggleTask={async () => true}
                />,
                host
            );
        });
    };

    const search = (): HTMLInputElement => {
        const found = host.querySelector<HTMLInputElement>(
            ".nc-tasks-search input"
        );
        if (!found) throw new Error("Le champ de recherche est absent");
        return found;
    };

    const type = (value: string) => {
        const field = search();
        act(() => {
            field.value = value;
            Simulate.change(field);
        });
    };

    beforeEach(() => {
        applyLanguage("fr");
        host = document.createElement("div");
        document.body.appendChild(host);
    });

    afterEach(() => {
        act(() => {
            ReactDOM.unmountComponentAtNode(host);
        });
        host.remove();
    });

    it("offers a search field as soon as there is something to look through", () => {
        render();
        expect(search()).toBeTruthy();
    });

    it("says nothing to search when there is nothing", () => {
        // Un champ de recherche au-dessus de « Aucune tâche » ne promet rien
        // qu'on puisse tenir.
        render([]);
        expect(host.querySelector(".nc-tasks-search")).toBeNull();
        expect(host.textContent).toContain(t("No tasks yet"));
    });

    it("keeps only what is typed, accents aside", () => {
        render();
        type("reinscription");

        expect(host.textContent).toContain("Réinscription CVEC");
        expect(host.textContent).not.toContain("Séance jambes");
    });

    it("searches the finished pile too, and unfolds it to show what it found", () => {
        // Replié, « Terminé » cacherait le seul résultat : la recherche
        // dirait « rien » alors qu'elle a trouvé.
        render();
        type("vault");

        expect(host.textContent).toContain("Organisation du vault");
    });

    it("folds the finished pile back once the field is emptied", () => {
        render();
        type("vault");
        type("");

        expect(host.textContent).not.toContain("Organisation du vault");
    });

    it("counts what is shown, not what is hidden", () => {
        render();
        type("cvec");

        const count = host.querySelector(".nc-tasks-count");
        expect(count?.textContent).toBe("1");
    });

    it("says so rather than showing empty sections", () => {
        render();
        type("zzz introuvable");

        expect(host.textContent).toContain(t("Nothing matches"));
        expect(host.textContent).not.toContain("Réinscription CVEC");
    });

    it("still offers to add a task while a search is running", () => {
        // Le bouton n'est pas un resultat de recherche : il reste la.
        render();
        type("zzz introuvable");

        expect(host.textContent).toContain(t("Add task"));
    });
});
