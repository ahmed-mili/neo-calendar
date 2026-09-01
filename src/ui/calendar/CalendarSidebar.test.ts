/** @jest-environment jsdom */
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import * as fs from "fs";
import * as path from "path";
import CalendarSidebar from "./CalendarSidebar";
import { applyLanguage, t } from "../i18n";

const css = fs.readFileSync(
    path.join(__dirname, "CalendarSidebar.css"),
    "utf8"
);
const component = fs.readFileSync(
    path.join(__dirname, "CalendarSidebar.tsx"),
    "utf8"
);

const normalize = (value: string) => value.trim().replace(/\s+/g, " ");

const declarationsFor = (selector: string): Record<string, string> => {
    const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const rules = withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g);
    const declarations: Record<string, string> = {};
    let found = false;

    for (const rule of rules) {
        const selectors = rule[1].split(",").map(normalize);
        if (!selectors.includes(selector)) continue;
        found = true;

        for (const declaration of rule[2]
            .split(";")
            .map((value) => value.trim())
            .filter(Boolean)) {
            const separator = declaration.indexOf(":");
            declarations[declaration.slice(0, separator).trim()] = normalize(
                declaration.slice(separator + 1)
            );
        }
    }

    if (!found) throw new Error(`Missing CSS selector: ${selector}`);
    return declarations;
};

describe("hidden calendar identity", () => {
    it("stays invisible at rest and reappears on hover or keyboard focus", () => {
        expect(
            declarationsFor(".nc-calendar-hidden .nc-calendar-visibility")
                .opacity
        ).toBe("0");
        expect(
            declarationsFor(".nc-calendar-hidden .nc-calendar-name").opacity
        ).toBe("0");
        expect(
            declarationsFor(".nc-calendar-hidden .nc-calendar-default-label")
                .opacity
        ).toBe("0");

        for (const selector of [
            ".nc-calendar-hidden:hover",
            ".nc-calendar-hidden:has(:focus-visible)",
        ]) {
            expect(
                declarationsFor(`${selector} .nc-calendar-visibility`).opacity
            ).toBe("0.45");
            expect(
                declarationsFor(`${selector} .nc-calendar-name`).opacity
            ).toBe("0.45");
        }
        expect(css).not.toContain(".nc-calendar-hidden:focus-within");
    });

    it("transitions opacity in both masking directions", () => {
        expect(declarationsFor(".nc-calendar-visibility").transition).toBe(
            "opacity var(--nc-transition-normal)"
        );
        expect(declarationsFor(".nc-calendar-name").transition).toBe(
            "opacity var(--nc-transition-normal)"
        );
    });

    it("preserves the original name and swatch colors while disabled", () => {
        expect(css).not.toContain("--nc-hidden-calendar-color");
        expect(component).not.toMatch(
            /style=\{\s*hidden\s*\?\s*undefined\s*:\s*online/
        );
    });
});

describe("room for the update control", () => {
    it("centers the icon while the ready pill is collapsed", () => {
        const control = declarationsFor(".nc-update-control");
        const icon = declarationsFor(".nc-update-control__icon");
        expect(control.gap).toBe("0");
        expect(icon.width).toBe("15px");
        expect(icon.height).toBe("15px");
        expect(icon["justify-content"]).toBe("center");

        const open = declarationsFor(".nc-update-control--ready:hover");
        expect(open.gap).toBe("6px");
    });

    /*
     * The sidebar bar has 204px of content and the open control takes 114 of
     * them: with the version number still there, "Mettre à jour" ran out of the
     * panel and was cut mid-word. The number steps aside instead — it has
     * nothing to say at the moment the errand is under the cursor.
     */
    it("folds the version number away while the control is open", () => {
        for (const selector of [
            ".nc-sidebar-top-right:has(.nc-update-control--ready:hover) .nc-sidebar-version",
            ".nc-sidebar-top-right:has(.nc-update-control--ready:focus-visible) .nc-sidebar-version",
        ]) {
            const folded = declarationsFor(selector);
            expect(folded["max-width"]).toBe("0");
            expect(folded["margin-right"]).toBe("0");
            expect(folded.opacity).toBe("0");
        }
    });

    /*
     * Folding only reads as one movement if it is animated, and a width can
     * only be animated from a number — `auto` transitions to nothing.
     */
    it("gives the pill a width to animate from", () => {
        const pill = declarationsFor(".nc-sidebar-version");
        expect(pill["max-width"]).toBe("160px");
        expect(pill.overflow).toBe("hidden");
        expect(pill.transition).toContain("max-width");
    });
});

describe("calendar removal wording", () => {
    it("removes the calendar from the list without presenting a file delete action", () => {
        expect(component).toContain('label: t("Remove from list")');
        expect(component).toContain("icon: <ListXIcon />");
        expect(component).not.toContain('label: t("Delete")');
        expect(component).not.toContain('label: "Delete"');
    });
});

describe("ICS links menu entry", () => {
    it("offers Liens ICS on a local calendar and hands its id up, without touching the legacy ical menu", () => {
        expect(component).toContain('key: "ics-feeds"');
        expect(component).toContain('label: t("ICS links")');
        expect(component).toContain("onManageIcsFeeds(source.id)");
        // The legacy `ical` branch stays exactly as it was — this task does
        // not touch it (Task 6 removes it).
        expect(component).toContain('label: t("Edit link")');
    });

    it("opens the ICS links panel for a Full Note calendar from its menu", () => {
        const onManageIcsFeeds = jest.fn();
        const props: React.ComponentProps<typeof CalendarSidebar> = {
            sidebarVisible: true,
            currentDate: new Date(2026, 8, 3),
            viewType: "week",
            onViewTypeChange: () => {},
            dayCount: 7,
            onSetDayCount: () => {},
            calendarSources: [
                {
                    id: "cal-1",
                    name: "Cours",
                    color: "#4477aa",
                    editable: true,
                    type: "local",
                },
            ],
            firstDay: 1,
            onDateSelect: () => {},
            hiddenCalendars: new Set(),
            onToggleCalendar: () => {},
            defaultCalendarId: "",
            soloCalendarId: null,
            onSetDefaultCalendar: () => {},
            onShowOnly: () => {},
            tasks: [],
            today: "2026-09-03",
            onEventClick: () => {},
            onAddTask: () => {},
            onToggleTask: async () => true,
            onAddCalendar: () => {},
            onRenameCalendar: async () => {},
            onEditCalendarLink: () => {},
            onManageIcsFeeds,
            onDeleteCalendar: () => {},
            onColorChange: () => {},
            onReorderCalendars: () => {},
            onOpenCalendarFolder: () => {},
            onOpenRootFolder: () => {},
            onCalendarClick: () => {},
            selectedCalendarId: null,
            onToggleSidebar: () => {},
            onOpenSearch: () => {},
            onOpenSettings: () => {},
        };

        applyLanguage("fr");
        const host = document.createElement("div");
        document.body.appendChild(host);
        try {
            act(() => {
                ReactDOM.render(
                    React.createElement(CalendarSidebar, props),
                    host
                );
            });

            const trigger = Array.from(
                host.querySelectorAll<HTMLButtonElement>(
                    ".nc-calendar-action-btn"
                )
            ).find((button) => button.title === t("More options"));
            expect(trigger).toBeTruthy();
            act(() => trigger?.click());

            const menuItem = Array.from(
                document.querySelectorAll<HTMLButtonElement>(
                    '.nc-cal-menu [role="menuitem"]'
                )
            ).find((button) => button.textContent?.includes(t("ICS links")));
            expect(menuItem).toBeTruthy();
            act(() => menuItem?.click());

            expect(onManageIcsFeeds).toHaveBeenCalledWith("cal-1");
        } finally {
            act(() => {
                ReactDOM.unmountComponentAtNode(host);
            });
            host.remove();
            document
                .querySelectorAll(".nc-cal-menu, .nc-cal-menu-overlay")
                .forEach((node) => node.remove());
            applyLanguage("fr");
        }
    });

    /*
     * A surface with no ICS preferences store (the Obsidian plugin) omits
     * `onManageIcsFeeds` entirely. The menu must leave the item out rather
     * than show a click that silently does nothing — worse than no item at
     * all, since it looks broken instead of simply absent.
     */
    it("leaves the ICS links item out of the menu when the surface has no callback for it", () => {
        const props: React.ComponentProps<typeof CalendarSidebar> = {
            sidebarVisible: true,
            currentDate: new Date(2026, 8, 3),
            viewType: "week",
            onViewTypeChange: () => {},
            dayCount: 7,
            onSetDayCount: () => {},
            calendarSources: [
                {
                    id: "cal-1",
                    name: "Cours",
                    color: "#4477aa",
                    editable: true,
                    type: "local",
                },
            ],
            firstDay: 1,
            onDateSelect: () => {},
            hiddenCalendars: new Set(),
            onToggleCalendar: () => {},
            defaultCalendarId: "",
            soloCalendarId: null,
            onSetDefaultCalendar: () => {},
            onShowOnly: () => {},
            tasks: [],
            today: "2026-09-03",
            onEventClick: () => {},
            onAddTask: () => {},
            onToggleTask: async () => true,
            onAddCalendar: () => {},
            onRenameCalendar: async () => {},
            onEditCalendarLink: () => {},
            // onManageIcsFeeds intentionally omitted.
            onDeleteCalendar: () => {},
            onColorChange: () => {},
            onReorderCalendars: () => {},
            onOpenCalendarFolder: () => {},
            onOpenRootFolder: () => {},
            onCalendarClick: () => {},
            selectedCalendarId: null,
            onToggleSidebar: () => {},
            onOpenSearch: () => {},
            onOpenSettings: () => {},
        };

        applyLanguage("fr");
        const host = document.createElement("div");
        document.body.appendChild(host);
        try {
            act(() => {
                ReactDOM.render(
                    React.createElement(CalendarSidebar, props),
                    host
                );
            });

            const trigger = Array.from(
                host.querySelectorAll<HTMLButtonElement>(
                    ".nc-calendar-action-btn"
                )
            ).find((button) => button.title === t("More options"));
            expect(trigger).toBeTruthy();
            act(() => trigger?.click());

            const menuItem = Array.from(
                document.querySelectorAll<HTMLButtonElement>(
                    '.nc-cal-menu [role="menuitem"]'
                )
            ).find((button) => button.textContent?.includes(t("ICS links")));
            expect(menuItem).toBeUndefined();
        } finally {
            act(() => {
                ReactDOM.unmountComponentAtNode(host);
            });
            host.remove();
            document
                .querySelectorAll(".nc-cal-menu, .nc-cal-menu-overlay")
                .forEach((node) => node.remove());
            applyLanguage("fr");
        }
    });
});

describe("tasks platform branches", () => {
    const props: React.ComponentProps<typeof CalendarSidebar> = {
        sidebarVisible: true,
        currentDate: new Date(2026, 8, 3),
        viewType: "week",
        onViewTypeChange: () => {},
        dayCount: 7,
        onSetDayCount: () => {},
        calendarSources: [],
        firstDay: 1,
        onDateSelect: () => {},
        hiddenCalendars: new Set(),
        onToggleCalendar: () => {},
        defaultCalendarId: "",
        soloCalendarId: null,
        onSetDefaultCalendar: () => {},
        onShowOnly: () => {},
        tasks: [],
        today: "2026-09-03",
        onEventClick: () => {},
        onAddTask: () => {},
        onToggleTask: async () => true,
        onAddCalendar: () => {},
        onRenameCalendar: async () => {},
        onEditCalendarLink: () => {},
        onManageIcsFeeds: () => {},
        onDeleteCalendar: () => {},
        onColorChange: () => {},
        onReorderCalendars: () => {},
        onOpenCalendarFolder: () => {},
        onOpenRootFolder: () => {},
        onCalendarClick: () => {},
        selectedCalendarId: null,
        onToggleSidebar: () => {},
        onOpenSearch: () => {},
        onOpenSettings: () => {},
    };

    let host: HTMLDivElement;

    beforeEach(() => {
        applyLanguage("fr");
        document.body.classList.remove("nc-platform-android");
        host = document.createElement("div");
        document.body.appendChild(host);
    });

    afterEach(() => {
        act(() => {
            ReactDOM.unmountComponentAtNode(host);
        });
        host.remove();
        document.body.classList.remove("nc-platform-android");
        applyLanguage("fr");
    });

    it("uses desktop status modals while Android keeps the inline add-task panel", () => {
        act(() => {
            ReactDOM.render(React.createElement(CalendarSidebar, props), host);
        });
        expect(host.querySelector(".nc-desktop-tasks-summary")).toBeTruthy();
        expect(host.textContent).not.toContain(t("Add task"));

        document.body.classList.add("nc-platform-android");
        act(() => {
            ReactDOM.render(React.createElement(CalendarSidebar, props), host);
        });
        expect(host.querySelector(".nc-desktop-tasks-summary")).toBeNull();
        expect(host.querySelector(".nc-tasks-panel")).toBeTruthy();
        expect(host.textContent).toContain(t("Add task"));
    });
});
