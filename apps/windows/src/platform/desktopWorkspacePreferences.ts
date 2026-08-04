import type { ViewType } from "../../../../src/ui/types";
import {
    parseExternalCalendarSources,
    type DesktopExternalCalendarSource,
} from "./desktopExternalCalendars";

export type DesktopInitialView = "day" | "week" | "month" | "list";
export type MobileInitialView = "day" | "3days" | "list";

export interface DesktopWorkspacePreferences {
    version: 4;
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
    defaultEventsAsTasks: boolean;
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

export function defaultDesktopWorkspacePreferences(): DesktopWorkspacePreferences {
    return {
        version: 4,
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
        defaultEventsAsTasks: true,
        externalCalendars: [],
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

    return {
        version: 4,
        colors,
        order: strings(source.order),
        defaultCalendarPath:
            typeof source.defaultCalendarPath === "string"
                ? source.defaultCalendarPath
                : undefined,
        hiddenCalendarPaths: strings(source.hiddenCalendarPaths),
        allDayCollapsed: bool(
            source.allDayCollapsed,
            defaults.allDayCollapsed
        ),
        showWeekNumbers: bool(
            source.showWeekNumbers,
            defaults.showWeekNumbers
        ),
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
        timeFormat24h: bool(
            source.timeFormat24h,
            defaults.timeFormat24h
        ),
        clickToCreateEventFromMonthView: bool(
            source.clickToCreateEventFromMonthView,
            defaults.clickToCreateEventFromMonthView
        ),
        defaultEventsAsTasks: bool(
            source.defaultEventsAsTasks,
            defaults.defaultEventsAsTasks
        ),
        externalCalendars: parseExternalCalendarSources(
            source.externalCalendars ?? source.calendarSources
        ),
    };
}
