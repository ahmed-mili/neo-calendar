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
export const REMINDER_HORIZON_DAYS = 30;

/** Legacy/default all-day reminder when an event has no own reminder list. */
export const ALL_DAY_REMINDER_HOUR = 20;

export interface Reminder {
    /** The event to open when the notification is tapped. */
    id: string;
    /** What tells two reminders of the same event apart. */
    key: string;
    /** When to post it, in milliseconds. */
    atMs: number;
    title: string;
    /** The line under the title: when the event is, in words. */
    body: string;
}

/**
 * The reminders this event asks for. The setting is the default rather than the
 * law: an event carrying its own list is announced on its own terms, and an
 * event carrying an empty one has asked for silence.
 */
function offsetsFor(event: DisplayEvent, fallbackMinutes: number): number[] {
    if (event.reminders) return event.reminders;
    return fallbackMinutes > 0 ? [fallbackMinutes] : [];
}

function bodyFor(
    offsetMinutes: number,
    start: Date,
    timeFormat24h: boolean
): string {
    const time = formatTime(start, timeFormat24h);
    if (offsetMinutes <= 0) return `${t("Starting now")} · ${time}`;
    const away =
        offsetMinutes % 60 === 0
            ? `${offsetMinutes / 60} h`
            : `${offsetMinutes} min`;
    return `${t("In")} ${away} · ${time}`;
}

function eveningBefore(start: Date): number {
    const evening = new Date(start);
    evening.setDate(evening.getDate() - 1);
    evening.setHours(ALL_DAY_REMINDER_HOUR, 0, 0, 0);
    return +evening;
}

/**
 * All-day reminders use the same persisted number[] as timed reminders, where
 * the number is minutes before the event's midnight start. That deliberately
 * permits negative values: -540 is 09:00 on the same day, 900 is 09:00 one day
 * before. Date#setMinutes performs local calendar arithmetic, so crossing a DST
 * boundary keeps the chosen wall-clock time instead of assuming every day has
 * exactly 24 UTC hours.
 */
function allDayReminderAt(start: Date, offsetMinutes: number): number {
    const at = new Date(start);
    at.setMinutes(at.getMinutes() - offsetMinutes);
    return +at;
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
    const horizon = new Date(now);
    horizon.setDate(horizon.getDate() + REMINDER_HORIZON_DAYS);

    return (
        events
            .filter((event) => !event.isSomeday)
            .filter((event) => event.start < horizon)
            .flatMap((event) => {
                const title = event.title || t("Untitled");

                if (event.allDay) {
                    // An explicit list is the new all-day contract: every value
                    // is a real day+clock reminder selected in the event panel.
                    // [] still means silence. When no list exists at all, retain
                    // the app's old default (evening before) so upgrading does
                    // not silently move everybody's existing notifications.
                    if (event.reminders) {
                        return event.reminders.map((offset) => ({
                            id: event.id,
                            key: `${event.id}#day:${offset}`,
                            atMs: allDayReminderAt(event.start, offset),
                            title,
                            body: t("All-day"),
                        }));
                    }
                    if (minutesBefore <= 0) return [];
                    return [
                        {
                            id: event.id,
                            key: `${event.id}#day`,
                            atMs: eveningBefore(event.start),
                            title,
                            body: t("Tomorrow, all day"),
                        },
                    ];
                }

                const offsets = offsetsFor(event, minutesBefore);
                if (offsets.length === 0) return [];
                return offsets.map((offset) => ({
                    id: event.id,
                    key: `${event.id}#${offset}`,
                    atMs: +event.start - offset * 60_000,
                    title,
                    body: bodyFor(offset, event.start, timeFormat24h),
                }));
            })
            /*
             * A reminder whose moment has passed is dropped rather than fired late.
             * Being told at 10:20 that something starts at 10:00 is worse than not
             * being told: it is a notification you cannot act on, arriving as if
             * you could.
             */
            .filter((reminder) => reminder.atMs > +now)
            .sort((a, b) => a.atMs - b.atMs)
    );
}
