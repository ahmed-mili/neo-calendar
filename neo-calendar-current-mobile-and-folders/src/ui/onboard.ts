import { App } from "obsidian";
import NeoCalendarPlugin from "../main";
import { addCalendarButton } from "./settings";
import { CalendarInfo } from "../types";

/**
 * What the calendar view shows before any event source exists: an explanation
 * and the same "add calendar" flow as the settings tab, so the user can get
 * going without leaving the view.
 */
export function renderOnboarding(
    app: App,
    plugin: NeoCalendarPlugin,
    el: HTMLElement
) {
    el.style.height = "100%";

    const centered = el.createDiv();
    centered.style.height = "100%";
    centered.style.display = "flex";
    centered.style.alignItems = "center";
    centered.style.justifyContent = "center";

    const notice = centered.createDiv();
    notice.createEl("h1").textContent = "No calendar available";
    notice.createEl("p").textContent =
        "Thanks for downloading Neo Calendar! Create a calendar below to begin.";

    const buttonContainer = notice.createDiv();
    buttonContainer.style.position = "fixed";

    const rootFolder = plugin.settings.calendarRootFolder;
    addCalendarButton(
        app,
        plugin,
        buttonContainer,
        async (source: CalendarInfo) => {
            plugin.settings.calendarSources.push(source);
            await plugin.saveSettings();
            await plugin.activateView();
        },
        undefined,
        rootFolder || undefined,
        // Without a root folder configured, let the user pick one here.
        !rootFolder
    );
}
