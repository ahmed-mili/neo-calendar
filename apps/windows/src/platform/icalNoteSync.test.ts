import { parseEvent } from "../../../../src/types";
import { parseFrontmatter, type DesktopStoredEvent } from "./desktopEventFormat";
import {
    parseExternalCalendarSources,
    type DesktopIcalCalendarSource,
} from "./desktopExternalCalendars";
import {
    availableIcalDirectoryName,
    displayCalendarIdForExternalSource,
    planIcalDirectoryAssignments,
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
        expect(planIcalNoteSync(source, [old.event], [old])).toEqual([]);
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

    it("migrates a legacy feed to a dedicated folder and local display id", () => {
        const legacy: DesktopIcalCalendarSource = {
            type: "ical",
            id: "legacy",
            name: "Lectures",
            url: "https://example.test/lectures.ics",
            color: "#89b4fa",
        };
        const plan = planIcalDirectoryAssignments([legacy], ["Personal"]);
        const migrated = plan.sources[0] as DesktopIcalCalendarSource;

        expect(plan.changed).toBe(true);
        expect(plan.directoriesToCreate).toEqual(["Lectures"]);
        expect(migrated.directory).toBe("Lectures");
        expect(displayCalendarIdForExternalSource(migrated)).toBe(
            "local::Lectures"
        );
    });

    it("never lets two feeds claim the same note folder", () => {
        const first = { ...source };
        const second = {
            ...source,
            id: "other",
            url: "https://other.test/calendar.ics",
        };
        const plan = planIcalDirectoryAssignments([first, second], ["School"]);
        const [one, two] = plan.sources as DesktopIcalCalendarSource[];

        expect(one.directory).toBe("School");
        expect(two.directory).toBe("School (ICS)");
        expect(plan.directoriesToCreate).toEqual(["School (ICS)"]);
    });

    it("recreates a configured folder that is temporarily absent", () => {
        const plan = planIcalDirectoryAssignments([source], ["Personal"]);
        expect(plan.changed).toBe(false);
        expect(plan.directoriesToCreate).toEqual(["School"]);
    });

    it("persists safe directory assignments but drops unsafe paths", () => {
        const parsed = parseExternalCalendarSources([
            { ...source, directory: "School" },
            {
                ...source,
                id: "unsafe",
                url: "https://unsafe.test/calendar.ics",
                directory: "../School",
            },
        ]) as DesktopIcalCalendarSource[];

        expect(parsed[0].directory).toBe("School");
        expect(parsed[1].directory).toBeUndefined();
    });
});
