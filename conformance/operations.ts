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
import { allDayBandRows, hiddenBarCountByDay, packAllDayLanes, visibleLaneCount } from "../src/ui/calendar/useAllDayLanes";
import type { AllDayLaneBar } from "../src/ui/calendar/useAllDayLanes";
import { getEventsFromICS, occurrenceSignature, parseIcsSnapshot } from "../src/calendars/parsing/ics";
import type { DisplayEvent } from "../src/ui/types";
import {
    LONG_MONTH_NAME,
    computeOverlapGroups,
    eventDurationHours,
    eventTopHours,
    getISOWeek,
    isMultiDayTimed,
    needsCompactMonthType,
    todayBadgeState,
} from "../src/ui/calendar/CalendarUtils";
import {
    availableIcalDirectoryName,
    planIcalDirectoryAssignments,
    planIcalNoteSync,
    planIcsNoteSync,
    preferredIcalDirectoryName,
    scopedIcalEvent,
    startOfLocalWeekIso,
} from "../apps/windows/src/platform/icalNoteSync";
import type { IcalNoteWrite } from "../apps/windows/src/platform/icalNoteSync";
import type { DesktopStoredEvent } from "../apps/windows/src/platform/desktopEventFormat";
import { mergeRemoteEvents } from "../apps/windows/src/platform/mergeRemoteEvents";
import type { NeoEvent } from "../src/types";
import { validateEvent } from "../src/types/schema";

/** Un évènement d'entrée ne porte que les champs que la grille lit (id, début,
 *  fin) ; les autres champs de DisplayEvent reçoivent une valeur neutre fixe. */
const gridEvent = (e: { id: string; start: string; end: string }): DisplayEvent =>
    ({ id: e.id, title: "", start: new Date(e.start), end: new Date(e.end), allDay: true, color: "#888" }) as DisplayEvent;

const gridBars = (bars: { startIdx: number; span: number; lane: number }[]): AllDayLaneBar[] =>
    bars.map((b) => ({ event: gridEvent({ id: "", start: "1970-01-01T00:00:00.000Z", end: "1970-01-01T00:00:00.000Z" }), ...b }));

/** Un évènement d'entrée passe par la validation, comme l'application le fait avant de l'écrire. */
const validated = (raw: unknown): NeoEvent => {
    const event = validateEvent(raw);
    if (!event) throw new Error("évènement invalide dans un cas du corpus");
    return event;
};

/** Une note lue sur le disque : ses champs, plus son évènement brut à valider. */
const storedOf = (raw: any): DesktopStoredEvent => ({ ...raw, event: validated(raw.event) });

const writeJson = (write: IcalNoteWrite) => write;

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
    "layout.overlapGroups": ({ events }) =>
        computeOverlapGroups((events as any[]).map(gridEvent)).map((group) => ({
            events: group.events.map((item) => ({
                id: item.event.id,
                column: item.column,
                totalColumns: item.totalColumns,
            })),
        })),
    "layout.packAllDayLanes": ({ events, extendedDates, arrival }) => {
        const result = packAllDayLanes(
            events === null || events === undefined ? undefined : (events as any[]).map(gridEvent),
            (extendedDates as string[]).map((d) => new Date(d)),
            (event) => (arrival as Record<string, number>)[event.id] ?? 0
        );
        return {
            bars: result.bars.map((b) => ({ id: b.event.id, startIdx: b.startIdx, span: b.span, lane: b.lane })),
            laneCount: result.laneCount,
        };
    },
    "layout.visibleLaneCount": ({ bars, firstVisibleIdx, lastVisibleIdx }) =>
        visibleLaneCount(gridBars(bars), firstVisibleIdx, lastVisibleIdx),
    "layout.hiddenBarCountByDay": ({ bars, firstVisibleIdx, lastVisibleIdx, visibleRows }) =>
        Object.fromEntries(hiddenBarCountByDay(gridBars(bars), firstVisibleIdx, lastVisibleIdx, visibleRows)),
    "layout.allDayBandRows": ({ laneCount, draftLane, collapsed, maxRows }) =>
        allDayBandRows({ laneCount, draftLane, collapsed, maxRows }),
    // ICS : les dates sortent en chaînes ; l'ensemble des clés annulées, trié, en tableau.
    "ics.snapshot": ({ text, window }) => {
        const snapshot = parseIcsSnapshot(text, window);
        return {
            events: snapshot.events,
            cancelledKeys: [...snapshot.cancelledKeys].sort(),
            latestOccurrenceDate: snapshot.latestOccurrenceDate,
        };
    },
    "ics.signature": ({ event }) => occurrenceSignature(event as NeoEvent),
    "ics.events": ({ text }) => getEventsFromICS(text),
    "notes.serialize": ({ event, previousContents }) => {
        try {
            return { text: serializeEventMarkdown(event, previousContents ?? "") };
        } catch {
            return { error: "invalid" };
        }
    },
    // Plan de synchro : les dates entrent en chaînes ISO, les ensembles en tableaux,
    // une exception devient { error } (le message n'est pas comparé).
    "ics.directoryName": ({ name }) => preferredIcalDirectoryName(name),
    "ics.availableDirectoryName": ({ preferred, usedNames }) =>
        availableIcalDirectoryName(preferred, new Set<string>(usedNames)),
    "ics.directoryAssignments": ({ sources, existingFolderNames }) =>
        planIcalDirectoryAssignments(sources, existingFolderNames),
    "ics.scopedEvent": ({ source, event, index }) => scopedIcalEvent(source, validated(event), index),
    "ics.planNoteSync": ({ source, remoteEvents, existingRecords }) =>
        planIcalNoteSync(
            source,
            (remoteEvents as unknown[]).map(validated),
            (existingRecords as unknown[]).map(storedOf)
        ).map(writeJson),
    "ics.startOfLocalWeek": ({ now }) => {
        try {
            return startOfLocalWeekIso(new Date(now));
        } catch {
            return { error: "invalid-now" };
        }
    },
    "ics.planSync": ({ feed, snapshot, existingRecords, previousState, now }) => {
        try {
            const plan = planIcsNoteSync({
                feed,
                snapshot: {
                    events: (snapshot.events as any[]).map((occurrence) => ({
                        ...occurrence,
                        event: validated(occurrence.event),
                    })),
                    cancelledKeys: new Set<string>(snapshot.cancelledKeys),
                    latestOccurrenceDate: snapshot.latestOccurrenceDate,
                },
                existingRecords: (existingRecords as unknown[]).map(storedOf),
                previousState,
                now: new Date(now),
            });
            return {
                writes: plan.writes,
                deletes: plan.deletes.map((record) => ({ id: record.id, relativePath: record.relativePath })),
                nextState: plan.nextState,
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : "";
            return { error: message.startsWith("The ICS snapshot is unexpectedly empty") ? "empty-snapshot" : "invalid-now" };
        }
    },
    "ics.mergeRemote": ({ current, refreshedCalendarIds, arrived }) =>
        mergeRemoteEvents(current, refreshedCalendarIds, arrived),
};
