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
import type { NeoEvent } from "../src/types";
import { buildReminders } from "../apps/windows/src/platform/androidReminders";
import { relativeDelayLabel } from "../src/ui/calendar/reminderDelay";
import { neoEventToDisplayEvents } from "../src/ui/calendar/eventExpansion";
import { validateEvent } from "../src/types/schema";

/** Une entrée du corpus de récurrence, développée en occurrences. */
const expandEntry = ({ event, id, calendarId, calendarName, color, editable, rangeStart, rangeEnd }: any) =>
    neoEventToDisplayEvents(
        validateEvent(event)!,
        id,
        calendarId,
        calendarName,
        color,
        editable,
        new Date(rangeStart),
        new Date(rangeEnd)
    );

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
    "recurrence.expand": (input) => expandEntry(input),
    "reminders.build": ({ events, now, minutesBefore, minutesByCalendar, timeFormat24h }) =>
        buildReminders({
            events: (events as any[]).flatMap(expandEntry),
            now: new Date(now),
            minutesBefore,
            minutesByCalendar,
            timeFormat24h,
        }),
    "reminders.delayLabel": ({ minutes }) => relativeDelayLabel(minutes),
    "notes.serialize": ({ event, previousContents }) => {
        try {
            return { text: serializeEventMarkdown(event, previousContents ?? "") };
        } catch {
            return { error: "invalid" };
        }
    },
};
