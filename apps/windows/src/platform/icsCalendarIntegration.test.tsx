import { DateTime } from "luxon";
import type { DesktopStoredEvent } from "./desktopEventFormat";
import type { IcsFeedSubscription } from "./icsFeedPreferences";
import type { IcsRuntimeStateByFeed } from "./icsSyncScheduler";
import { syncIcsFeeds, type IcsSyncIo } from "./icsCalendarIntegration";

const NOW = new Date("2026-09-01T09:00:00Z"); // Tuesday
const TODAY = DateTime.fromJSDate(NOW).toFormat("yyyyMMdd");
const TOMORROW = DateTime.fromJSDate(NOW)
    .plus({ days: 1 })
    .toFormat("yyyyMMdd");

function ics(uid: string, summary = "Course", date = TODAY): string {
    return [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Neo Calendar//Test//EN",
        "BEGIN:VEVENT",
        `UID:${uid}`,
        `DTSTART;VALUE=DATE:${date}`,
        `SUMMARY:${summary}`,
        "END:VEVENT",
        "END:VCALENDAR",
    ].join("\r\n");
}

function feed(overrides: Partial<IcsFeedSubscription> = {}): IcsFeedSubscription {
    return {
        id: "feed-1",
        calendarPath: "Cours",
        // Already provisioned by default, matching the calendar's own root —
        // this is what every test before folder-per-link existed was
        // exercising, and keeping it as the default keeps them exercising
        // exactly that. The provisioning path itself gets its own tests,
        // built with `directory` explicitly left out.
        directory: "Cours",
        name: "Emploi du temps",
        url: "https://example.test/calendar.ics",
        active: true,
        ...overrides,
    };
}

function io(overrides: Partial<IcsSyncIo> = {}): IcsSyncIo & {
    fetchedUrls: string[];
    writtenFor: string[];
    deletedPaths: string[];
    ensuredDirectories: string[];
} {
    const fetchedUrls: string[] = [];
    const writtenFor: string[] = [];
    const deletedPaths: string[] = [];
    const ensuredDirectories: string[] = [];
    return {
        fetchedUrls,
        writtenFor,
        deletedPaths,
        ensuredDirectories,
        fetchIcs: async (url) => {
            fetchedUrls.push(url);
            return ics("event-1");
        },
        writeEventFile: async (write) => {
            writtenFor.push(write.event.id as string);
            return `${write.calendarPath}/${write.fileName}`;
        },
        deleteEventFile: async (path) => {
            deletedPaths.push(path);
        },
        ensureDirectory: async (calendarPath, name) => {
            const directory = `${calendarPath}/${name}`;
            ensuredDirectories.push(directory);
            return directory;
        },
        ...overrides,
    };
}

describe("syncIcsFeeds", () => {
    it("fetches only the due feed on a routine wake, leaving the other alone", async () => {
        const due = feed({ id: "due", refreshMinutes: 5 });
        const notDue = feed({
            id: "not-due",
            url: "https://example.test/other.ics",
            refreshMinutes: 180,
        });
        const states: IcsRuntimeStateByFeed = {
            "not-due": {
                lastAttemptAt: DateTime.fromJSDate(NOW)
                    .minus({ minutes: 10 })
                    .toISO() as string,
                lastSuccessAt: DateTime.fromJSDate(NOW)
                    .minus({ minutes: 10 })
                    .toISO() as string,
                knownEventCount: 1,
                missingCounts: {},
            },
        };
        const harness = io();

        await syncIcsFeeds({
            feeds: [due, notDue],
            states,
            records: [],
            now: NOW,
            defaultMinutes: 60,
            io: harness,
        });

        expect(harness.fetchedUrls).toEqual([due.url]);
    });

    it("forces exactly the requested feed regardless of its due state", async () => {
        const idle = feed({
            id: "idle",
            refreshMinutes: 360,
        });
        const other = feed({
            id: "other",
            url: "https://example.test/other.ics",
            refreshMinutes: 360,
        });
        const now = NOW;
        const states: IcsRuntimeStateByFeed = {
            idle: {
                lastAttemptAt: DateTime.fromJSDate(now)
                    .minus({ minutes: 1 })
                    .toISO() as string,
                lastSuccessAt: DateTime.fromJSDate(now)
                    .minus({ minutes: 1 })
                    .toISO() as string,
                knownEventCount: 1,
                missingCounts: {},
            },
            other: {
                lastAttemptAt: DateTime.fromJSDate(now)
                    .minus({ minutes: 1 })
                    .toISO() as string,
                lastSuccessAt: DateTime.fromJSDate(now)
                    .minus({ minutes: 1 })
                    .toISO() as string,
                knownEventCount: 1,
                missingCounts: {},
            },
        };
        const harness = io();

        await syncIcsFeeds({
            feeds: [idle, other],
            states,
            records: [],
            now,
            defaultMinutes: 60,
            forcedIds: new Set([idle.id]),
            io: harness,
        });

        expect(harness.fetchedUrls).toEqual([idle.url]);
    });

    it("executes the plan's writes then its guarded deletes on a successful sync", async () => {
        const f = feed();
        // A previously-imported note the fresh snapshot no longer contains,
        // dated this coming week and already missed once — the second valid
        // miss with the feed's latest occurrence proven after it triggers the
        // guarded delete.
        const staleContents = [
            "---",
            'neoManagedBy: "neo-calendar:ics"',
            "neoManagedVersion: 1",
            `neoIcsFeedId: "${f.id}"`,
            'neoIcsUid: "stale-uid"',
            "neoIcsRecurrenceId: null",
            'neoIcsStatus: "confirmed"',
            'title: "Old session"',
            'type: "single"',
            `date: "${DateTime.fromJSDate(NOW).toISODate()}"`,
            "allDay: true",
            "---",
        ].join("\n");
        const staleRecord: DesktopStoredEvent = {
            id: "neo-calendar:ics::feed-1::stale-uid",
            calendarId: "local::Cours",
            calendarPath: "Cours",
            relativePath: "Cours/old-session.md",
            fileName: "old-session.md",
            contents: staleContents,
            event: {
                id: "neo-calendar:ics::feed-1::stale-uid",
                title: "Old session",
                type: "single",
                date: DateTime.fromJSDate(NOW).toISODate() as string,
                endDate: null,
                allDay: true,
            } as DesktopStoredEvent["event"],
            readOnly: true,
        };
        const states: IcsRuntimeStateByFeed = {
            [f.id]: {
                lastSuccessAt: DateTime.fromJSDate(NOW)
                    .minus({ days: 1 })
                    .toISO() as string,
                lastAttemptAt: DateTime.fromJSDate(NOW)
                    .minus({ days: 1 })
                    .toISO() as string,
                knownEventCount: 2,
                missingCounts: { "stale-uid": 1 },
            },
        };
        const harness = io({
            fetchIcs: async () => ics("event-1", "Fresh session", TOMORROW),
        });

        const result = await syncIcsFeeds({
            feeds: [f],
            states,
            records: [staleRecord],
            now: NOW,
            defaultMinutes: 60,
            io: harness,
        });

        expect(harness.writtenFor).toContain(
            "neo-calendar:ics::feed-1::event-1"
        );
        expect(harness.deletedPaths).toEqual(["Cours/old-session.md"]);
        expect(
            result.records.some((record) => record.id === staleRecord.id)
        ).toBe(false);
        expect(result.states[f.id].lastError).toBeUndefined();
        expect(result.states[f.id].lastSuccessAt).toBe(NOW.toISOString());
    });

    it("executes neither writes nor deletes when the feed fails to parse", async () => {
        const f = feed();
        const previousSuccess = DateTime.fromJSDate(NOW)
            .minus({ days: 1 })
            .toISO() as string;
        const states: IcsRuntimeStateByFeed = {
            [f.id]: {
                lastSuccessAt: previousSuccess,
                lastAttemptAt: previousSuccess,
                knownEventCount: 3,
                missingCounts: {},
            },
        };
        const harness = io({
            fetchIcs: async () => "not a calendar document",
        });

        const result = await syncIcsFeeds({
            feeds: [f],
            states,
            records: [],
            now: NOW,
            defaultMinutes: 60,
            io: harness,
        });

        expect(harness.writtenFor).toEqual([]);
        expect(harness.deletedPaths).toEqual([]);
        expect(result.states[f.id].lastError).toBeDefined();
        // The last success is retained rather than cleared by a failed attempt.
        expect(result.states[f.id].lastSuccessAt).toBe(previousSuccess);
        expect(result.states[f.id].lastAttemptAt).toBe(NOW.toISOString());
    });

    it("touches nothing for a feed that was removed from the list", async () => {
        const harness = io();

        const result = await syncIcsFeeds({
            feeds: [],
            states: {},
            records: [],
            now: NOW,
            defaultMinutes: 60,
            io: harness,
        });

        expect(harness.fetchedUrls).toEqual([]);
        expect(harness.writtenFor).toEqual([]);
        expect(harness.deletedPaths).toEqual([]);
        expect(result.records).toEqual([]);
    });

    it("provisions a folder for a link that doesn't have one yet, and reports it back", async () => {
        const f = feed({ directory: undefined });
        const harness = io();

        const result = await syncIcsFeeds({
            feeds: [f],
            states: {},
            records: [],
            now: NOW,
            defaultMinutes: 60,
            io: harness,
        });

        expect(harness.ensuredDirectories).toEqual(["Cours/Emploi du temps"]);
        expect(result.provisionedDirectories).toEqual({
            "feed-1": "Cours/Emploi du temps",
        });
        // Written into the freshly provisioned folder, not the calendar root.
        expect(harness.writtenFor).toEqual([
            "neo-calendar:ics::feed-1::event-1",
        ]);
    });

    it("does not re-provision a link that already has a folder", async () => {
        const f = feed({ directory: "Cours/Deja-la" });
        const harness = io();

        const result = await syncIcsFeeds({
            feeds: [f],
            states: {},
            records: [],
            now: NOW,
            defaultMinutes: 60,
            io: harness,
        });

        expect(harness.ensuredDirectories).toEqual([]);
        expect(result.provisionedDirectories).toEqual({});
    });

    it("moves a note it already owns into a link's freshly provisioned folder", async () => {
        const f = feed({ directory: undefined });
        const ownedContents = [
            "---",
            'neoManagedBy: "neo-calendar:ics"',
            "neoManagedVersion: 1",
            `neoIcsFeedId: "${f.id}"`,
            'neoIcsUid: "event-1"',
            "neoIcsRecurrenceId: null",
            'neoIcsStatus: "confirmed"',
            'title: "Course"',
            'type: "single"',
            `date: "${TODAY.slice(0, 4)}-${TODAY.slice(4, 6)}-${TODAY.slice(6)}"`,
            "endDate: null",
            "allDay: true",
            "---",
        ].join("\n");
        const ownedRecord: DesktopStoredEvent = {
            id: "neo-calendar:ics::feed-1::event-1",
            calendarId: "local::Cours",
            calendarPath: "Cours",
            relativePath: "Cours/course.md",
            fileName: "course.md",
            contents: ownedContents,
            event: {
                id: "neo-calendar:ics::feed-1::event-1",
                title: "Course",
                type: "single",
                date: `${TODAY.slice(0, 4)}-${TODAY.slice(4, 6)}-${TODAY.slice(6)}`,
                endDate: null,
                allDay: true,
            } as DesktopStoredEvent["event"],
            readOnly: true,
        };
        const harness = io();

        await syncIcsFeeds({
            feeds: [f],
            states: {},
            records: [ownedRecord],
            now: NOW,
            defaultMinutes: 60,
            io: harness,
        });

        // Same event, unchanged content — still written, because only its
        // folder was out of date.
        expect(harness.writtenFor).toEqual([
            "neo-calendar:ics::feed-1::event-1",
        ]);
    });
});

describe("syncIcsFeeds — one file, one record", () => {
    /** Two VEVENTs, same summary and same day, each with its own UID: the
     *  shape the Efrei planning feed publishes some lessons in. */
    function duplicatedIcs(uidA: string, uidB: string): string {
        return [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "PRODID:-//Neo Calendar//Test//EN",
            "BEGIN:VEVENT",
            `UID:${uidA}`,
            `DTSTART;VALUE=DATE:${TOMORROW}`,
            "SUMMARY:Efrei For Good Xperience",
            "END:VEVENT",
            "BEGIN:VEVENT",
            `UID:${uidB}`,
            `DTSTART;VALUE=DATE:${TOMORROW}`,
            "SUMMARY:Efrei For Good Xperience",
            "END:VEVENT",
            "END:VCALENDAR",
        ].join("\r\n");
    }

    it("materialises a lesson the feed publishes twice as a single note", async () => {
        const result = await syncIcsFeeds({
            feeds: [feed()],
            states: {},
            records: [],
            now: NOW,
            defaultMinutes: 60,
            io: io({ fetchIcs: async () => duplicatedIcs("uid-a", "uid-b") }),
        });

        expect(result.records).toHaveLength(1);
    });

    it("keeps one record when a feed reissues the UID of an existing note", async () => {
        // First cycle materialises the lesson, second cycle meets it again
        // under a fresh UID. The note is the same file either way, so the
        // calendar must still show exactly one event, not one per sync.
        const first = await syncIcsFeeds({
            feeds: [feed()],
            states: {},
            records: [],
            now: NOW,
            defaultMinutes: 60,
            io: io({ fetchIcs: async () => duplicatedIcs("uid-a", "uid-b") }),
        });

        const second = await syncIcsFeeds({
            feeds: [feed()],
            states: first.states,
            records: first.records,
            now: new Date(NOW.getTime() + 3_600_000),
            defaultMinutes: 60,
            io: io({ fetchIcs: async () => duplicatedIcs("uid-c", "uid-d") }),
        });

        expect(second.records).toHaveLength(1);
    });

    it("does not grow the record list over repeated syncs", async () => {
        let cycle = 0;
        let records: DesktopStoredEvent[] = [];
        let states: IcsRuntimeStateByFeed = {};
        for (let run = 0; run < 4; run += 1) {
            const outcome = await syncIcsFeeds({
                feeds: [feed()],
                states,
                records,
                now: new Date(NOW.getTime() + run * 3_600_000),
                defaultMinutes: 60,
                io: io({
                    fetchIcs: async () => {
                        cycle += 1;
                        return duplicatedIcs(`uid-${cycle}-a`, `uid-${cycle}-b`);
                    },
                }),
            });
            records = outcome.records;
            states = outcome.states;
        }

        expect(records).toHaveLength(1);
    });
});
