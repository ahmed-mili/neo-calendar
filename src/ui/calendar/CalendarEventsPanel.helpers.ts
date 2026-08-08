import { NeoEvent } from "../../types";
import { DisplayEvent } from "../types";
import { normalizeColor } from "../../utils/color";
import {
    appendYear,
    formatDatedDay,
    formatDatedDayWithYear,
} from "./calendarFormatters";
import { t } from "../i18n";

export type PanelStatusFilter = "all" | "todo" | "complete";
export type PanelDateFilter = "all" | "scheduled" | "unscheduled" | "period";

export interface PanelPeriod {
    start: string;
    end: string;
}

export interface PanelSummary {
    totalMinutes: number;
    taskCount: number;
}

export function getDisplayTitle(title: string): string {
    return title.trim() || t("Untitled");
}

const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

/**
 * A day as the panel labels it: "Sun Nov 1" / "dim. 1 nov.", plus the year once
 * the date leaves the current one, so a list that scrolls years ahead never
 * leaves you guessing which one you are looking at.
 */
export function formatPanelDay(date: Date, currentYear: number): string {
    return formatDatedDayWithYear(date, currentYear);
}

/** The same day without its weekday, for the two ends of a range. */
function formatRangeEnd(date: Date, currentYear: number): string {
    return formatDatedDayWithYear(date, currentYear, { weekday: false });
}

/** The date line under an event's title in the panel list. */
export function formatCardDate(
    event: DisplayEvent,
    timeFormat24h: boolean,
    formatTime: (date: Date, timeFormat24h: boolean) => string,
    addDays: (date: Date, days: number) => Date,
    currentYear: number = new Date().getFullYear()
): string {
    const start = event.start;
    const end = event.end;
    const startDay = formatPanelDay(start, currentYear);

    if (event.allDay) {
        const lastDay = end ? addDays(end, -1) : start;
        if (sameDay(start, lastDay)) return startDay;
        return `${formatRangeEnd(start, currentYear)} → ${formatRangeEnd(
            lastDay,
            currentYear
        )}`;
    }

    const startTime = formatTime(start, timeFormat24h);
    if (!end) return `${startDay}, ${startTime}`;
    const endTime = formatTime(end, timeFormat24h);
    if (sameDay(start, end)) return `${startDay}, ${startTime} – ${endTime}`;
    return `${formatRangeEnd(
        start,
        currentYear
    )}, ${startTime} → ${formatRangeEnd(end, currentYear)}, ${endTime}`;
}

// Exportee : le panneau des raccourcis filtre avec la meme normalisation que le
// panneau d'evenements, pour que les deux se comportent pareil sur les accents.
export function normalizeSearch(value: string): string {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase();
}

function parseLocalDate(value: string): Date | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return null;
    const date = new Date(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3])
    );
    return Number.isNaN(date.getTime()) ? null : date;
}

function eventOverlapsPeriod(
    event: DisplayEvent,
    period: PanelPeriod | null
): boolean {
    if (event.isSomeday || !period) return false;
    const start = parseLocalDate(period.start);
    const inclusiveEnd = parseLocalDate(period.end);
    if (!start || !inclusiveEnd || inclusiveEnd < start) return false;
    const endExclusive = new Date(inclusiveEnd);
    endExclusive.setDate(endExclusive.getDate() + 1);
    return event.start < endExclusive && event.end > start;
}

export function filterPanelEvents(
    events: DisplayEvent[],
    status: PanelStatusFilter,
    date: PanelDateFilter,
    query = "",
    period: PanelPeriod | null = null
): DisplayEvent[] {
    const normalizedQuery = normalizeSearch(query.trim());
    return events.filter((event) => {
        if (date === "scheduled" && event.isSomeday) return false;
        if (date === "unscheduled" && !event.isSomeday) return false;
        if (date === "period" && !eventOverlapsPeriod(event, period)) {
            return false;
        }
        if (status !== "all") {
            if (!event.isTask || event.taskStatus !== status) return false;
        }
        if (normalizedQuery) {
            const searchable = normalizeSearch(
                `${event.title} ${event.description ?? ""}`
            );
            if (!searchable.includes(normalizedQuery)) return false;
        }
        return true;
    });
}

export function summarizePanelEvents(events: DisplayEvent[]): PanelSummary {
    return events.reduce<PanelSummary>(
        (summary, event) => {
            if (event.isTask) summary.taskCount += 1;
            if (!event.isSomeday && !event.allDay) {
                const minutes = Math.max(
                    0,
                    Math.round(
                        (event.end.getTime() - event.start.getTime()) / 60000
                    )
                );
                summary.totalMinutes += minutes;
            }
            return summary;
        },
        { totalMinutes: 0, taskCount: 0 }
    );
}

export function formatTotalMinutes(totalMinutes: number): string {
    const safeMinutes = Math.max(0, Math.round(totalMinutes));
    const hours = Math.floor(safeMinutes / 60);
    const minutes = safeMinutes % 60;
    return `${hours}h ${String(minutes).padStart(2, "0")}min`;
}

function formatPeriodDate(value: string, includeYear: boolean): string {
    const date = parseLocalDate(value);
    if (!date) return value;
    const label = formatDatedDay(date, { weekday: false });
    return includeYear ? appendYear(label, date.getFullYear()) : label;
}

export function formatPanelPeriod(
    filter: PanelDateFilter,
    period: PanelPeriod | null
): string {
    if (filter === "scheduled") return t("Scheduled");
    if (filter === "unscheduled") return t("Unscheduled");
    if (filter !== "period" || !period) return t("All dates");
    const start = parseLocalDate(period.start);
    const end = parseLocalDate(period.end);
    if (!start || !end) return t("Custom period");
    const sameYear = start.getFullYear() === end.getFullYear();
    return `${formatPeriodDate(period.start, !sameYear)} – ${formatPeriodDate(
        period.end,
        true
    )}`;
}

const COLOR_NAMES: Record<string, string> = {
    "#ed201d": "Red",
    "#fd7941": "Orange",
    "#f4be40": "Yellow",
    "#5ecc89": "Green",
    "#33b5b5": "Teal",
    "#4ca8df": "Blue",
    "#6c6fe8": "Indigo",
    "#985df6": "Purple",
    "#f45d9e": "Pink",
    "#b07d53": "Brown",
    "#b8b8b8": "Grey",
    "#6b7684": "Slate",
};

export function getCalendarColorName(color: string): string {
    // Normalise d'abord : les cles de COLOR_NAMES sont des hex, et une couleur
    // heritee peut arriver en `rgb(...)`, qui ne matcherait jamais.
    return COLOR_NAMES[normalizeColor(color)] ?? "Custom";
}

export function createUnscheduledPanelEvent(defaultAsTask: boolean): NeoEvent {
    return {
        title: "",
        type: "someday",
        allDay: true,
        ...(defaultAsTask ? { completed: false } : {}),
    } as NeoEvent;
}
