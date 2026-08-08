import * as fs from "fs";
import * as path from "path";
import {
    hasDraftCreationIntent,
    shouldAutoCommitDraft,
} from "./EventPanel.helpers";

const panel = fs.readFileSync(path.join(__dirname, "EventPanel.tsx"), "utf8");
const form = fs.readFileSync(
    path.join(__dirname, "useEventFormState.ts"),
    "utf8"
);
const rows = fs.readFileSync(
    path.join(__dirname, "EventPanelRows.tsx"),
    "utf8"
);

describe("unnamed events", () => {
    it("does not suppress saves or delete an event when its title is empty", () => {
        expect(panel).not.toContain("if (!form.title) return");
        expect(panel).not.toContain("onRevertToDraft");
        expect(panel).toContain("onDraftCommit(form.title.trim(), payload");
    });

    it("keeps a dateless event unscheduled until a date is selected", () => {
        expect(form).toContain('type: "someday"');
        expect(form).toContain('type: "single"');
        expect(rows).toContain('label || date || "Add date"');
    });

    it("does not persist an unnamed grid draft from a simple click", () => {
        expect(hasDraftCreationIntent("   ")).toBe(false);
        expect(
            shouldAutoCommitDraft({
                isDraft: true,
                hasDraft: true,
                date: "2026-07-20",
                title: "",
                alreadyCommitting: false,
            })
        ).toBe(false);
    });

    it("still auto-commits a grid draft after the user enters a title", () => {
        expect(
            shouldAutoCommitDraft({
                isDraft: true,
                hasDraft: true,
                date: "2026-07-20",
                title: "Réunion",
                alreadyCommitting: false,
            })
        ).toBe(true);
    });
});
