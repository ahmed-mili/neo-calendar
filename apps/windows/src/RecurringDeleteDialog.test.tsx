import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import RecurringDeleteDialog from "./RecurringDeleteDialog";
import { applyLanguage } from "../../../src/ui/i18n";

const props = {
    onClose: () => {},
    onDeleteOccurrence: () => {},
    onDeleteFollowing: () => {},
};

describe("deleting one occurrence of a series", () => {
    afterEach(() => applyLanguage("fr"));

    it("renders nothing while it is not asked for", () => {
        expect(
            renderToStaticMarkup(
                <RecurringDeleteDialog open={false} isTask {...props} />
            )
        ).toBe("");
    });

    // Exactly two ways out of a recurring deletion, plus leaving it alone.
    it("offers the two choices, worded for a task", () => {
        const html = renderToStaticMarkup(
            <RecurringDeleteDialog open isTask {...props} />
        );

        expect(html).toContain("Supprimer cette tâche uniquement");
        expect(html).toContain("Supprimer cette tâche et toutes les suivantes");
        expect(html).toContain("Annuler");
    });

    it("words them for an event when the series is not a task", () => {
        const html = renderToStaticMarkup(
            <RecurringDeleteDialog open isTask={false} {...props} />
        );

        expect(html).toContain("Supprimer cet événement uniquement");
        expect(html).toContain(
            "Supprimer cet événement et toutes les suivantes"
        );
        expect(html).not.toContain("tâche");
    });

    it("speaks the language the app is set to", () => {
        applyLanguage("en");

        const html = renderToStaticMarkup(
            <RecurringDeleteDialog open isTask {...props} />
        );

        expect(html).toContain("Delete this task only");
        expect(html).toContain("Delete this task and all following");
    });
});
