import ICAL from "ical.js";
import { DateTime } from "luxon";
import { NeoEvent, validateEvent } from "../../types";

/**
 * Turning an iCalendar (.ics) feed into normalized events. Used by both the ICS
 * and the CalDAV calendars, which are read-only: nothing here is ever written
 * back, so only the fields the calendar view needs are extracted.
 */

const DATE_FORMAT = "yyyy-MM-dd";
const TIME_FORMAT = "HH:mm";

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/**
 * An all-day value is a bare calendar date with no zone attached, so its
 * components are taken exactly as written. Routing it through a timezone would
 * let the date slip by a day for viewers west of UTC.
 */
const dateOnly = (time: ICAL.Time): string =>
    `${pad(time.year, 4)}-${pad(time.month)}-${pad(time.day)}`;

/** ical.js marks a value carrying no zone at all with this pseudo-zone. */
const FLOATING = "floating";

/**
 * Teach ical.js the zones this feed declares.
 *
 * A `TZID` is only a name — the offsets it stands for, and the dates it switches
 * between them, live in the feed's own VTIMEZONE blocks. Register those and
 * ical.js can place a wall clock on the timeline; skip it and it can't, so every
 * zoned time silently collapses to a floating one.
 */
function registerTimezones(calendar: ICAL.Component): void {
    for (const vtimezone of calendar.getAllSubcomponents("vtimezone")) {
        const zone = new ICAL.Timezone(vtimezone);
        if (zone.tzid && !ICAL.TimezoneService.has(zone.tzid)) {
            ICAL.TimezoneService.register(zone.tzid, zone);
        }
    }
}

/** The wall-clock fields of an iCalendar time, with no zone attached. */
const wallClock = (time: ICAL.Time) => ({
    year: time.year,
    month: time.month,
    day: time.day,
    hour: time.hour,
    minute: time.minute,
    second: time.second,
});

/**
 * A timed value, placed on the timeline and then shown in the viewer's own zone.
 *
 * Three cases, in the order they're tried:
 *   1. ical.js resolved the value's zone — either a `TZID` backed by a VTIMEZONE
 *      we registered, or an explicit UTC `Z`. Its instant is authoritative, DST
 *      and all.
 *   2. The value names a `TZID` with no VTIMEZONE to back it. Feeds are supposed
 *      to ship one (RFC 5545 §3.2.19) and most do, but when one doesn't and the
 *      name is a real IANA zone, it can still be resolved.
 *   3. Neither: a floating time. It has no zone by definition, so it means the
 *      same wall clock wherever it's read (RFC 5545 §3.3.5) — the viewer's own.
 */
function localDateTime(time: ICAL.Time, tzid?: string): DateTime {
    const zone = time.zone?.tzid;

    if (zone && zone !== FLOATING) {
        return DateTime.fromJSDate(time.toJSDate());
    }

    if (tzid) {
        const zoned = DateTime.fromObject(wallClock(time), { zone: tzid });
        if (zoned.isValid) {
            return zoned.toLocal();
        }
    }

    // toJSDate() reads a floating wall clock in the local zone, which is exactly
    // what a floating time means.
    return DateTime.fromJSDate(time.toJSDate());
}

/** The `TZID` a property was tagged with, if any. */
function tzidOf(vevent: ICAL.Component, name: string): string | undefined {
    const parameter = vevent.getFirstProperty(name)?.getParameter("tzid");
    return typeof parameter === "string" ? parameter : undefined;
}

/**
 * Remote events have no vault location, so they need an id that is stable
 * across refetches: the feed's UID, its start, and its kind.
 */
const eventId = (
    uid: string,
    startDate: string,
    kind: "single" | "recurring"
): string => `ics::${uid}::${startDate}::${kind}`;

/** The dates an RRULE explicitly skips (EXDATE). */
function skipDatesOf(vevent: ICAL.Component): string[] {
    return vevent
        .getAllProperties("exdate")
        .flatMap((property) => property.getValues<ICAL.Time>())
        .map(dateOnly);
}

function eventFromVEvent(vevent: ICAL.Component): NeoEvent | null {
    const event = new ICAL.Event(vevent);
    const start = event.startDate;

    // When and how long.
    let time: Record<string, unknown>;
    let startDate: string;
    let endDate: string | null;

    if (start.isDate) {
        time = { allDay: true };
        startDate = dateOnly(start);
        // ical.js synthesises a DTEND for events that don't declare one, so ask
        // the component directly: only an explicit DTEND means the event really
        // spans past its start day.
        const dtend = vevent.getFirstPropertyValue<ICAL.Time>("dtend");
        endDate = dtend ? dateOnly(dtend) : null;
    } else {
        // DTSTART and DTEND each carry their own TZID — usually the same one,
        // but nothing says they must be.
        const from = localDateTime(start, tzidOf(vevent, "dtstart"));
        const to = localDateTime(event.endDate, tzidOf(vevent, "dtend"));
        time = {
            allDay: false,
            startTime: from.toFormat(TIME_FORMAT),
            endTime: to.toFormat(TIME_FORMAT),
        };
        startDate = from.toFormat(DATE_FORMAT);
        const endDay = to.toFormat(DATE_FORMAT);
        // Only carry an end date when the event actually runs past midnight.
        endDate = endDay === startDate ? null : endDay;
    }

    const recurrence = vevent.getFirstPropertyValue<ICAL.Recur>("rrule");
    if (recurrence) {
        return validateEvent({
            title: event.summary,
            id: eventId(event.uid, startDate, "recurring"),
            ...time,
            type: "rrule",
            startDate,
            rrule: `RRULE:${recurrence.toString()}`,
            skipDates: skipDatesOf(vevent),
        });
    }

    return validateEvent({
        title: event.summary,
        id: eventId(event.uid, startDate, "single"),
        ...time,
        type: "single",
        date: startDate,
        endDate,
    });
}

/** Every VEVENT in an iCalendar document, as normalized events. */
export function getEventsFromICS(text: string): NeoEvent[] {
    const calendar = new ICAL.Component(ICAL.parse(text));

    // Must come first: without the feed's zones, every TZID'd time would parse
    // as floating and land on the wrong hour.
    registerTimezones(calendar);

    return calendar
        .getAllSubcomponents("vevent")
        .flatMap((vevent) => eventFromVEvent(vevent) ?? []);
}
