import { filenameForEvent, parseFrontmatter, parseStoredEvent, serializeEventMarkdown } from "../apps/windows/src/platform/desktopEventFormat";
import { cloneFranceHolidaySource, parseExternalCalendarSources } from "../apps/windows/src/platform/desktopExternalCalendars";
import { migrateLegacyIcalSources, normalizeIcsUrl, parseIcsFeeds } from "../apps/windows/src/platform/icsFeedPreferences";
import { icsSyncWindow } from "../apps/windows/src/platform/icsCalendarIntegration";
import { dueIcsFeeds } from "../apps/windows/src/platform/icsSyncScheduler";
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
import { buildReminders } from "../apps/windows/src/platform/androidReminders";
import { prayerRemindersFor } from "../apps/windows/src/platform/prayerReminders";
import { relativeDelayLabel } from "../src/ui/calendar/reminderDelay";
import { dayShiftFromAnchor, projectGridDrag } from "../src/ui/calendar/dragProjection";
import { applyEventDrag, applyEventResize } from "../src/ui/calendar/useEventDragResize";
import { positionToDate } from "../src/ui/calendar/CalendarUtils";
import { setHourHeight } from "../src/ui/calendar/calendarConstants";
import { setOccurrenceStatus } from "../src/ui/tasks";
import { neoEventToDisplayEvents } from "../src/ui/calendar/eventExpansion";
import { validateEvent } from "../src/types/schema";
import {
    defaultRecurrence,
    eventToRecurrenceState,
    matchPreset,
    presetToRecurrence,
    recurrenceSummary,
    recurrenceToEventFields,
    recurrenceToRRule,
    rruleToRecurrence,
    dayCodeOf,
} from "../src/ui/calendar/recurrence";
import {
    detachedOccurrence,
    needsScopeChoice,
    occurrenceDateOf,
    occurrenceIsDone,
    seriesWithoutOccurrence,
} from "../src/ui/calendar/recurringEdit";
import { recurringEditChanges } from "../src/ui/calendar/recurringEditChanges";
import { seriesStartDate, withFollowingRemoved, withOccurrenceRemoved } from "../src/ui/calendar/recurrenceDeletion";
import { mergeForSave } from "../src/ui/calendar/eventScheduling";
import { reminderLabelParts } from "../src/ui/calendar/reminderChoices";
import { reminderListLabel, reminderMinutesFrom, splitReminderDelay } from "../src/ui/calendar/reminderDelay";
import { attachmentPathFor } from "../src/ui/calendar/pastedAttachment";
import { computeDuration, daysBetween, panelEndDate } from "../src/ui/calendar/EventPanel.helpers";
import { geoUrlFor, locationDestinationFor, mapsAppsFor, mapsUrlFor } from "../src/ui/calendar/locationLink";
import { readChecklist, toggleLine } from "../src/ui/calendar/descriptionChecklist";
import { readInlineLinks } from "../src/ui/calendar/descriptionInlineLinks";

/** Reproduit `JSONObject.toString(2)` de l'`org.json` d'Android (libcore,
 *  JSONStringer avec indentation) pour ce que la WebView envoie :
 *  `JSON.stringify(args)` passe par le pont (`bridge.ts`), `new JSONObject(args)`
 *  le relit (LinkedHashMap : l'ordre du texte JS, clés entières d'abord),
 *  puis `toString(2)`. Règles reprises de JSONStringer.java :
 *  - indentation de 2 espaces, `": "` après une clé, virgule en fin de ligne ;
 *  - un objet ou un tableau vide s'écrit `{}` / `[]`, sans saut de ligne ;
 *  - `string()` échappe `"`, `\` et `/` (en `\/`), `\t \b \n \r \f`, et tout
 *    autre caractère <= 0x1F en `\uXXXX` minuscule ; le reste (accents, U+007F,
 *    U+2028) reste tel quel ;
 *  - `numberToString` : un nombre égal à son `long` s'écrit en entier.
 *  Aucun décimal ne sort d'une préférence lue (tous les nombres sont des
 *  entiers) : ici il lève, plutôt qu'une mise en forme devinée. */
const javaJsonString = (text: string): string => {
    let out = '"';
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        const code = text.charCodeAt(i);
        if (c === '"' || c === "\\" || c === "/") out += "\\" + c;
        else if (c === "\t") out += "\\t";
        else if (c === "\b") out += "\\b";
        else if (c === "\n") out += "\\n";
        else if (c === "\r") out += "\\r";
        else if (c === "\f") out += "\\f";
        else if (code <= 0x1f) out += "\\u" + code.toString(16).padStart(4, "0");
        else out += c;
    }
    return out + '"';
};

const javaJsonValue = (value: unknown, depth: number): string => {
    if (value === null) return "null";
    if (typeof value === "boolean") return String(value);
    if (typeof value === "number") {
        if (!Number.isInteger(value)) throw new Error("nombre non entier : mise en forme non reproduite");
        return String(value);
    }
    if (typeof value === "string") return javaJsonString(value);
    const pad = (n: number) => "  ".repeat(n);
    if (Array.isArray(value)) {
        if (value.length === 0) return "[]";
        const items = value.map((item) => pad(depth + 1) + javaJsonValue(item, depth + 1));
        return "[\n" + items.join(",\n") + "\n" + pad(depth) + "]";
    }
    // Object.keys suit l'ordre de JSON.stringify : clés entières d'abord, puis
    // l'insertion ; JSON.stringify écarte les valeurs `undefined`.
    const keys = Object.keys(value as object).filter((key) => (value as any)[key] !== undefined);
    if (keys.length === 0) return "{}";
    const members = keys.map(
        (key) => pad(depth + 1) + javaJsonString(key) + ": " + javaJsonValue((value as any)[key], depth + 1)
    );
    return "{\n" + members.join(",\n") + "\n" + pad(depth) + "}";
};

/** Le texte que l'app Android écrit dans `.neo-calendar.json` : la moitié
 *  partagée (`sharedWorkspacePreferences`, seule envoyée à
 *  `save_desktop_preferences`), mise en forme par `toString(2)`, plus `\n`. */
const preferencesFileText = (preferences: unknown): string =>
    javaJsonValue(sharedWorkspacePreferences(parseDesktopWorkspacePreferences(preferences)), 0) + "\n";

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

/** Un cache réduit à un évènement : il enregistre les écritures que le geste demande. */
const recordingCache = (event: NeoEvent) => {
    const updates: { id: string; event: unknown }[] = [];
    return {
        updates,
        cache: {
            getEventById: () => event,
            getInfoForEditableEvent: () => ({ calendar: { id: "cal" } }),
            updateEventWithId: async (id: string, updated: unknown) => {
                updates.push({ id, event: updated });
                return true;
            },
            addEvent: async () => "new-id",
            processEvent: async () => true,
        },
    };
};

/** Une note lue sur le disque : ses champs, plus son évènement brut à valider. */
const storedOf = (raw: any): DesktopStoredEvent => ({ ...raw, event: validated(raw.event) });

const writeJson = (write: IcalNoteWrite) => write;

/** Relie chaque opération du corpus au code TypeScript qui fait foi.
 *  Le corpus nomme des opérations, pas des fonctions : renommer une
 *  fonction ne touche qu'ici. */
export const OPERATIONS: Record<string, (input: any) => unknown | Promise<unknown>> = {
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
    "preferences.write": ({ preferences }) => ({ text: preferencesFileText(preferences) }),
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
    "recurrence.dayCode": ({ date }) => dayCodeOf(date),
    "recurrence.default": ({ startDate }) => defaultRecurrence(startDate),
    "recurrence.toRRule": ({ state, startDate }) => recurrenceToRRule(state, startDate),
    "recurrence.fromRRule": ({ rrule, startDate }) => rruleToRecurrence(rrule, startDate),
    "recurrence.eventState": ({ event, startDate }) => eventToRecurrenceState(event as NeoEvent, startDate),
    "recurrence.fields": ({ state, startDate }) => recurrenceToEventFields(state, startDate),
    "recurrence.preset": ({ key, startDate }) => presetToRecurrence(key, startDate),
    "recurrence.matchPreset": ({ state, startDate }) => matchPreset(state, startDate),
    "recurrence.summary": ({ state }) => recurrenceSummary(state),
    "recurringEdit.occurrenceDate": ({ displayId }) => occurrenceDateOf(displayId),
    "recurringEdit.needsScopeChoice": ({ event, eventId, isDraft }) =>
        needsScopeChoice({ event: event as NeoEvent | null, eventId, isDraft }),
    "recurringEdit.detach": ({ payload, dateISO, done, now }) =>
        detachedOccurrence({ payload: payload as NeoEvent, dateISO, done, now: () => now }),
    "recurringEdit.withoutOccurrence": ({ series, dateISO }) => seriesWithoutOccurrence(series as NeoEvent, dateISO),
    "recurringEdit.occurrenceIsDone": ({ series, dateISO }) => occurrenceIsDone(series as NeoEvent, dateISO),
    "recurringEdit.removeOccurrence": ({ event, dateISO }) => withOccurrenceRemoved(validated(event), dateISO),
    "recurringEdit.removeFollowing": ({ event, dateISO }) => withFollowingRemoved(validated(event), dateISO),
    "recurringEdit.seriesStart": ({ event }) => seriesStartDate(validated(event)),
    "recurringEdit.changes": ({ stable, payload, context }) =>
        recurringEditChanges(stable as NeoEvent, payload as NeoEvent, context ?? {}),
    "notes.mergeForSave": ({ base, payload }) => mergeForSave(validated(base), payload as NeoEvent),
    "reminders.splitDelay": ({ minutes }) => splitReminderDelay(minutes),
    "reminders.minutesFrom": ({ amount, unit }) => reminderMinutesFrom(amount, unit),
    "reminders.listLabel": ({ minutes }) => reminderListLabel(minutes),
    "panel.duration": ({ start, end, dayGap }) => computeDuration(start, end, dayGap),
    "panel.daysBetween": ({ start, end }) => daysBetween(start, end),
    "panel.endDate": ({ date, endDate, allDay, startTime, endTime }) => panelEndDate(date, endDate, allDay, startTime, endTime),
    "description.attachmentPath": ({ eventRelativePath, target }) => attachmentPathFor(eventRelativePath, target),
    "reminders.choiceLabel": ({ minutes, allDay }) => reminderLabelParts(minutes, allDay),
    "location.destination": ({ location, geo, linkAddress }) => locationDestinationFor(location, geo, linkAddress),
    "location.apps": ({ destination, native, installed }) => mapsAppsFor(destination, { native, installed }),
    "location.mapsUrl": ({ destination, app, travelMode, native }) => mapsUrlFor(destination, app, { travelMode, native }),
    "location.geoUrl": ({ destination }) => geoUrlFor(destination),
    "description.checklist": ({ description }) => readChecklist(description),
    "description.toggle": ({ description, index }) => toggleLine(description, index),
    "description.links": ({ text }) => readInlineLinks(text),
    "reminders.build": ({ events, now, minutesBefore, minutesByCalendar, timeFormat24h }) =>
        buildReminders({
            events: (events as any[]).flatMap(expandEntry),
            now: new Date(now),
            minutesBefore,
            minutesByCalendar,
            timeFormat24h,
        }),
    "reminders.prayer": ({ timetable, minutes, now, timeFormat24h }) =>
        prayerRemindersFor({ timetable, minutes, now: new Date(now), timeFormat24h }),
    "reminders.delayLabel": ({ minutes }) => relativeDelayLabel(minutes),
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
    // Gestes de la grille : positions d'appui, jours déplacés, écriture d'un déplacement ou d'un redimensionnement.
    "grid.positionToDate": ({ y, date, hourHeight, snap }) =>
        positionToDate(y, new Date(date), snap ?? 15, hourHeight),
    "grid.dayShift": ({ anchor, current }) =>
        dayShiftFromAnchor(
            { date: new Date(anchor.date), fraction: anchor.fraction },
            { date: new Date(current.date), fraction: current.fraction }
        ),
    "grid.projectMove": ({ start, end, deltaY, dayShift, hourHeight }) => {
        setHourHeight(hourHeight);
        const slot = projectGridDrag(
            { daysRowTop: null, allDayBand: null, columns: [], viewport: null, panel: null },
            { start: new Date(start), end: new Date(end), allDay: false },
            { x: 0, y: deltaY },
            null,
            null,
            { dayShift }
        );
        return slot;
    },
    "grid.dragSingle": async ({ event, eventId, start, end }) => {
        const { cache, updates } = recordingCache(validated(event));
        const ok = await applyEventDrag(cache, eventId, new Date(start), new Date(end));
        return { ok, updates };
    },
    "grid.resizeSingle": async ({ event, eventId, start, end }) => {
        const { cache, updates } = recordingCache(validated(event));
        const ok = await applyEventResize(cache, eventId, new Date(start), new Date(end));
        return { ok, updates };
    },
    "tasks.setOccurrenceStatus": ({ event, day, complete }) =>
        setOccurrenceStatus(validated(event), day, complete ? "complete" : "todo"),
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
    "ics.syncWindow": ({ now }) => icsSyncWindow(new Date(now)),
    "ics.dueFeeds": ({ feeds, states, now, defaultMinutes, forcedIds }) =>
        dueIcsFeeds(feeds, states, new Date(now), defaultMinutes, forcedIds ? new Set<string>(forcedIds) : undefined).map(
            (feed) => feed.id
        ),
    "ics.mergeRemote": ({ current, refreshedCalendarIds, arrived }) =>
        mergeRemoteEvents(current, refreshedCalendarIds, arrived),
};
