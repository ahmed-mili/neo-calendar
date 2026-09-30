import { filenameForEvent, parseFrontmatter, parseStoredEvent, serializeEventMarkdown } from "../apps/windows/src/platform/desktopEventFormat";
import { cloneFranceHolidaySource, parseExternalCalendarSources } from "../apps/windows/src/platform/desktopExternalCalendars";
import { migrateLegacyIcalSources, normalizeIcsUrl, parseIcsFeeds } from "../apps/windows/src/platform/icsFeedPreferences";
import {
    defaultDesktopWorkspacePreferences,
    deviceWorkspacePreferences,
    isReminderMinutes,
    parseDesktopWorkspacePreferences,
    parseDeviceWorkspacePreferences,
    prayerReminderMinutesFor,
    reconcileWorkspacePreferences,
    reminderListOf,
    sharedWorkspacePreferences,
    withDeviceWorkspacePreferences,
} from "../apps/windows/src/platform/desktopWorkspacePreferences";
import {
    ALLDAY_MAX_ROWS,
    ALLDAY_ROW_HEIGHT,
    ANDROID_HOUR_HEIGHT,
    EVENT_VGAP,
    MAX_HOUR_HEIGHT,
    MIN_HOUR_HEIGHT,
    OVERLAP_COL_GAP,
    clampHourHeight,
} from "../src/ui/calendar/calendarConstants";
import { addDays, endOfDay, getWeekDays, getWeekStart, isSameDay, startOfDay } from "../src/ui/calendar/calendarDateUtils";
import {
    LONG_MONTH_NAME,
    eventDurationHours,
    eventTopHours,
    getISOWeek,
    isMultiDayTimed,
    needsCompactMonthType,
    todayBadgeState,
} from "../src/ui/calendar/CalendarUtils";
import type { NeoEvent } from "../src/types";
import { validateEvent } from "../src/types/schema";

/** Relie chaque opération du corpus au code TypeScript qui fait foi.
 *  Le corpus nomme des opérations, pas des fonctions : renommer une
 *  fonction ne touche qu'ici. */
export const OPERATIONS: Record<string, (input: any) => unknown> = {
    "notes.frontmatter": ({ text }) => parseFrontmatter(text),
    "notes.filename": ({ event }) => filenameForEvent(event as NeoEvent),
    "notes.validate": ({ raw }) => validateEvent(raw),
    "notes.parse": ({ file, knownCalendarIds }) => {
        const stored = parseStoredEvent(file, new Set<string>(knownCalendarIds));
        if (!stored) return null;
        const { contents: _contents, ...rest } = stored;
        return rest;
    },
    "preferences.icsUrl": ({ value }) => normalizeIcsUrl(value),
    "preferences.icsFeeds": ({ value }) => parseIcsFeeds(value),
    "preferences.icsMigrate": ({ value }) => migrateLegacyIcalSources(value),
    "preferences.externalSources": ({ value }) => parseExternalCalendarSources(value),
    "preferences.franceHolidaySource": () => cloneFranceHolidaySource(),
    "preferences.defaults": () => defaultDesktopWorkspacePreferences(),
    "preferences.parse": ({ value }) => parseDesktopWorkspacePreferences(value),
    "preferences.reminderList": ({ value }) => reminderListOf(value),
    "preferences.isReminderMinutes": ({ value }) => isReminderMinutes(value),
    "preferences.prayerReminder": ({ settings, relativePath }) =>
        prayerReminderMinutesFor(settings, relativePath),
    "preferences.shared": ({ preferences }) =>
        sharedWorkspacePreferences(parseDesktopWorkspacePreferences(preferences)),
    "preferences.device": ({ preferences }) =>
        deviceWorkspacePreferences(parseDesktopWorkspacePreferences(preferences)),
    "preferences.deviceParse": ({ value }) => parseDeviceWorkspacePreferences(value),
    "preferences.withDevice": ({ preferences, device }) =>
        withDeviceWorkspacePreferences(parseDesktopWorkspacePreferences(preferences), device),
    "preferences.reconcile": ({ previous, loaded, fileExisted }) =>
        reconcileWorkspacePreferences({
            previous: previous === null ? null : parseDesktopWorkspacePreferences(previous),
            loaded: parseDesktopWorkspacePreferences(loaded),
            fileExisted,
        }),
    // Grille : les dates entrent en chaînes ISO et sortent en ISO UTC (toISOString).
    "layout.startOfDay": ({ date }) => startOfDay(new Date(date)),
    "layout.endOfDay": ({ date }) => endOfDay(new Date(date)),
    "layout.addDays": ({ date, days }) => addDays(new Date(date), days),
    "layout.isSameDay": ({ a, b }) => isSameDay(new Date(a), new Date(b)),
    "layout.getWeekStart": ({ date, firstDay }) => getWeekStart(new Date(date), firstDay),
    "layout.getWeekDays": ({ weekStart }) => getWeekDays(new Date(weekStart)),
    "layout.getISOWeek": ({ date }) => getISOWeek(new Date(date)),
    "layout.todayBadgeState": ({ visibleDates, now }) =>
        todayBadgeState((visibleDates as string[]).map((d) => new Date(d)), new Date(now)),
    "layout.eventTopHours": ({ start, dayStart }) => eventTopHours(new Date(start), new Date(dayStart)),
    "layout.eventDurationHours": ({ start, end }) => eventDurationHours(new Date(start), new Date(end)),
    "layout.isMultiDayTimed": ({ start, end, allDay }) =>
        isMultiDayTimed({ start: new Date(start), end: new Date(end), allDay }),
    "layout.needsCompactMonthType": ({ monthName }) => needsCompactMonthType(monthName),
    "layout.clampHourHeight": ({ px }) => clampHourHeight(px),
    "layout.constants": () => ({
        MIN_HOUR_HEIGHT,
        MAX_HOUR_HEIGHT,
        ANDROID_HOUR_HEIGHT,
        ALLDAY_ROW_HEIGHT,
        ALLDAY_MAX_ROWS,
        OVERLAP_COL_GAP,
        EVENT_VGAP,
        LONG_MONTH_NAME,
    }),
    "notes.serialize": ({ event, previousContents }) => {
        try {
            return { text: serializeEventMarkdown(event, previousContents ?? "") };
        } catch {
            return { error: "invalid" };
        }
    },
};
