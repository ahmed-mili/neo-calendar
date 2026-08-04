import { DAYS_SHORT, MONTHS_SHORT, MONTHS } from "./calendarConstants";
import { addDays, getWeekStart } from "./calendarDateUtils";

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

/** Full month name + year, e.g. "September 2026" (Notion mini-calendar style). */
export function formatMonthTitleFull(date: Date): string {
    return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

export function formatDayTitle(date: Date): string {
    return `${DAYS_SHORT[date.getDay()]}, ${
        MONTHS_SHORT[date.getMonth()]
    } ${date.getDate()}`;
}

export function formatWeekTitle(weekStart: Date): string {
    const weekEnd = addDays(weekStart, 6);
    if (weekStart.getMonth() === weekEnd.getMonth()) {
        return `${
            MONTHS_SHORT[weekStart.getMonth()]
        } ${weekStart.getDate()} – ${weekEnd.getDate()}, ${weekStart.getFullYear()}`;
    }
    return `${MONTHS_SHORT[weekStart.getMonth()]} ${weekStart.getDate()} – ${
        MONTHS_SHORT[weekEnd.getMonth()]
    } ${weekEnd.getDate()}, ${weekStart.getFullYear()}`;
}

export function getMonthDayTitle(date: Date): string {
    return `${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}`;
}

export function getListTitle(date: Date, firstDay: number = 0): string {
    return formatWeekTitle(getWeekStart(date, firstDay));
}
