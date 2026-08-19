import { DateTime } from "luxon";
import { Options, RRule, rrulestr } from "rrule";
import { NeoEvent } from "../../types";
import { DAY_ORDER, DayCode } from "./recurrence";
import { isSeries, parseOccurrenceId } from "../tasks";

/**
 * Deleting one occurrence of a series, and finding where the series begins.
 *
 * An occurrence has no file of its own: the whole series lives in one note, and
 * a date is taken out of it by being written into `skipDates` — the same key a
 * moved or resized occurrence already uses. Cutting the series short instead
 * moves its end (UNTIL for an rrule, endRecur for a weekday series), so the
 * dates before the one deleted stay exactly as they were.
 */

const dayIndexOf = (code: DayCode): number => DAY_ORDER.indexOf(code);

function rruleOf(event: NeoEvent & { type: "rrule" }) {
    try {
        // UTC anchor, exactly as the expansion reads occurrences back, so a
        // machine east or west of UTC finds the same first date.
        return rrulestr(event.rrule, {
            dtstart: DateTime.fromISO(event.startDate, {
                zone: "utc",
            }).toJSDate(),
        });
    } catch {
        return null;
    }
}

/**
 * The date the series visibly begins on: its first occurrence that has not been
 * deleted, or null when the event does not recur, has no anchor to count from,
 * or has nothing left.
 */
export function seriesStartDate(event: NeoEvent): string | null {
    if (event.type === "rrule") {
        const rule = rruleOf(event);
        if (!rule) return null;
        const skip = new Set(event.skipDates || []);
        let cursor = new Date(
            DateTime.fromISO(event.startDate, { zone: "utc" }).toMillis() - 1
        );
        // Every turn of the loop consumes one skipped date, so one turn more
        // than there are skipped dates always reaches an occurrence or the end.
        for (let attempt = 0; attempt <= skip.size; attempt++) {
            const next = rule.after(cursor, false);
            if (!next) return null;
            const iso = DateTime.fromJSDate(next, { zone: "utc" }).toISODate();
            if (!iso) return null;
            if (!skip.has(iso)) return iso;
            cursor = next;
        }
        return null;
    }

    if (event.type === "recurring") {
        if (!event.startRecur) return null;
        const days = new Set(
            (event.daysOfWeek as DayCode[])
                .map(dayIndexOf)
                .filter((index) => index >= 0)
        );
        if (days.size === 0) return null;
        const skip = new Set(event.skipDates || []);
        const end = event.endRecur ?? null;
        // A weekly series meets one of its days within any seven consecutive
        // ones, so seven days per skipped date always covers the search.
        const limit = 7 * (skip.size + 1);
        let day = DateTime.fromISO(event.startRecur, { zone: "local" });
        for (let offset = 0; offset < limit; offset++) {
            const iso = day.toISODate();
            if (!iso) return null;
            if (end && iso > end) return null;
            if (days.has(day.weekday % 7) && !skip.has(iso)) return iso;
            day = day.plus({ days: 1 });
        }
        return null;
    }

    return null;
}

/**
 * Whether deleting this display event has to ask what to delete: one date of a
 * series, or that date and everything after it.
 */
export function needsOccurrenceChoice(
    event: NeoEvent,
    displayId: string
): boolean {
    return isSeries(event) && parseOccurrenceId(displayId) !== null;
}

/**
 * The series with one date taken out of it. An event that does not recur is
 * given back untouched: there is no single occurrence to remove.
 */
export function withOccurrenceRemoved(
    event: NeoEvent,
    dateISO: string
): NeoEvent {
    if (!isSeries(event)) return event;
    const skipDates = [...(event.skipDates || [])];
    if (!skipDates.includes(dateISO)) skipDates.push(dateISO);
    return { ...event, skipDates };
}

/**
 * The series cut short the day before the given date, or null when nothing
 * would be left of it — in which case the caller deletes the event itself.
 */
export function withFollowingRemoved(
    event: NeoEvent,
    dateISO: string
): NeoEvent | null {
    if (!isSeries(event)) return null;

    const start = seriesStartDate(event);
    if (!start || start >= dateISO) return null;

    const endsOn = DateTime.fromISO(dateISO, { zone: "utc" })
        .minus({ days: 1 })
        .toISODate();
    if (!endsOn) return null;

    if (event.type === "recurring") return { ...event, endRecur: endsOn };

    const rule = rruleOf(event);
    if (!rule) return null;
    const options: Partial<Options> = { ...(rule as RRule).origOptions };
    // The anchor belongs to the event, not to the rule text (the expansion
    // passes startDate in), and a count read alongside the new end would carry
    // the series past it.
    delete options.dtstart;
    delete options.count;
    // End of day in UTC, as the expansion reads occurrences in UTC: a local
    // end-of-day would drop or keep the last date depending on the machine.
    options.until = DateTime.fromISO(endsOn, { zone: "utc" })
        .endOf("day")
        .toJSDate();

    return { ...event, rrule: new RRule(options).toString() };
}
