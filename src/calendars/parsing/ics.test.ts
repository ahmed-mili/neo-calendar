import { DateTime } from "luxon";
import { getEventsFromICS } from "./ics";

/**
 * VEVENT → NeoEvent, per docs/event-format-spec.md §5.
 *
 * Timed events render in the *viewer's* zone, so the expected clock values are
 * derived from the UTC instant rather than hard-coded: hard-coding them would
 * pin the machine's timezone into the test (the previous snapshots did exactly
 * that, and could only pass in UTC+1).
 */

const localTime = (utcInstant: string) =>
    DateTime.fromISO(utcInstant, { zone: "utc" }).toLocal().toFormat("HH:mm");

const localDate = (utcInstant: string) =>
    DateTime.fromISO(utcInstant, { zone: "utc" })
        .toLocal()
        .toFormat("yyyy-MM-dd");

const calendar = (...vevents: string[]) =>
    [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Neo Calendar//Test//EN",
        ...vevents,
        "END:VCALENDAR",
    ].join("\n");

/**
 * A VTIMEZONE for America/New_York, as a real feed carries one. The offsets and
 * the DST switchover rules live here, which is what lets a TZID be resolved.
 */
const NEW_YORK_VTIMEZONE = [
    "BEGIN:VTIMEZONE",
    "TZID:America/New_York",
    "BEGIN:DAYLIGHT",
    "TZOFFSETFROM:-0500",
    "TZOFFSETTO:-0400",
    "TZNAME:EDT",
    "DTSTART:19700308T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:-0400",
    "TZOFFSETTO:-0500",
    "TZNAME:EST",
    "DTSTART:19701101T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
    "END:STANDARD",
    "END:VTIMEZONE",
];

describe("all-day events", () => {
    it("takes the date as written, and has no end without an explicit DTEND", () => {
        const ics = calendar(
            "BEGIN:VEVENT",
            "UID:holiday",
            "DTSTART;VALUE=DATE:20240115",
            "SUMMARY:Public holiday",
            "DESCRIPTION:Not mapped",
            "LOCATION:Not mapped either",
            "END:VEVENT"
        );

        expect(getEventsFromICS(ics)).toEqual([
            {
                id: "ics::holiday::2024-01-15::single",
                title: "Public holiday",
                type: "single",
                allDay: true,
                date: "2024-01-15",
                endDate: null,
            },
        ]);
    });

    it("carries an explicit DTEND through as the end date", () => {
        const ics = calendar(
            "BEGIN:VEVENT",
            "UID:conference",
            "DTSTART;VALUE=DATE:20240201",
            "DTEND;VALUE=DATE:20240204",
            "SUMMARY:Conference",
            "END:VEVENT"
        );

        expect(getEventsFromICS(ics)).toEqual([
            {
                id: "ics::conference::2024-02-01::single",
                title: "Conference",
                type: "single",
                allDay: true,
                date: "2024-02-01",
                endDate: "2024-02-04",
            },
        ]);
    });
});

describe("timed events", () => {
    it("renders in the viewer's zone, with no end date within one day", () => {
        const ics = calendar(
            "BEGIN:VEVENT",
            "UID:standup",
            "DTSTART:20240310T083000Z",
            "DTEND:20240310T093000Z",
            "SUMMARY:Hello\\, iCal!",
            "END:VEVENT"
        );

        expect(getEventsFromICS(ics)).toEqual([
            {
                id: `ics::standup::${localDate(
                    "2024-03-10T08:30:00Z"
                )}::single`,
                // The escaped comma comes back unescaped.
                title: "Hello, iCal!",
                type: "single",
                allDay: false,
                date: localDate("2024-03-10T08:30:00Z"),
                startTime: localTime("2024-03-10T08:30:00Z"),
                endTime: localTime("2024-03-10T09:30:00Z"),
                endDate: null,
            },
        ]);
    });

    it("gets an end date once it runs past midnight", () => {
        const ics = calendar(
            "BEGIN:VEVENT",
            "UID:late-session",
            "DTSTART:20240315T220000Z",
            "DTEND:20240316T000000Z",
            "SUMMARY:Late session",
            "END:VEVENT"
        );

        const [event] = getEventsFromICS(ics);
        const startsOn = localDate("2024-03-15T22:00:00Z");
        const endsOn = localDate("2024-03-16T00:00:00Z");

        // Guard the premise: this only tests anything where the two differ.
        expect(endsOn).not.toEqual(startsOn);
        expect(event).toEqual({
            id: `ics::late-session::${startsOn}::single`,
            title: "Late session",
            type: "single",
            allDay: false,
            date: startsOn,
            startTime: localTime("2024-03-15T22:00:00Z"),
            endTime: localTime("2024-03-16T00:00:00Z"),
            endDate: endsOn,
        });
    });
});

describe("timezones", () => {
    it("resolves a TZID against the feed's VTIMEZONE", () => {
        // 11:00 in New York on a March day is 11:00 EST — five hours behind UTC.
        const ics = calendar(
            ...NEW_YORK_VTIMEZONE,
            "BEGIN:VEVENT",
            "UID:winter",
            "DTSTART;TZID=America/New_York:20220301T110000",
            "DTEND;TZID=America/New_York:20220301T120000",
            "SUMMARY:Winter meeting",
            "END:VEVENT"
        );

        expect(getEventsFromICS(ics)[0]).toMatchObject({
            startTime: localTime("2022-03-01T16:00:00Z"),
            endTime: localTime("2022-03-01T17:00:00Z"),
        });
    });

    it("follows the zone across its daylight-saving switch", () => {
        // The same 11:00 wall clock in April is EDT — only four hours behind. A
        // fixed offset would be an hour out here; the VTIMEZONE's rules aren't.
        const ics = calendar(
            ...NEW_YORK_VTIMEZONE,
            "BEGIN:VEVENT",
            "UID:summer",
            "DTSTART;TZID=America/New_York:20240408T110000",
            "DTEND;TZID=America/New_York:20240408T121500",
            "SUMMARY:Summer meeting",
            "END:VEVENT"
        );

        expect(getEventsFromICS(ics)[0]).toMatchObject({
            startTime: localTime("2024-04-08T15:00:00Z"),
            endTime: localTime("2024-04-08T16:15:00Z"),
        });
    });

    it("resolves an IANA TZID even with no VTIMEZONE to back it", () => {
        // Feeds are supposed to ship a VTIMEZONE for every TZID they use. Some
        // don't — but if the TZID names a real zone, it can still be resolved.
        const ics = calendar(
            "BEGIN:VEVENT",
            "UID:no-vtimezone",
            "DTSTART;TZID=America/New_York:20240408T110000",
            "DTEND;TZID=America/New_York:20240408T120000",
            "SUMMARY:Orphan zone",
            "END:VEVENT"
        );

        expect(getEventsFromICS(ics)[0]).toMatchObject({
            startTime: localTime("2024-04-08T15:00:00Z"),
        });
    });

    it("reads a zoneless wall clock as the viewer's own time", () => {
        // A floating time has no zone by definition: 08:30 means 08:30 wherever
        // you are (RFC 5545 §3.3.5).
        const ics = calendar(
            "BEGIN:VEVENT",
            "UID:floating",
            "DTSTART:20240310T083000",
            "DTEND:20240310T093000",
            "SUMMARY:Floating",
            "END:VEVENT"
        );

        expect(getEventsFromICS(ics)[0]).toMatchObject({
            startTime: "08:30",
            endTime: "09:30",
            date: "2024-03-10",
        });
    });
});

describe("recurring events", () => {
    it("maps RRULE and EXDATE", () => {
        const ics = calendar(
            ...NEW_YORK_VTIMEZONE,
            "BEGIN:VEVENT",
            "UID:weekly-sync",
            "DTSTART;TZID=America/New_York:20240408T110000",
            "DTEND;TZID=America/New_York:20240408T121500",
            "RRULE:FREQ=WEEKLY;WKST=SU;BYDAY=MO,WE",
            "EXDATE;VALUE=DATE:20240422",
            "SUMMARY:Weekly sync",
            "END:VEVENT"
        );

        // 11:00 EDT is 15:00 UTC.
        const starts = "2024-04-08T15:00:00Z";

        expect(getEventsFromICS(ics)).toEqual([
            {
                // Note the id says "recurring" while the type says "rrule".
                id: `ics::weekly-sync::${localDate(starts)}::recurring`,
                title: "Weekly sync",
                type: "rrule",
                allDay: false,
                startDate: localDate(starts),
                startTime: localTime(starts),
                endTime: localTime("2024-04-08T16:15:00Z"),
                // Re-emitted by ical.js, which reorders the parts.
                rrule: "RRULE:FREQ=WEEKLY;BYDAY=MO,WE;WKST=SU",
                skipDates: ["2024-04-22"],
            },
        ]);
    });
});

describe("whole feeds", () => {
    it("returns one event per VEVENT, in order", () => {
        const ics = calendar(
            "BEGIN:VEVENT",
            "UID:first",
            "DTSTART;VALUE=DATE:20240101",
            "SUMMARY:First",
            "END:VEVENT",
            "BEGIN:VEVENT",
            "UID:second",
            "DTSTART;VALUE=DATE:20240102",
            "SUMMARY:Second",
            "END:VEVENT"
        );

        expect(getEventsFromICS(ics).map((e) => e.title)).toEqual([
            "First",
            "Second",
        ]);
    });

    it("returns nothing for a feed with no events", () => {
        expect(getEventsFromICS(calendar())).toEqual([]);
    });
});
