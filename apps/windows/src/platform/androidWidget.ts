import type { DisplayEvent } from "../../../../src/ui/types";
import { DAYS_SHORT } from "../../../../src/ui/calendar/calendarConstants";
import { formatTime } from "../../../../src/ui/calendar/calendarFormatters";
import { t } from "../../../../src/ui/i18n";
import { parseColor, rgbToHex } from "../../../../src/utils/color";

/**
 * What the home-screen widget is given to draw.
 *
 * The widget cannot read the calendar: the event files sit behind a document
 * tree whose permission belongs to the activity, and re-implementing the date
 * rules inside a RemoteViewsFactory would mean maintaining them twice. So the
 * app builds the finished list here — grouped by day, written in the chosen
 * language and time format, coloured by calendar — and the widget only lays it
 * out. It keeps working while the app is closed, because the last list written
 * is still there.
 */

/** Rows past this are never seen: the widget cannot grow indefinitely, and a
    longer list only costs work on every change. */
const MAX_ROWS = 60;

/** Days past this are not "upcoming" any more. */
const HORIZON_DAYS = 30;

export interface WidgetRow {
    id: string;
    /** Milliseconds, so the widget can tell on its own what has gone by. */
    startMs: number;
    endMs: number;
    /** Which day this falls on, for grouping once the past has been dropped. */
    dayKey: string;
    weekday: string;
    day: string;
    title: string;
    /** Empty for an all-day event: there is no span to read out. */
    time: string;
    allDay: boolean;
    color: string;
}

export interface WidgetPayload {
    updatedAt: number;
    rows: WidgetRow[];
    /** Weekday names, Sunday first, so the widget can name a day by itself. */
    weekdays: string[];
    emptyLabel: string;
    theme: { surface: string; text: string; muted: string; accent: string };
}

function startOfDay(date: Date): Date {
    const copy = new Date(date);
    copy.setHours(0, 0, 0, 0);
    return copy;
}

function dayKey(date: Date): string {
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function buildWidgetPayload({
    events,
    now,
    timeFormat24h,
    theme,
}: {
    events: readonly DisplayEvent[];
    now: Date;
    timeFormat24h: boolean;
    theme: WidgetPayload["theme"];
}): WidgetPayload {
    const today = startOfDay(now);
    const horizon = new Date(today);
    horizon.setDate(horizon.getDate() + HORIZON_DAYS);

    /*
     * An event that started this morning and runs until tonight is still
     * upcoming — what matters is whether it has ended, not whether it has
     * begun. Sorting by start keeps the day in the order it will be lived.
     */
    const upcoming = events
        .filter((event) => !event.isSomeday)
        .filter((event) => event.end >= now && event.start < horizon)
        .sort((a, b) => +a.start - +b.start)
        .slice(0, MAX_ROWS);

    /*
     * Every row carries its own times and its day, and none of them is marked
     * as opening a day here. That decision belongs to the widget: it outlives
     * this list by hours, during which events end and midnight passes, and it
     * has to be able to drop what is over and re-group what is left without
     * the app being there to tell it.
     */
    const rows: WidgetRow[] = upcoming.map((event) => ({
        id: event.id,
        startMs: +event.start,
        endMs: +event.end,
        dayKey: dayKey(event.start),
        weekday: DAYS_SHORT[event.start.getDay()],
        day: String(event.start.getDate()),
        title: event.title || t("Untitled"),
        /* An all-day event has no times worth reading: it is marked by a dot
           beside its name instead, which says the same thing in no words. */
        time: event.allDay
            ? ""
            : `${formatTime(event.start, timeFormat24h)} – ${formatTime(
                  event.end,
                  timeFormat24h
              )}`,
        allDay: event.allDay,
        color: event.color,
    }));

    return {
        updatedAt: +now,
        rows,
        weekdays: [...DAYS_SHORT],
        emptyLabel: t("No event scheduled"),
        theme,
    };
}

/**
 * The colours the widget should wear, as plain hex.
 *
 * Not read off the CSS: `--background-secondary` and `--text-muted` are
 * declared as `color-mix(...)`, and reading a custom property back gives its
 * declared text rather than a computed colour — Android cannot parse that, and
 * a regex over it picks the digits out of "#1e1e2e" and calls it black.
 *
 * The theme's three source colours ARE plain hex, written onto the root element
 * by the app itself, so the two mixes are worked out here with the same recipe
 * App.tsx uses for the CSS. One computation, two places that agree by
 * construction.
 */
/** Exported under a test-only name: the recipe is worth pinning down, the
    browser plumbing that feeds it is not. */
export const __mixForTests = (a: string, b: string, weight: number) =>
    mix(a, b, weight);

function mix(a: string, b: string, weight: number): string {
    const left = parseColor(a);
    const right = parseColor(b);
    if (!left || !right) return a;
    return rgbToHex({
        r: left.r * weight + right.r * (1 - weight),
        g: left.g * weight + right.g * (1 - weight),
        b: left.b * weight + right.b * (1 - weight),
    });
}

export function readWidgetTheme(): WidgetPayload["theme"] {
    const fallback = {
        surface: "#252539",
        text: "#e6e9f5",
        muted: "#9aa0b4",
        accent: "#f38ba8",
    };
    if (typeof document === "undefined") return fallback;

    const style = getComputedStyle(document.documentElement);
    const read = (name: string, spare: string) => {
        const value = style.getPropertyValue(name).trim();
        return parseColor(value) ? value : spare;
    };

    const surface = read("--nc-theme-surface", "#1e1e2e");
    const ink = read("--nc-theme-ink", fallback.text);

    return {
        surface: mix(surface, ink, 0.88),
        text: ink,
        muted: mix(ink, surface, 0.72),
        accent: read("--nc-theme-accent", fallback.accent),
    };
}
