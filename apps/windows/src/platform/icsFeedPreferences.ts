import {
    parseExternalCalendarSources,
    type DesktopIcalCalendarSource,
} from "./desktopExternalCalendars";

export const ICS_REFRESH_MINUTES = [5, 15, 30, 60, 180, 360] as const;
export type IcsRefreshMinutes = (typeof ICS_REFRESH_MINUTES)[number];

export interface IcsFeedSubscription {
    id: string;
    calendarPath: string;
    name: string;
    url: string;
    refreshMinutes?: IcsRefreshMinutes;
    active: boolean;
}

export const MAX_ICS_FEEDS_PER_CALENDAR = 5;

function stringValue(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}

function calendarPath(value: unknown): string | null {
    const path = stringValue(value);
    if (!path || path === "." || path === "..") return null;
    if (/[<>:"/\\|?*\u0000-\u001f]/.test(path)) return null;
    if (/[. ]$/.test(path)) return null;
    if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(path)) {
        return null;
    }
    return path;
}

function isRefreshMinutes(value: unknown): value is IcsRefreshMinutes {
    return (
        typeof value === "number" &&
        (ICS_REFRESH_MINUTES as readonly number[]).includes(value)
    );
}

export function normalizeIcsUrl(value: string): string {
    const trimmed = value.trim();
    const candidate = /^webcal:\/\//i.test(trimmed)
        ? `https://${trimmed.slice("webcal://".length)}`
        : trimmed;
    try {
        const parsed = new URL(candidate);
        return parsed.protocol === "https:" || parsed.protocol === "http:"
            ? parsed.toString()
            : "";
    } catch {
        return "";
    }
}

export function parseIcsFeeds(value: unknown): IcsFeedSubscription[] {
    if (!Array.isArray(value)) return [];

    const feeds: IcsFeedSubscription[] = [];
    const ids = new Set<string>();
    const urlsByCalendar = new Map<string, Set<string>>();
    const countsByCalendar = new Map<string, number>();

    for (const item of value) {
        if (!item || typeof item !== "object") continue;
        const source = item as Record<string, unknown>;
        const id = stringValue(source.id);
        const path = calendarPath(source.calendarPath);
        const name = stringValue(source.name);
        const rawUrl = stringValue(source.url);
        if (!id || ids.has(id) || !path || !name || !rawUrl) continue;

        const url = normalizeIcsUrl(rawUrl);
        if (
            !url ||
            (!isRefreshMinutes(source.refreshMinutes) &&
                source.refreshMinutes !== undefined)
        ) {
            continue;
        }

        const urls = urlsByCalendar.get(path) ?? new Set<string>();
        const count = countsByCalendar.get(path) ?? 0;
        if (urls.has(url) || count >= MAX_ICS_FEEDS_PER_CALENDAR) continue;

        urls.add(url);
        urlsByCalendar.set(path, urls);
        countsByCalendar.set(path, count + 1);
        ids.add(id);
        feeds.push({
            id,
            calendarPath: path,
            name,
            url,
            ...(isRefreshMinutes(source.refreshMinutes)
                ? { refreshMinutes: source.refreshMinutes }
                : {}),
            active: typeof source.active === "boolean" ? source.active : true,
        });
    }
    return feeds;
}

export function migrateLegacyIcalSources(value: unknown): {
    feeds: IcsFeedSubscription[];
    unresolved: DesktopIcalCalendarSource[];
} {
    const legacySources = parseExternalCalendarSources(value);
    const legacyIcalSources = legacySources.filter(
        (source): source is DesktopIcalCalendarSource => source.type === "ical"
    );
    const feeds = parseIcsFeeds(
        legacyIcalSources.flatMap((source) =>
            calendarPath(source.directory)
                ? [
                      {
                          id: source.id,
                          calendarPath: source.directory,
                          name: source.name,
                          url: source.url,
                      },
                  ]
                : []
        )
    );

    return {
        feeds,
        unresolved: legacyIcalSources.filter(
            (source) => !calendarPath(source.directory)
        ),
    };
}
