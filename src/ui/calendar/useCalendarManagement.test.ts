/** @jest-environment jsdom */
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";

// The real "obsidian" mock only implements what the model layer reaches for
// (TFile/TFolder/Notice/parseYaml). This hook also touches modal/setting/
// filesystem-adapter chrome that only actually runs from user-triggered
// flows this suite never exercises (add-calendar modal, edit-link modal,
// open-in-explorer) — stand in with minimal classes so the module can load.
jest.mock("obsidian", () => {
    const actual = jest.requireActual("../../../__mocks__/obsidian");
    class Modal {
        app: unknown;
        contentEl = { createEl: () => ({}), empty: () => {} };
        constructor(app: unknown) {
            this.app = app;
        }
        open() {}
        close() {}
    }
    class Setting {
        constructor(_el: unknown) {}
        setName() {
            return this;
        }
        addText(cb: (text: unknown) => void) {
            cb({
                setValue: () => ({ setPlaceholder: () => ({ onChange: () => {} }) }),
                inputEl: { style: {}, addEventListener: () => {} },
            });
            return this;
        }
        addButton(cb: (btn: unknown) => void) {
            cb({
                setButtonText: () => ({ setCta: () => ({ onClick: () => {} }) }),
            });
            return this;
        }
    }
    class FileSystemAdapter {}
    class App {}
    return { ...actual, Modal, Setting, FileSystemAdapter, App };
});

import { useCalendarManagement } from "./useCalendarManagement";

/**
 * Retiring the desktop "Online subscription" calendar type does not touch
 * this hook: it manages the Obsidian-side `settings.calendarSources`, where a
 * migrated-but-unresolved legacy `ical` source can still be renamed or
 * removed. Deleting any calendar here must only ever edit settings — never
 * touch vault files, which is how a removed ICS link's already-created notes
 * survive its removal.
 */
describe("useCalendarManagement", () => {
    let host: HTMLDivElement;
    let hookResult: ReturnType<typeof useCalendarManagement> | null;

    function Harness({
        settings,
        plugin,
    }: {
        settings: any;
        plugin: any;
    }) {
        hookResult = useCalendarManagement({
            settings,
            plugin,
            cache: { getCalendarById: () => null },
            setHiddenCalendars: () => {},
            invalidateCache: () => {},
        });
        return null;
    }

    beforeEach(() => {
        host = document.createElement("div");
        document.body.appendChild(host);
        hookResult = null;
    });

    afterEach(() => {
        act(() => {
            ReactDOM.unmountComponentAtNode(host);
        });
        host.remove();
    });

    it("removing a legacy ical calendar only edits settings, never the vault", async () => {
        const settings = {
            calendarRootFolder: "",
            calendarSources: [
                {
                    type: "ical",
                    id: "school",
                    name: "School",
                    url: "https://example.test/calendar.ics",
                    color: "#89b4fa",
                },
            ],
            hiddenCalendars: [],
        };
        const saveSettings = jest.fn().mockResolvedValue(undefined);
        const activateView = jest.fn().mockResolvedValue(undefined);
        const plugin = {
            app: { vault: { adapter: {}, getAllLoadedFiles: () => [] } },
            saveSettings,
            activateView,
        };

        act(() => {
            ReactDOM.render(
                React.createElement(Harness, { settings, plugin }),
                host
            );
        });

        await act(async () => {
            await hookResult!.handleDeleteCalendar("ical::https://example.test/calendar.ics");
        });

        expect(settings.calendarSources).toEqual([]);
        expect(saveSettings).toHaveBeenCalledTimes(1);
        expect(activateView).toHaveBeenCalledTimes(1);
    });

    it("renaming a legacy ical calendar only sets its display name", async () => {
        const settings = {
            calendarRootFolder: "",
            calendarSources: [
                {
                    type: "ical",
                    id: "school",
                    name: "School",
                    url: "https://example.test/calendar.ics",
                    color: "#89b4fa",
                },
            ],
            hiddenCalendars: [],
        };
        const saveSettings = jest.fn().mockResolvedValue(undefined);
        const activateView = jest.fn().mockResolvedValue(undefined);
        const plugin = {
            app: { vault: { adapter: {}, getAllLoadedFiles: () => [] } },
            saveSettings,
            activateView,
        };

        act(() => {
            ReactDOM.render(
                React.createElement(Harness, { settings, plugin }),
                host
            );
        });

        await act(async () => {
            await hookResult!.handleRenameCalendar(
                "ical::https://example.test/calendar.ics",
                "Renamed feed"
            );
        });

        expect(settings.calendarSources[0].name).toBe("Renamed feed");
        expect(settings.calendarSources[0].url).toBe(
            "https://example.test/calendar.ics"
        );
    });
});
