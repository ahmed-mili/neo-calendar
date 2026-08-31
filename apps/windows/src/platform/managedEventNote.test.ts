import {
    isManagedBy,
    managedMetadataFromMarkdown,
    serializeManagedEventMarkdown,
    type ManagedEventMetadata,
} from "./managedEventNote";
import { parseFrontmatter, parseStoredEvent } from "./desktopEventFormat";
import { NeoEvent } from "../../../../src/types";

const event: NeoEvent = {
    title: "Cours de maths",
    allDay: false,
    startTime: "10:00",
    endTime: "11:00",
    type: "single",
    date: "2026-09-01",
    endDate: null,
} as unknown as NeoEvent;

const icsMetadata: ManagedEventMetadata = {
    neoManagedBy: "neo-calendar:ics",
    neoManagedVersion: 1,
    neoIcsFeedId: "school",
    neoIcsUid: "uid-1",
    neoIcsRecurrenceId: "2026-09-01T08:00:00Z",
    neoIcsStatus: "confirmed",
};

describe("serializeManagedEventMarkdown", () => {
    it("writes the managed markers alongside the event frontmatter", () => {
        const contents = serializeManagedEventMarkdown(event, icsMetadata);

        expect(parseFrontmatter(contents)?.title).toBe("Cours de maths");
        expect(parseFrontmatter(contents)?.neoManagedBy).toBe(
            "neo-calendar:ics"
        );
        expect(parseFrontmatter(contents)?.neoManagedVersion).toBe(1);
        expect(parseFrontmatter(contents)?.neoIcsRecurrenceId).toBe(
            "2026-09-01T08:00:00Z"
        );
        expect(managedMetadataFromMarkdown(contents)?.neoManagedBy).toBe(
            "neo-calendar:ics"
        );
        if (
            managedMetadataFromMarkdown(contents)?.neoManagedBy ===
            "neo-calendar:ics"
        ) {
            expect(
                (
                    managedMetadataFromMarkdown(contents) as Extract<
                        ManagedEventMetadata,
                        { neoManagedBy: "neo-calendar:ics" }
                    >
                ).neoIcsUid
            ).toBe("uid-1");
        }
    });

    it("stores a null RECURRENCE-ID as an explicit null marker", () => {
        const contents = serializeManagedEventMarkdown(event, {
            ...icsMetadata,
            neoIcsRecurrenceId: null,
        });

        expect(parseFrontmatter(contents)?.neoIcsRecurrenceId).toBeNull();
        const meta = managedMetadataFromMarkdown(contents);
        expect(
            meta?.neoManagedBy === "neo-calendar:ics" && meta.neoIcsRecurrenceId
        ).toBeNull();
    });

    it("replaces stale managed markers rather than appending a second set", () => {
        const first = serializeManagedEventMarkdown(event, icsMetadata);
        const second = serializeManagedEventMarkdown(
            event,
            { ...icsMetadata, neoIcsFeedId: "college" },
            first
        );

        expect(second.match(/neoManagedBy:/g)).toHaveLength(1);
        const meta = managedMetadataFromMarkdown(second);
        expect(
            meta?.neoManagedBy === "neo-calendar:ics" && meta.neoIcsFeedId
        ).toBe("college");
    });

    it("keeps unrelated frontmatter keys untouched", () => {
        const withBanner = serializeManagedEventMarkdown(
            event,
            icsMetadata
        ).replace("---\n", "---\nbanner: cover.png\n");
        const next = serializeManagedEventMarkdown(
            event,
            icsMetadata,
            withBanner
        );

        expect(next).toContain("banner: cover.png");
    });
});

describe("managedMetadataFromMarkdown", () => {
    it("returns null when the marker set is incomplete", () => {
        const contents = serializeManagedEventMarkdown(event, icsMetadata)
            .split("\n")
            .filter((line) => !line.startsWith("neoIcsUid:"))
            .join("\n");

        expect(managedMetadataFromMarkdown(contents)).toBeNull();
    });

    it("returns null for a note that carries no managed markers", () => {
        const contents = [
            "---",
            "title: Personnelle",
            "date: 2026-09-01",
            "---",
            "",
        ].join("\n");

        expect(managedMetadataFromMarkdown(contents)).toBeNull();
    });

    it("returns null when the status is not confirmed", () => {
        const contents = serializeManagedEventMarkdown(
            event,
            icsMetadata
        ).replace('neoIcsStatus: "confirmed"', 'neoIcsStatus: "tentative"');

        expect(managedMetadataFromMarkdown(contents)).toBeNull();
    });
});

describe("isManagedBy", () => {
    it("recognizes a note owned by the given feed", () => {
        const contents = serializeManagedEventMarkdown(event, icsMetadata);

        expect(isManagedBy(contents, "school")).toBe(true);
        expect(isManagedBy(contents, "college")).toBe(false);
    });

    it("rejects a personal note", () => {
        expect(
            isManagedBy("---\ntitle: x\ndate: 2026-09-01\n---\n", "school")
        ).toBe(false);
    });
});

describe("parseStoredEvent with managed metadata", () => {
    it("marks the stored event read-only while keeping the calendar id", () => {
        const contents = serializeManagedEventMarkdown(event, icsMetadata);
        const stored = parseStoredEvent(
            {
                relativePath: "Études/2026-09-01 Cours de maths.md",
                calendarPath: "Études",
                fileName: "2026-09-01 Cours de maths.md",
                contents,
            },
            new Set(["local::Études"])
        );

        expect(stored?.readOnly).toBe(true);
        expect(stored?.calendarId).toBe("local::Études");
    });

    it("leaves a personal note writable", () => {
        const contents = serializeEventMarkdownForTest();
        const stored = parseStoredEvent(
            {
                relativePath: "Études/perso.md",
                calendarPath: "Études",
                fileName: "perso.md",
                contents,
            },
            new Set(["local::Études"])
        );

        expect(stored?.readOnly).toBeUndefined();
    });
});

function serializeEventMarkdownForTest(): string {
    return [
        "---",
        'title: "Perso"',
        "allDay: false",
        'startTime: "10:00"',
        'endTime: "11:00"',
        "type: single",
        "date: 2026-09-01",
        "endDate: null",
        "---",
        "",
    ].join("\n");
}
