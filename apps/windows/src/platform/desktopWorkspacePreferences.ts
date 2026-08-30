import type { ViewType } from "../../../../src/ui/types";
import {
    parseExternalCalendarSources,
    type DesktopExternalCalendarSource,
} from "./desktopExternalCalendars";
import {
    ICS_REFRESH_MINUTES,
    migrateLegacyIcalSources,
    parseIcsFeeds,
    type IcsFeedSubscription,
    type IcsRefreshMinutes,
} from "./icsFeedPreferences";

export type DesktopInitialView = "day" | "week" | "month" | "list";
export type MobileInitialView = "day" | "3days" | "list";

export interface DesktopWorkspacePreferences {
    version: 5;
    colors: Record<string, string>;
    order: string[];
    defaultCalendarPath?: string;
    hiddenCalendarPaths: string[];
    allDayCollapsed: boolean;
    showWeekNumbers: boolean;
    sidebarVisible: boolean;
    viewType: ViewType;
    dayCount: number;
    secondaryTimezones: string[];
    initialView: {
        desktop: DesktopInitialView;
        mobile: MobileInitialView;
    };
    firstDay: number;
    timeFormat24h: boolean;
    clickToCreateEventFromMonthView: boolean;
    /** Let the day grid come to rest between two days instead of on whole ones. */
    freeScroll: boolean;
    defaultEventsAsTasks: boolean;
    /** Minutes before an event to be reminded. 0 means no reminder at all. */
    reminderMinutes: number;
    icsDefaultRefreshMinutes: IcsRefreshMinutes;
    icsFeeds: IcsFeedSubscription[];
    externalCalendars: DesktopExternalCalendarSource[];
}

const VIEW_TYPES: ViewType[] = [
    "day",
    "week",
    "month",
    "list",
    "3days",
    "days",
];
const DESKTOP_INITIAL_VIEWS: DesktopInitialView[] = [
    "day",
    "week",
    "month",
    "list",
];
const MOBILE_INITIAL_VIEWS: MobileInitialView[] = ["day", "3days", "list"];

/** How long before an event a reminder may be set for. Anything else stored in
    the file is a value this app never wrote, so it falls back to the default. */
export const REMINDER_CHOICES: readonly number[] = [0, 5, 10, 15, 30, 60];

export function defaultDesktopWorkspacePreferences(): DesktopWorkspacePreferences {
    return {
        version: 5,
        colors: {},
        order: [],
        hiddenCalendarPaths: [],
        allDayCollapsed: false,
        showWeekNumbers: false,
        sidebarVisible: true,
        viewType: "week",
        dayCount: 4,
        secondaryTimezones: [],
        initialView: {
            desktop: "week",
            mobile: "3days",
        },
        firstDay: 1,
        timeFormat24h: true,
        clickToCreateEventFromMonthView: true,
        // One swipe turns one day unless asked otherwise: half a column of
        // Saturday next to half a column of Monday is nobody's week.
        freeScroll: false,
        // An entry is an event unless you say otherwise: most of what goes on
        // a grid happens at a time rather than waiting to be done. The event
        // panel's Type row switches either way, so this is only the start.
        // Kept in step with the plugin's default in src/ui/settings.ts.
        defaultEventsAsTasks: false,
        reminderMinutes: 10,
        icsDefaultRefreshMinutes: 60,
        icsFeeds: [],
        externalCalendars: [],
    };
}

/**
 * The settings that belong to one machine rather than to the calendar.
 *
 * They change constantly — every view switch, every day-count change, every
 * sidebar toggle — and each change used to rewrite the shared file whole,
 * colours included. Two devices doing that all day is what gave Syncthing
 * something to conflict over. Kept locally, the shared file barely ever
 * changes, so there is almost nothing left to conflict about.
 */
export interface DeviceWorkspacePreferences {
    viewType?: ViewType;
    dayCount?: number;
    sidebarVisible?: boolean;
    allDayCollapsed?: boolean;
}

const DEVICE_KEYS = [
    "viewType",
    "dayCount",
    "sidebarVisible",
    "allDayCollapsed",
] as const;

export type SharedWorkspacePreferences = Omit<
    DesktopWorkspacePreferences,
    (typeof DEVICE_KEYS)[number]
>;

export function sharedWorkspacePreferences(
    preferences: DesktopWorkspacePreferences
): SharedWorkspacePreferences {
    const shared = { ...preferences } as Record<string, unknown>;
    for (const key of DEVICE_KEYS) delete shared[key];
    return shared as SharedWorkspacePreferences;
}

export function deviceWorkspacePreferences(
    preferences: DesktopWorkspacePreferences
): DeviceWorkspacePreferences {
    return {
        viewType: preferences.viewType,
        dayCount: preferences.dayCount,
        sidebarVisible: preferences.sidebarVisible,
        allDayCollapsed: preferences.allDayCollapsed,
    };
}

export function parseDeviceWorkspacePreferences(
    value: unknown
): DeviceWorkspacePreferences {
    if (!value || typeof value !== "object") return {};
    const source = value as Record<string, unknown>;

    return {
        viewType: VIEW_TYPES.includes(source.viewType as ViewType)
            ? (source.viewType as ViewType)
            : undefined,
        dayCount:
            typeof source.dayCount === "number" && source.dayCount >= 1
                ? Math.min(60, Math.round(source.dayCount))
                : undefined,
        sidebarVisible:
            typeof source.sidebarVisible === "boolean"
                ? source.sidebarVisible
                : undefined,
        allDayCollapsed:
            typeof source.allDayCollapsed === "boolean"
                ? source.allDayCollapsed
                : undefined,
    };
}

/** Lays this device's view back over the shared preferences, falling back to
    whatever the shared half carries for anything this device never set. */
export function withDeviceWorkspacePreferences(
    preferences: DesktopWorkspacePreferences,
    device: DeviceWorkspacePreferences
): DesktopWorkspacePreferences {
    return {
        ...preferences,
        viewType: device.viewType ?? preferences.viewType,
        dayCount: device.dayCount ?? preferences.dayCount,
        sidebarVisible: device.sidebarVisible ?? preferences.sidebarVisible,
        allDayCollapsed: device.allDayCollapsed ?? preferences.allDayCollapsed,
    };
}

/**
 * Decides what the app should believe after re-reading the preference file.
 *
 * The file lives in the synced data folder and both the desktop and the phone
 * rewrite it whole, so two things can happen that a plain "take what was read"
 * cannot survive: the file is briefly absent while Syncthing replaces it, and
 * the copy that arrives is the other device's, missing whatever was added here
 * since the last sync. Reading is therefore treated as new information about
 * calendar colours and ordering rather than as the whole truth: an entry that
 * exists on either side is kept, and the file wins where both know the same one.
 *
 * Hidden calendars are the exception. Revealing a calendar means removing it
 * from that list, and merging would silently undo it, so the file is taken as
 * given there.
 */
export function reconcileWorkspacePreferences({
    previous,
    loaded,
    fileExisted,
}: {
    previous: DesktopWorkspacePreferences | null;
    loaded: DesktopWorkspacePreferences;
    fileExisted: boolean;
}): DesktopWorkspacePreferences {
    if (!previous) return loaded;

    // Nothing was read, so nothing was learned. Writing defaults here is what
    // used to wipe the colours for good.
    if (!fileExisted) return previous;

    const order = [
        ...loaded.order,
        ...previous.order.filter((path) => !loaded.order.includes(path)),
    ];

    return {
        ...loaded,
        colors: { ...previous.colors, ...loaded.colors },
        order,
        icsFeeds: parseIcsFeeds([
            ...loaded.icsFeeds,
            ...previous.icsFeeds.filter(
                (previousFeed) =>
                    !loaded.icsFeeds.some(
                        (loadedFeed) => loadedFeed.id === previousFeed.id
                    )
            ),
        ]),
    };
}

function strings(value: unknown): string[] {
    return Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string")
        : [];
}

function bool(value: unknown, fallback: boolean): boolean {
    return typeof value === "boolean" ? value : fallback;
}

export function parseDesktopWorkspacePreferences(
    value: unknown
): DesktopWorkspacePreferences {
    const defaults = defaultDesktopWorkspacePreferences();
    if (!value || typeof value !== "object") return defaults;
    const source = value as Record<string, unknown>;

    const colors: Record<string, string> = {};
    if (source.colors && typeof source.colors === "object") {
        for (const [path, color] of Object.entries(
            source.colors as Record<string, unknown>
        )) {
            if (typeof color === "string") colors[path] = color;
        }
    }

    const sourceInitialView =
        source.initialView && typeof source.initialView === "object"
            ? (source.initialView as Record<string, unknown>)
            : {};
    const legacyView = VIEW_TYPES.includes(source.viewType as ViewType)
        ? (source.viewType as ViewType)
        : defaults.viewType;
    const desktopInitial = DESKTOP_INITIAL_VIEWS.includes(
        sourceInitialView.desktop as DesktopInitialView
    )
        ? (sourceInitialView.desktop as DesktopInitialView)
        : DESKTOP_INITIAL_VIEWS.includes(legacyView as DesktopInitialView)
        ? (legacyView as DesktopInitialView)
        : defaults.initialView.desktop;
    const mobileInitial = MOBILE_INITIAL_VIEWS.includes(
        sourceInitialView.mobile as MobileInitialView
    )
        ? (sourceInitialView.mobile as MobileInitialView)
        : defaults.initialView.mobile;

    const firstDay =
        typeof source.firstDay === "number" &&
        Number.isInteger(source.firstDay) &&
        source.firstDay >= 0 &&
        source.firstDay <= 6
            ? source.firstDay
            : defaults.firstDay;

    const legacySources = parseExternalCalendarSources(
        source.externalCalendars ?? source.calendarSources
    );
    const legacyIcalMigration = migrateLegacyIcalSources(legacySources);

    return {
        version: 5,
        colors,
        order: strings(source.order),
        defaultCalendarPath:
            typeof source.defaultCalendarPath === "string"
                ? source.defaultCalendarPath
                : undefined,
        hiddenCalendarPaths: strings(source.hiddenCalendarPaths),
        allDayCollapsed: bool(source.allDayCollapsed, defaults.allDayCollapsed),
        showWeekNumbers: bool(source.showWeekNumbers, defaults.showWeekNumbers),
        sidebarVisible: bool(source.sidebarVisible, defaults.sidebarVisible),
        viewType: VIEW_TYPES.includes(source.viewType as ViewType)
            ? (source.viewType as ViewType)
            : desktopInitial,
        dayCount:
            typeof source.dayCount === "number" && source.dayCount >= 1
                ? Math.min(60, Math.round(source.dayCount))
                : defaults.dayCount,
        secondaryTimezones: strings(source.secondaryTimezones),
        initialView: {
            desktop: desktopInitial,
            mobile: mobileInitial,
        },
        firstDay,
        timeFormat24h: bool(source.timeFormat24h, defaults.timeFormat24h),
        clickToCreateEventFromMonthView: bool(
            source.clickToCreateEventFromMonthView,
            defaults.clickToCreateEventFromMonthView
        ),
        freeScroll: bool(source.freeScroll, defaults.freeScroll),
        defaultEventsAsTasks: bool(
            source.defaultEventsAsTasks,
            defaults.defaultEventsAsTasks
        ),
        reminderMinutes: REMINDER_CHOICES.includes(
            Number(source.reminderMinutes)
        )
            ? Number(source.reminderMinutes)
            : defaults.reminderMinutes,
        icsDefaultRefreshMinutes: (
            ICS_REFRESH_MINUTES as readonly number[]
        ).includes(source.icsDefaultRefreshMinutes as number)
            ? (source.icsDefaultRefreshMinutes as IcsRefreshMinutes)
            : defaults.icsDefaultRefreshMinutes,
        icsFeeds: parseIcsFeeds([
            ...(Array.isArray(source.icsFeeds) ? source.icsFeeds : []),
            ...legacyIcalMigration.feeds,
        ]),
        externalCalendars: [
            ...legacySources.filter((calendar) => calendar.type === "auto"),
            ...legacyIcalMigration.unresolved,
        ],
    };
}
