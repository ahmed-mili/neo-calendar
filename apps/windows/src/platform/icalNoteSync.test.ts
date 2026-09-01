import type { IcsOccurrence, IcsSnapshot } from "../../../../src/calendars/parsing/ics";
import type { NeoEvent } from "../../../../src/types";
import { parseEvent } from "../../../../src/types/schema";
import {
    calendarIdFromPath,
    parseFrontmatter,
    type DesktopStoredEvent,
} from "./desktopEventFormat";
import {
    externalCalendarId,
    parseExternalCalendarSources,
    type DesktopIcalCalendarSource,
} from "./desktopExternalCalendars";
import type { IcsFeedSubscription } from "./icsFeedPreferences";
import {
    availableIcalDirectoryName,
    planIcalDirectoryAssignments,
    planIcalNoteSync,
    planIcsNoteSync,
    scopedIcalEvent,
    startOfLocalWeekIso,
    type IcsSyncState,
} from "./icalNoteSync";
import { serializeManagedEventMarkdown } from "./managedEventNote";

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

function stored(
    remote = event("2026-08-14", "ics::old::2026-08-14::single")
): DesktopStoredEvent {
    const materialized = scopedIcalEvent(source, remote, 0);
    return {
        id: materialized.id as string,
        calendarId: externalCalendarId(source),
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

    it("keeps the subscription logical id while writing into its note folder", () => {
        const [write] = planIcalNoteSync(
            source,
            [event("2026-08-28", "ics::new::2026-08-28::single")],
            []
        );
        expect(write.calendarId).toBe(externalCalendarId(source));
        expect(write.calendarPath).toBe("School");
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

    it("keeps an event identity stable when a feed URL changes", () => {
        // Break caught: URL-based event identities duplicate every imported
        // event after a feed endpoint changes.
        const same = event("2026-08-28", "ics::same::2026-08-28::single");
        const other = { ...source, url: "https://other.test/calendar.ics" };

        expect(scopedIcalEvent(source, same, 0).id).toBe(
            scopedIcalEvent(other, same, 0).id
        );
    });

    it("chooses a new ICS folder instead of hijacking an existing calendar", () => {
        const used = new Set(["school", "school (ics)"]);
        expect(availableIcalDirectoryName("School", used)).toBe(
            "School (ICS 2)"
        );
    });

    it("migrates a legacy feed to a dedicated folder", () => {
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

describe("startOfLocalWeekIso", () => {
    it("returns the Monday of the local week", () => {
        // 2026-08-31 is a Monday; a Wednesday of the same week maps back to it.
        expect(startOfLocalWeekIso(new Date(2026, 7, 31, 12))).toBe(
            "2026-08-31"
        );
        expect(startOfLocalWeekIso(new Date(2026, 8, 2, 9))).toBe("2026-08-31");
        expect(startOfLocalWeekIso(new Date(2026, 8, 6, 23))).toBe(
            "2026-08-31"
        );
    });

    it("fails closed on an invalid Date instead of returning a permissive boundary", () => {
        // An empty-string boundary would compare as smaller than every real
        // date, silently disabling the archive protection instead of
        // refusing to plan.
        expect(() => startOfLocalWeekIso(new Date(NaN))).toThrow();
    });
});

describe("planIcsNoteSync — conservation and prudent deletion", () => {
    const feed: IcsFeedSubscription = {
        id: "feed-1",
        calendarPath: "School",
        name: "School",
        url: "https://example.test/school.ics",
        active: true,
    };
    // A Wednesday: the current-week Monday boundary is 2026-08-31.
    const now = new Date(2026, 8, 2, 9, 0, 0);

    const singleEvent = (date: string, title: string): NeoEvent =>
        parseEvent({
            title,
            type: "single",
            date,
            endDate: null,
            allDay: true,
        }) as NeoEvent;

    const occurrence = (
        uid: string,
        date: string,
        title = "Cours",
        recurrenceId: string | null = null
    ): IcsOccurrence => ({
        key: recurrenceId === null ? uid : `${uid}::${recurrenceId}`,
        uid,
        recurrenceId,
        event: singleEvent(date, title) as IcsOccurrence["event"],
    });

    const snapshot = (over: Partial<IcsSnapshot> = {}): IcsSnapshot => {
        const events = over.events ?? [];
        return {
            events,
            cancelledKeys: over.cancelledKeys ?? new Set<string>(),
            latestOccurrenceDate:
                over.latestOccurrenceDate ??
                (events.length
                    ? events
                          .map((occ) => occ.event.date)
                          .reduce((a, b) => (b > a ? b : a))
                    : null),
        };
    };

    const state = (over: Partial<IcsSyncState> = {}): IcsSyncState => ({
        knownEventCount: 1,
        missingCounts: {},
        ...over,
    });

    const managedRecord = (
        uid: string,
        date: string,
        title = "Cours",
        feedId = feed.id,
        recurrenceId: string | null = null
    ): DesktopStoredEvent => {
        const key = recurrenceId === null ? uid : `${uid}::${recurrenceId}`;
        const event = {
            ...singleEvent(date, title),
            id: `neo-calendar:ics::${feedId}::${key}`,
        } as NeoEvent;
        const contents = serializeManagedEventMarkdown(event, {
            neoManagedBy: "neo-calendar:ics",
            neoManagedVersion: 1,
            neoIcsFeedId: feedId,
            neoIcsUid: uid,
            neoIcsRecurrenceId: recurrenceId,
            neoIcsStatus: "confirmed",
        });
        return {
            id: `note::${feedId}::${key}`,
            calendarId: calendarIdFromPath("School"),
            calendarPath: "School",
            relativePath: `School/${date} ${title}.md`,
            fileName: `${date} ${title}.md`,
            contents,
            event,
            readOnly: true,
        };
    };

    it("never deletes a note that starts before the current Monday, even cancelled", () => {
        const archived = managedRecord("past", "2026-08-24");
        const plan = planIcsNoteSync({
            feed,
            snapshot: snapshot({
                events: [occurrence("live", "2026-09-09")],
                cancelledKeys: new Set(["past"]),
            }),
            existingRecords: [archived],
            previousState: state({ knownEventCount: 2 }),
            now,
        });

        expect(plan.deletes).toEqual([]);
        expect(plan.nextState.missingCounts.past).toBeUndefined();
    });

    it("keeps a current-week occurrence after a single miss and counts it", () => {
        const record = managedRecord("mon", "2026-09-02");
        const plan = planIcsNoteSync({
            feed,
            snapshot: snapshot({ events: [occurrence("other", "2026-09-09")] }),
            existingRecords: [record],
            previousState: state(),
            now,
        });

        expect(plan.deletes).toEqual([]);
        expect(plan.nextState.missingCounts.mon).toBe(1);
    });

    it("deletes on the second consecutive miss inside proven coverage", () => {
        const record = managedRecord("mon", "2026-09-02");
        const plan = planIcsNoteSync({
            feed,
            snapshot: snapshot({
                events: [occurrence("other", "2026-09-09")],
                latestOccurrenceDate: "2026-09-09",
            }),
            existingRecords: [record],
            previousState: state({ missingCounts: { mon: 1 } }),
            now,
        });

        expect(plan.deletes).toEqual([record]);
        expect(plan.nextState.missingCounts.mon).toBeUndefined();
    });

    it("keeps a second miss when the feed does not prove coverage past it", () => {
        const record = managedRecord("far", "2026-12-25");
        const plan = planIcsNoteSync({
            feed,
            snapshot: snapshot({
                events: [occurrence("other", "2026-09-09")],
                latestOccurrenceDate: "2026-09-09",
            }),
            existingRecords: [record],
            previousState: state({ missingCounts: { far: 1 } }),
            now,
        });

        expect(plan.deletes).toEqual([]);
        expect(plan.nextState.missingCounts.far).toBe(2);
    });

    it("deletes an explicitly cancelled current-week occurrence at once", () => {
        const record = managedRecord("mon", "2026-09-02");
        const plan = planIcsNoteSync({
            feed,
            snapshot: snapshot({
                events: [occurrence("other", "2026-09-09")],
                cancelledKeys: new Set(["mon"]),
            }),
            existingRecords: [record],
            previousState: state({ knownEventCount: 2 }),
            now,
        });

        expect(plan.deletes).toEqual([record]);
    });

    it("resets the miss counter when an occurrence reappears", () => {
        const record = managedRecord("mon", "2026-09-02");
        const plan = planIcsNoteSync({
            feed,
            snapshot: snapshot({ events: [occurrence("mon", "2026-09-02")] }),
            existingRecords: [record],
            previousState: state({ missingCounts: { mon: 1 } }),
            now,
        });

        expect(plan.deletes).toEqual([]);
        expect(plan.writes).toEqual([]);
        expect(plan.nextState.missingCounts.mon).toBeUndefined();
    });

    it("is a pure function: an HTTP failure simply means it is never called", () => {
        // The sync cycle stops before the planner on a failed download, so the
        // planner itself must not mutate the inputs a retry will reuse.
        const record = managedRecord("mon", "2026-09-02");
        const previousState = Object.freeze(
            state({ missingCounts: Object.freeze({ mon: 1 }) as Record<string, number> })
        );
        const existingRecords = Object.freeze([record]);

        const plan = planIcsNoteSync({
            feed,
            snapshot: snapshot({ events: [occurrence("other", "2026-09-09")] }),
            existingRecords,
            previousState,
            now,
        });

        expect(previousState.missingCounts).toEqual({ mon: 1 });
        expect(plan.nextState).not.toBe(previousState);
    });

    it("refuses to plan (never deletes) when now is an invalid Date", () => {
        const record = managedRecord("mon", "2026-09-02");
        expect(() =>
            planIcsNoteSync({
                feed,
                snapshot: snapshot({
                    events: [occurrence("other", "2026-09-09")],
                }),
                existingRecords: [record],
                previousState: state({ missingCounts: { mon: 2 } }),
                now: new Date(NaN),
            })
        ).toThrow();
    });

    it("throws on an unexpectedly empty snapshot from a populated feed", () => {
        expect(() =>
            planIcsNoteSync({
                feed,
                snapshot: snapshot(),
                existingRecords: [managedRecord("mon", "2026-09-02")],
                previousState: state({ knownEventCount: 3 }),
                now,
            })
        ).toThrow();
    });

    it("accepts an empty snapshot the first time a feed is seen", () => {
        const plan = planIcsNoteSync({
            feed,
            snapshot: snapshot(),
            existingRecords: [],
            previousState: state({ knownEventCount: 0 }),
            now,
        });
        expect(plan).toEqual({
            writes: [],
            deletes: [],
            nextState: expect.objectContaining({
                knownEventCount: 0,
                missingCounts: {},
            }),
        });
    });

    it("never touches a personal note", () => {
        const personal: DesktopStoredEvent = {
            id: "personal",
            calendarId: calendarIdFromPath("School"),
            calendarPath: "School",
            relativePath: "School/2026-09-02 Dentist.md",
            fileName: "2026-09-02 Dentist.md",
            contents: [
                "---",
                'title: "Dentist"',
                'type: "single"',
                'date: "2026-09-02"',
                "endDate: null",
                "allDay: true",
                "---",
                "personal",
            ].join("\n"),
            event: singleEvent("2026-09-02", "Dentist"),
        };
        const plan = planIcsNoteSync({
            feed,
            snapshot: snapshot({
                cancelledKeys: new Set(["personal"]),
            }),
            existingRecords: [personal],
            previousState: state({ knownEventCount: 2 }),
            now,
        });

        expect(plan.deletes).toEqual([]);
        expect(plan.writes).toEqual([]);
    });

    it("never touches a note owned by another feed", () => {
        const foreign = managedRecord("mon", "2026-09-02", "Cours", "feed-2");
        const plan = planIcsNoteSync({
            feed,
            snapshot: snapshot({
                cancelledKeys: new Set(["mon"]),
            }),
            existingRecords: [foreign],
            previousState: state({ knownEventCount: 2 }),
            now,
        });

        expect(plan.deletes).toEqual([]);
        expect(plan.writes).toEqual([]);
    });

    it("updates a changed occurrence in place, keeping its file", () => {
        const record = managedRecord("mon", "2026-09-02", "Cours");
        const plan = planIcsNoteSync({
            feed,
            snapshot: snapshot({
                events: [occurrence("mon", "2026-09-02", "Cours (salle B)")],
            }),
            existingRecords: [record],
            previousState: state(),
            now,
        });

        expect(plan.deletes).toEqual([]);
        expect(plan.writes).toHaveLength(1);
        expect(plan.writes[0].previousRelativePath).toBe(record.relativePath);
        expect(plan.writes[0].fileName).toBe(record.fileName);
        expect(parseFrontmatter(plan.writes[0].contents)?.title).toBe(
            "Cours (salle B)"
        );
    });

    it("creates a note for a brand-new occurrence", () => {
        const plan = planIcsNoteSync({
            feed,
            snapshot: snapshot({ events: [occurrence("mon", "2026-09-02")] }),
            existingRecords: [],
            previousState: state({ knownEventCount: 0 }),
            now,
        });

        expect(plan.writes).toHaveLength(1);
        expect(plan.writes[0].previousRelativePath).toBeUndefined();
        expect(plan.writes[0].calendarPath).toBe("School");
        expect(plan.writes[0].fileName).toBe("2026-09-02 Cours.md");
        expect(plan.deletes).toEqual([]);
    });

    it("does not rewrite an unchanged managed note on a second sync", () => {
        const record = managedRecord("mon", "2026-09-02");
        const plan = planIcsNoteSync({
            feed,
            snapshot: snapshot({ events: [occurrence("mon", "2026-09-02")] }),
            existingRecords: [record],
            previousState: state(),
            now,
        });
        expect(plan.writes).toEqual([]);
    });

    it("updates the same note in place when a feed reissues a fresh UID for an unchanged occurrence", () => {
        // Observed live on an Efrei feed: same title, same day, same time,
        // a brand-new random UID on every single fetch. Pure-UID matching
        // saw a "new" occurrence every sync and never stopped creating
        // notes for it — this is the content-signature fallback that
        // recognises it's the same occurrence regardless.
        const record = managedRecord("uid-fetch-1", "2027-04-22", "Xperience");
        const plan = planIcsNoteSync({
            feed,
            snapshot: snapshot({
                events: [occurrence("uid-fetch-2", "2027-04-22", "Xperience")],
            }),
            existingRecords: [record],
            previousState: state(),
            now,
        });

        expect(plan.writes).toHaveLength(1);
        expect(plan.writes[0].previousRelativePath).toBe(record.relativePath);
        expect(plan.writes[0].fileName).toBe(record.fileName);
        expect(plan.writes[0].contents).toContain('neoIcsUid: "uid-fetch-2"');
    });

    it("still creates a new note when title, date, and time all genuinely differ", () => {
        const record = managedRecord("uid-fetch-1", "2027-04-22", "Xperience");
        const plan = planIcsNoteSync({
            feed,
            snapshot: snapshot({
                events: [occurrence("uid-fetch-2", "2027-04-23", "Xperience")],
            }),
            existingRecords: [record],
            previousState: state(),
            now,
        });

        expect(plan.writes).toHaveLength(1);
        expect(plan.writes[0].previousRelativePath).toBeUndefined();
    });

});
