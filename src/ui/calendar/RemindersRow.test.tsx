/** @jest-environment jsdom */

import * as React from "react";
import * as ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { RemindersRow } from "./EventPanelRows";
import { setReminderDisplayAllDay } from "./reminderChoices";
import { applyLanguage } from "../i18n";

describe("RemindersRow", () => {
    let host: HTMLDivElement;

    beforeEach(() => {
        host = document.createElement("div");
        document.body.appendChild(host);
        setReminderDisplayAllDay(false);
        applyLanguage("fr");
    });

    afterEach(() => {
        act(() => ReactDOM.unmountComponentAtNode(host));
        document.body.innerHTML = "";
        setReminderDisplayAllDay(false);
        applyLanguage("fr");
    });

    function render(reminders: number[] | undefined, editable = true) {
        act(() => {
            ReactDOM.render(
                <RemindersRow
                    reminders={reminders}
                    editable={editable}
                    setReminders={jest.fn()}
                    onAutoSave={jest.fn()}
                />,
                host
            );
        });
    }

    it("shows the placeholder while empty", () => {
        render(undefined);
        expect(host.textContent).toContain("Rappels");
    });

    it("keeps timed reminders as relative minutes and hours", () => {
        render([10, 60]);
        expect(host.textContent).toContain("10 min");
        expect(host.textContent).toContain("1 heure");
        expect(host.textContent).toContain("avant");
    });

    it("shows all-day reminders as a clock time plus relative day", () => {
        applyLanguage("en");
        setReminderDisplayAllDay(true);
        render([-540, 900]);

        expect(host.textContent).toContain("09:00");
        expect(host.textContent).toContain("Same day");
        expect(host.textContent).toContain("1 day before");
        expect(host.textContent).not.toContain("min before");
    });

    it("gives each reminder a remove button when editable", () => {
        render([10]);
        expect(
            host.querySelector('button[aria-label*="Retirer le rappel"]')
        ).not.toBeNull();
    });

    it("does not show remove controls when read-only", () => {
        render([10], false);
        expect(host.querySelector(".nc-panel-reminder-remove")).toBeNull();
    });

    it("speaks English when the app does", () => {
        applyLanguage("en");
        render([60]);
        expect(host.textContent).toContain("1 hour");
        expect(host.textContent).toContain("before");
    });
});
