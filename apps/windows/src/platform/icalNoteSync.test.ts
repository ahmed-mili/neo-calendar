import { parseEvent } from "../../../../src/types";
import { parseFrontmatter, type DesktopStoredEvent } from "./desktopEventFormat";
import type { DesktopIcalCalendarSource } from "./desktopExternalCalendars";
import {
    availableIcalDirectoryName,
    planIcalNoteSync,
    scopedIcalEvent,
} from "./icalNoteSync";

const source: DesktopIcalCalendarSource & { directory: string } = {
    type: "ical",
    id: "school",
    name: "School",
    url: "https://example.test/calendar.ics",
    color: "#89b4fa",
    directory: "School",
};

const event = (date: string, id: string, title = "Course") =>
    parseEvent({
        id,
        title,
        type: "single",
        date,
        endDate: null,
        allDay: true,
    });

function stored(remote = event("2026-08-14", "ics::old::2026-08-14::single")):
    DesktopStoredEvent {
    const materialized = scopedIcalEvent(source, remote, 0);
    return {
        id: materialized.id as string,
        calendarId: "local::School",
        calendarPath: "School",
        relativePath: "School/2026-08-14 Course.md",
        fileName: "2026-08-14 Course.md",
        contents: [
            "---",
            `id: ${JSON.stringify(materialized.id)}`,
            'title: "Course"',
            'type: "single"',
            'date: "2026-08-14"',
            "endDate: null",
            "allDay: true",
            "---",
            "A note body the user may enrich.",
        ].join("\n"),
        event: materialized,
        readOnly: true,
    };
}

describe("note-backed iCalendar subscriptions", () => {
    it("does not delete an older note when the rolling feed stops returning it", () => {
        const old = stored();
        const current = event("2026-08-28", "ics::new::2026-08-28::single");

        const writes = planIcalNoteSync(source, [current], [old]);

        expect(writes).toHaveLength(1);
        expect(writes[0].event.title).toBe("Course");
        expect(writes.some((write) => write.event.id === old.id)).toBe(false);
        // No deletion list exists by design: absence from a rolling feed cannot
        // erase the historical Markdown note already on disk.
        expect(old.relativePath).toBe("School/2026-08-14 Course.md");
    });

    it("updates a still-present VEVENT in the same Markdown file and preserves its body", () => {
        const old = stored();
        const changed = event(
            "2026-08-14",
            "ics::old::2026-08-14::single",
            "Course moved"
        );

        const [write] = planIcalNoteSync(source, [changed], [old]);

        expect(write.previousRelativePath).toBe(old.relativePath);
        expect(write.fileName).toBe(old.fileName);
        expect(parseFrontmatter(write.contents)?.title).toBe("Course moved");
        expect(write.contents).toContain("A note body the user may enrich.");
    });

    it("does not rewrite an unchanged materialized event", () => {
        const old = stored();
        const exact = old.event;
        expect(planIcalNoteSync(source, [exact], [old])).toEqual([]);
    });

    it("namespaces identical UIDs from two feeds", () => {
        const same = event("2026-08-28", "ics::same::2026-08-28::single");
        const other = { ...source, url: "https://other.test/calendar.ics" };

        expect(scopedIcalEvent(source, same, 0).id).not.toBe(
            scopedIcalEvent(other, same, 0).id
        );
    });

    it("chooses a new ICS folder instead of hijacking an existing calendar", () => {
        const used = new Set(["school", "school (ics)"]);
        expect(availableIcalDirectoryName("School", used)).toBe(
            "School (ICS 2)"
        );
    });
});
