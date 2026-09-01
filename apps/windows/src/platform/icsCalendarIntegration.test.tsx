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
} {
    const fetchedUrls: string[] = [];
    const writtenFor: string[] = [];
    const deletedPaths: string[] = [];
    return {
        fetchedUrls,
        writtenFor,
        deletedPaths,
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
});
