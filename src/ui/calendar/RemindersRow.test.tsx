import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RemindersRow } from "./EventPanelRows";
import { applyLanguage } from "../i18n";

const render = (reminders: number[] | undefined, editable = true): string =>
    renderToStaticMarkup(
        <RemindersRow
            reminders={reminders}
            editable={editable}
            setReminders={() => {}}
            onAutoSave={() => {}}
        />
    );

describe("the reminders of an event", () => {
    afterEach(() => applyLanguage("fr"));

    it("reads as an empty field named after what it holds", () => {
        const html = render(undefined);

        expect(html).toContain("nc-panel-reminders");
        expect(html).toContain("Rappels");
    });

    it("shows each reminder set on the event", () => {
        const html = render([10, 60]);

        expect(html).toContain("10 min");
        expect(html).toContain("1 heure");
        expect(html).toContain("avant");
    });

    // The × is how a reminder is taken back off, so every chip carries one and
    // says which reminder it would remove.
    it("offers to remove each of them by name", () => {
        const html = render([10]);

        expect(html).toContain('aria-label="Retirer le rappel 10 min avant"');
    });

    it("offers nothing to remove on an event that cannot be edited", () => {
        expect(render([10], false)).not.toContain("Retirer le rappel");
    });

    it("speaks the language the app is set to", () => {
        applyLanguage("en");

        expect(render(undefined)).toContain("Reminders");
        expect(render([60])).toContain("1 hour");
    });
});
