import { modifyFrontmatterString } from "../calendars/FullNoteCalendar";
import {
    parseFrontmatter,
    serializeEventMarkdown,
} from "../../apps/windows/src/platform/desktopEventFormat";
import { NeoEvent, parseEvent } from "./schema";

const withDescription = (): NeoEvent =>
    parseEvent({
        title: "Write release notes",
        allDay: true,
        type: "single",
        date: "2026-08-28",
        description: "Old description",
    });

const withoutDescription = (): NeoEvent => {
    const { description: _description, ...event } = withDescription();
    return event as NeoEvent;
};

describe("clearing an event description", () => {
    it("removes the old frontmatter value in the shared note calendar", () => {
        const before = [
            "---",
            "title: Write release notes",
            "allDay: true",
            "type: single",
            "date: 2026-08-28",
            "endDate: null",
            "description: Old description",
            "---",
            "",
            "Body stays here.",
        ].join("\n");

        const after = modifyFrontmatterString(before, withoutDescription());

        expect(after).not.toContain("description:");
        expect(after).toContain("Body stays here.");
    });

    it("removes the old frontmatter value in the desktop and Android format", () => {
        const before = serializeEventMarkdown(withDescription());
        const after = serializeEventMarkdown(withoutDescription(), before);

        expect(after).not.toContain("description:");
        expect(parseFrontmatter(after)?.description).toBeUndefined();
    });
});
