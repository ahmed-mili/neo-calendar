import type { DisplayEvent } from "../../../../src/ui/types";
import { formatTime } from "../../../../src/ui/calendar/calendarFormatters";
import { t } from "../../../../src/ui/i18n";

/**
 * When the phone should speak up about an event.
 *
 * The app decides this, not the alarm: it already knows the language, the time
 * format and what counts as an event worth mentioning, and the reminder has to
 * read the same as the calendar it came from. Android is handed times and
 * finished sentences, and does nothing but wait.
 */

/** Reminders further out than this are not scheduled: the list is rewritten on
    every change anyway, so there is no point carrying months of them around. */
const HORIZON_DAYS = 30;

/** An all-day event has no hour to be early for, so it is announced the evening
    before, at this hour. */
export const ALL_DAY_REMINDER_HOUR = 20;

export interface Reminder {
    id: string;
    /** When to post it, in milliseconds. */
    atMs: number;
    title: string;
    /** The line under the title: when the event is, in words. */
    body: string;
}

function eveningBefore(start: Date): number {
    const evening = new Date(start);
    evening.setDate(evening.getDate() - 1);
    evening.setHours(ALL_DAY_REMINDER_HOUR, 0, 0, 0);
    return +evening;
}

export function buildReminders({
    events,
    now,
    minutesBefore,
    timeFormat24h,
}: {
    events: readonly DisplayEvent[];
    now: Date;
    minutesBefore: number;
    timeFormat24h: boolean;
}): Reminder[] {
    if (minutesBefore <= 0) return [];

    const horizon = new Date(now);
    horizon.setDate(horizon.getDate() + HORIZON_DAYS);

    return events
        .filter((event) => !event.isSomeday)
        .filter((event) => event.start < horizon)
        .map((event) => {
            const atMs = event.allDay
                ? eveningBefore(event.start)
                : +event.start - minutesBefore * 60_000;

            return {
                id: event.id,
                atMs,
                title: event.title || t("Untitled"),
                body: event.allDay
                    ? t("Tomorrow, all day")
                    : `${t("In")} ${minutesBefore} min · ${formatTime(
                          event.start,
                          timeFormat24h
                      )}`,
            };
        })
        /*
         * A reminder whose moment has passed is dropped rather than fired late.
         * Being told at 10:20 that something starts at 10:00 is worse than not
         * being told: it is a notification you cannot act on, arriving as if
         * you could.
         */
        .filter((reminder) => reminder.atMs > +now)
        .sort((a, b) => a.atMs - b.atMs);
}
