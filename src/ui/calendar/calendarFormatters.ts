import { DAYS_SHORT, MONTHS_SHORT, MONTHS } from "./calendarConstants";
import { addDays, getWeekStart } from "./calendarDateUtils";
import { getLanguage } from "../i18n";

export function formatHour(hour: number, format24h: boolean): string {
    if (format24h) {
        return `${hour.toString().padStart(2, "0")}:00`;
    }
    if (hour === 0) return "12:00 AM";
    if (hour < 12) return `${hour}:00 AM`;
    if (hour === 12) return "12:00 PM";
    return `${hour - 12}:00 PM`;
}

export function formatTime(date: Date, format24h: boolean): string {
    const h = date.getHours();
    const m = date.getMinutes();
    if (format24h) {
        return `${h.toString().padStart(2, "0")}:${m
            .toString()
            .padStart(2, "0")}`;
    }
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

export function formatDayHeader(date: Date): string {
    return `${DAYS_SHORT[date.getDay()]} ${date.getDate()}`;
}

export function formatMonthTitle(date: Date): string {
    return `${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}`;
}

/** Full month name + year, e.g. "septembre 2026" (Notion mini-calendar style). */
export function formatMonthTitleFull(date: Date): string {
    return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** e.g. "sam 20 juin", or "Sat, Jun 20" — a date is not read in the same
    order in both languages, so the order follows the language too. */
export function formatDayTitle(date: Date): string {
    const day = DAYS_SHORT[date.getDay()];
    const month = MONTHS_SHORT[date.getMonth()];
    if (getLanguage() === "fr") {
        return `${day} ${date.getDate()} ${month}`;
    }
    return `${day}, ${month} ${date.getDate()}`;
}

/**
 * A dated day as the panels write it: "Thu Jun 25" / "jeu 25 juin".
 *
 * Notion-Calendar-style, with NO comma after the weekday — the en-US locale
 * inserts one and it reads better without. Pass `weekday: false` for the two
 * ends of a range, which carry the date alone.
 *
 * The names come from the dictionary rather than from toLocaleDateString, so a
 * calendar set to French reads French whatever locale the machine is set to —
 * which is exactly what the panels used to get wrong.
 */
export function formatDatedDay(
    date: Date,
    { weekday = true }: { weekday?: boolean } = {}
): string {
    const day = DAYS_SHORT[date.getDay()];
    const month = MONTHS_SHORT[date.getMonth()];
    if (getLanguage() === "fr") {
        const dated = `${date.getDate()} ${month}`;
        return weekday ? `${day} ${dated}` : dated;
    }
    const dated = `${month} ${date.getDate()}`;
    return weekday ? `${day} ${dated}` : dated;
}

/** French runs the year on; English keeps the comma it has always had. */
export function appendYear(label: string, year: number): string {
    return getLanguage() === "fr" ? `${label} ${year}` : `${label}, ${year}`;
}

/**
 * The same day, carrying its year once the date leaves the current one, so a
 * list that scrolls years ahead never leaves you guessing which one you are on.
 */
export function formatDatedDayWithYear(
    date: Date,
    currentYear: number,
    options?: { weekday?: boolean }
): string {
    const label = formatDatedDay(date, options);
    return date.getFullYear() === currentYear
        ? label
        : appendYear(label, date.getFullYear());
}

/** e.g. "20 – 26 juin 2026" / "Jun 20 – 26, 2026", and across a month end
    "28 juin – 4 juil. 2026" / "Jun 28 – Jul 4, 2026". */
export function formatWeekTitle(weekStart: Date): string {
    const weekEnd = addDays(weekStart, 6);
    const startMonth = MONTHS_SHORT[weekStart.getMonth()];
    const endMonth = MONTHS_SHORT[weekEnd.getMonth()];
    const year = weekStart.getFullYear();
    const sameMonth = weekStart.getMonth() === weekEnd.getMonth();

    if (getLanguage() === "fr") {
        if (sameMonth) {
            return `${weekStart.getDate()} – ${weekEnd.getDate()} ${startMonth} ${year}`;
        }
        return `${weekStart.getDate()} ${startMonth} – ${weekEnd.getDate()} ${endMonth} ${year}`;
    }

    if (sameMonth) {
        return `${startMonth} ${weekStart.getDate()} – ${weekEnd.getDate()}, ${year}`;
    }
    return `${startMonth} ${weekStart.getDate()} – ${endMonth} ${weekEnd.getDate()}, ${year}`;
}

export function getMonthDayTitle(date: Date): string {
    return `${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}`;
}

export function getListTitle(date: Date, firstDay: number = 0): string {
    return formatWeekTitle(getWeekStart(date, firstDay));
}
