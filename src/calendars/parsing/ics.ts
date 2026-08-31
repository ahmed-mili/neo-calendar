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

/* ------------------------------------------------------------------------- *
 * Bounded occurrence snapshot
 *
 * The sync engine needs more than a list of VEVENTs: it needs every recurring
 * series flattened into dated occurrences inside an explicit window, each with
 * a stable identity (UID plus RECURRENCE-ID, never the translated title), and
 * it needs the cancellations stated as such — STATUS:CANCELLED and EXDATE —
 * kept apart from occurrences that are merely absent.
 * ------------------------------------------------------------------------- */

/** A single dated occurrence, identified independently of its wording. */
export interface IcsOccurrence {
    key: string;
    uid: string;
    recurrenceId: string | null;
    event: NeoEvent & { type: "single" };
}

export interface IcsSnapshot {
    events: IcsOccurrence[];
    /** Keys the feed cancels outright (STATUS:CANCELLED or EXDATE). */
    cancelledKeys: Set<string>;
    /** The latest occurrence date materialized, or null for an empty feed. */
    latestOccurrenceDate: string | null;
}

/** A UTC instant with second precision, e.g. `2026-09-01T08:00:00Z`. */
function utcInstant(time: ICAL.Time): string {
    return (
        DateTime.fromJSDate(time.toJSDate())
            .toUTC()
            .toISO({ suppressMilliseconds: true }) ?? ""
    );
}

const occurrenceKey = (uid: string, recurrenceId: string | null): string =>
    recurrenceId === null ? uid : `${uid}::${recurrenceId}`;

function attendeesOf(vevent: ICAL.Component): string[] | undefined {
    const values = vevent
        .getAllProperties("attendee")
        .map((property) => property.getFirstValue())
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.replace(/^mailto:/i, "").trim())
        .filter(Boolean);
    return values.length ? values : undefined;
}

function textOf(vevent: ICAL.Component, name: string): string | undefined {
    const value = vevent.getFirstPropertyValue(name);
    return typeof value === "string" && value.trim() ? value : undefined;
}

const CANCELLED = (vevent: ICAL.Component): boolean => {
    const status = vevent.getFirstPropertyValue<string>("status");
    return typeof status === "string" && status.toUpperCase() === "CANCELLED";
};

/**
 * One dated occurrence as a single event. `start`/`end` are the occurrence's
 * own times (already shifted for a detached instance); every other field comes
 * from the VEVENT that carries this occurrence.
 */
function singleOccurrenceEvent(
    vevent: ICAL.Component,
    start: ICAL.Time,
    end: ICAL.Time | null
): (NeoEvent & { type: "single" }) | null {
    const summary = vevent.getFirstPropertyValue<string>("summary") ?? "";

    let time: Record<string, unknown>;
    let startDate: string;
    let endDate: string | null;

    if (start.isDate) {
        time = { allDay: true };
        startDate = dateOnly(start);
        endDate =
            end && !end.compare(start) ? null : end ? dateOnly(end) : null;
    } else {
        const from = localDateTime(start, tzidOf(vevent, "dtstart"));
        const to = localDateTime(
            end ?? start,
            tzidOf(vevent, "dtend") ?? tzidOf(vevent, "dtstart")
        );
        time = {
            allDay: false,
            startTime: from.toFormat(TIME_FORMAT),
            endTime: to.toFormat(TIME_FORMAT),
        };
        startDate = from.toFormat(DATE_FORMAT);
        const endDay = to.toFormat(DATE_FORMAT);
        endDate = endDay === startDate ? null : endDay;
    }

    const event = validateEvent({
        title: summary,
        description: textOf(vevent, "description"),
        location: textOf(vevent, "location"),
        attendees: attendeesOf(vevent),
        ...time,
        type: "single",
        date: startDate,
        endDate,
    });
    return event ? (event as NeoEvent & { type: "single" }) : null;
}

const sortKey = (event: NeoEvent & { type: "single" }): string =>
    `${event.date} ${event.allDay ? "00:00" : event.startTime}`;

/**
 * Flatten a feed into dated occurrences inside `[from, to]`.
 *
 * Recurring series are expanded from the Monday of the week containing `from`
 * through the end of `to`; detached instances (`RECURRENCE-ID`) and `EXDATE`
 * are applied during expansion, and every explicit cancellation is recorded in
 * `cancelledKeys` rather than silently dropped. Finite non-recurring events are
 * always kept, even when they fall outside that window — an old dated event is
 * still part of what the feed returned.
 */
export function parseIcsSnapshot(
    text: string,
    window: { from: string; to: string }
): IcsSnapshot {
    const calendar = new ICAL.Component(ICAL.parse(text));
    registerTimezones(calendar);

    const startMs = DateTime.fromISO(window.from)
        .startOf("week")
        .startOf("day")
        .toJSDate()
        .getTime();
    const endMs = DateTime.fromISO(window.to).endOf("day").toJSDate().getTime();

    const vevents = calendar.getAllSubcomponents("vevent");
    const masters = new Map<string, ICAL.Component>();
    const detached: ICAL.Component[] = [];
    for (const vevent of vevents) {
        if (vevent.getFirstPropertyValue("recurrence-id")) {
            detached.push(vevent);
        } else {
            const uid = vevent.getFirstPropertyValue<string>("uid");
            if (uid) masters.set(uid, vevent);
        }
    }

    const occurrences: IcsOccurrence[] = [];
    const cancelledKeys = new Set<string>();
    const usedDetached = new Set<ICAL.Component>();

    const detachedFor = (uid: string, recurrenceId: string) =>
        detached.find(
            (vevent) =>
                vevent.getFirstPropertyValue<string>("uid") === uid &&
                utcInstant(
                    vevent.getFirstPropertyValue<ICAL.Time>("recurrence-id")!
                ) === recurrenceId
        );

    for (const [uid, vevent] of masters) {
        const event = new ICAL.Event(vevent);
        for (const exception of detached) {
            if (exception.getFirstPropertyValue<string>("uid") === uid) {
                event.relateException(new ICAL.Event(exception));
            }
        }

        if (!event.isRecurring()) {
            const key = occurrenceKey(uid, null);
            if (CANCELLED(vevent)) {
                cancelledKeys.add(key);
                continue;
            }
            const single = singleOccurrenceEvent(
                vevent,
                event.startDate,
                event.endDate
            );
            if (single) {
                occurrences.push({
                    key,
                    uid,
                    recurrenceId: null,
                    event: single,
                });
            }
            continue;
        }

        // EXDATE is a stated cancellation. The iterator already skips those
        // dates, so record them from the property before expanding.
        for (const property of vevent.getAllProperties("exdate")) {
            for (const value of property.getValues<ICAL.Time>()) {
                cancelledKeys.add(`${uid}::${utcInstant(value)}`);
            }
        }

        const iterator = event.iterator();
        let next = iterator.next();
        for (let guard = 0; next && guard < 5000; guard += 1) {
            const ms = next.toJSDate().getTime();
            if (ms > endMs) break;
            if (ms >= startMs) {
                const details = event.getOccurrenceDetails(next);
                const recurrenceId = utcInstant(details.recurrenceId);
                const key = `${uid}::${recurrenceId}`;
                const source = details.item.component;
                const exception = detachedFor(uid, recurrenceId);
                if (exception) usedDetached.add(exception);

                if (CANCELLED(source)) {
                    cancelledKeys.add(key);
                } else {
                    const single = singleOccurrenceEvent(
                        source,
                        details.startDate,
                        details.endDate
                    );
                    if (single) {
                        occurrences.push({
                            key,
                            uid,
                            recurrenceId,
                            event: single,
                        });
                    }
                }
            }
            next = iterator.next();
        }
    }

    // A detached instance whose master never appeared in the feed still stands
    // on its own.
    for (const vevent of detached) {
        if (usedDetached.has(vevent)) continue;
        const uid = vevent.getFirstPropertyValue<string>("uid");
        const recurrenceTime =
            vevent.getFirstPropertyValue<ICAL.Time>("recurrence-id");
        if (!uid || !recurrenceTime) continue;
        const recurrenceId = utcInstant(recurrenceTime);
        const key = `${uid}::${recurrenceId}`;
        if (CANCELLED(vevent)) {
            cancelledKeys.add(key);
            continue;
        }
        const event = new ICAL.Event(vevent);
        const single = singleOccurrenceEvent(
            vevent,
            event.startDate,
            event.endDate
        );
        if (single) {
            occurrences.push({ key, uid, recurrenceId, event: single });
        }
    }

    occurrences.sort((a, b) =>
        sortKey(a.event).localeCompare(sortKey(b.event))
    );

    const latestOccurrenceDate =
        occurrences.length === 0
            ? null
            : occurrences
                  .map((occurrence) => occurrence.event.date)
                  .reduce((latest, date) => (date > latest ? date : latest));

    return { events: occurrences, cancelledKeys, latestOccurrenceDate };
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
