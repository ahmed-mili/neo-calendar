import { t } from "../i18n";

/** Timed events keep the compact relative delays people already use. */
export const TIMED_REMINDER_CHOICES = [0, 5, 10, 30, 60] as const;

/**
 * All-day reminders are still persisted as "minutes before the event start",
 * but their start is midnight. Negative values therefore mean a clock time on
 * the event day itself: -540 = 09:00 the same day; 900 = 09:00 one day before.
 * This keeps the on-disk number[] contract backward-compatible while letting an
 * all-day event express the thing a person actually chooses: a day + an hour.
 */
export const ALL_DAY_REMINDER_CHOICES = [-540, 900, 2340, 9540] as const;

/**
 * RemindersRow predates the all-day editor and receives no allDay prop. There is
 * only one event panel at a time, and DateOptionsRow is rendered immediately
 * before RemindersRow, so it publishes the current schedule mode while React
 * renders that panel. Mutating this one stable array keeps the existing row and
 * its native pointer/click path intact instead of duplicating the reminder UI.
 */
export const REMINDER_CHOICES: number[] = [...TIMED_REMINDER_CHOICES];
let allDayDisplay = false;

export function setReminderDisplayAllDay(allDay: boolean): void {
    allDayDisplay = allDay;
    const next = allDay ? ALL_DAY_REMINDER_CHOICES : TIMED_REMINDER_CHOICES;
    REMINDER_CHOICES.splice(0, REMINDER_CHOICES.length, ...next);
}

export function isReminderDisplayAllDay(): boolean {
    return allDayDisplay;
}

export interface ReminderLabelParts {
    amount: string;
    suffix: string;
}

function twoDigits(value: number): string {
    return String(value).padStart(2, "0");
}

/**
 * Read a persisted all-day offset back as the clock time + relative day that
 * produced it. This deliberately also handles old arbitrary offsets: e.g. an
 * old 10-minute reminder becomes 23:50 · 1 day before instead of being lied
 * about as "10 min before" on an event that has no start hour.
 */
export function allDayReminderLabelParts(
    minutesBeforeMidnight: number
): ReminderLabelParts {
    const minutesFromEventDayStart = -minutesBeforeMidnight;
    const dayIndex = Math.floor(minutesFromEventDayStart / 1440);
    const minutesOfDay = ((minutesFromEventDayStart % 1440) + 1440) % 1440;
    const hours = Math.floor(minutesOfDay / 60);
    const minutes = minutesOfDay % 60;
    const daysBefore = Math.max(0, -dayIndex);

    return {
        amount: `${twoDigits(hours)}:${twoDigits(minutes)}`,
        suffix:
            daysBefore === 0
                ? t("Same day")
                : daysBefore === 1
                ? `${t("1 day")} ${t("before")}`
                : `${daysBefore} ${t("days")} ${t("before")}`,
    };
}

export function reminderLabelParts(
    minutes: number,
    allDay = allDayDisplay
): ReminderLabelParts {
    if (allDay) return allDayReminderLabelParts(minutes);
    if (minutes === 0) return { amount: t("At start of event"), suffix: "" };
    if (minutes < 60)
        return { amount: `${minutes} min`, suffix: t("before") };
    const hours = minutes / 60;
    return {
        amount: `${hours} ${t(hours === 1 ? "hour" : "hours")}`,
        suffix: t("before"),
    };
}
