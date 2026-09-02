import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import CalendarLayout from "../../../src/ui/calendar/CalendarLayout";
import CommandPalette from "../../../src/ui/calendar/CommandPalette";
import { invoke } from "@tauri-apps/api/core";
import { buildWidgetPayload, readWidgetTheme } from "./platform/androidWidget";
import {
    buildReminders,
    REMINDER_HORIZON_DAYS,
} from "./platform/androidReminders";
import { createReminderScheduler } from "./platform/desktopReminderScheduler";
import {
    ensureNotificationPermission,
    postReminder,
} from "./platform/desktopNotifications";
import ContextMenu, {
    ContextMenuItem,
} from "../../../src/ui/calendar/ContextMenu";
import EventPanel, {
    type EventLinkedItem,
    type EventLinkTarget,
} from "../../../src/ui/calendar/EventPanel";
import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { open } from "@tauri-apps/plugin-dialog";
import { createUnscheduledPanelEvent } from "../../../src/ui/calendar/CalendarEventsPanel.helpers";
import {
    collectTasks,
    todayISO,
    TaskSource,
} from "../../../src/ui/tasks/taskList";
import { hasTaskCompletionDate } from "../../../src/ui/tasks/desktopTaskGroups";
import {
    findMisfiledEvents,
    asPlainEvent,
} from "../../../src/ui/tasks/misfiledEvents";
import {
    isTask,
    isSeries,
    parseOccurrenceId,
    setOccurrenceStatus,
} from "../../../src/ui/tasks";
import {
    addDays,
    getEventTop,
    getWeekStart,
    neoEventToDisplayEvents,
    startOfDay,
} from "../../../src/ui/calendar/CalendarUtils";
import {
    needsOccurrenceChoice,
    withFollowingRemoved,
    withOccurrenceRemoved,
} from "../../../src/ui/calendar/recurrenceDeletion";
import { countedLabel } from "../../../src/ui/calendar/countedLabel";
import { attachmentPathFor } from "../../../src/ui/calendar/pastedAttachment";
import { escapeClosesEventsPanel } from "../../../src/ui/calendar/escapeClosing";
import { useCalendarNavigation } from "../../../src/ui/calendar/useCalendarNavigation";
import { useEventDragResize } from "../../../src/ui/calendar/useEventDragResize";
import {
    eventToPaste,
    cutMayDeleteSource,
} from "../../../src/ui/calendar/useClipboardActions";
import type {
    DragPreview,
    PrayerLine,
} from "../../../src/ui/calendar/TimeGrid.types";
import { prayerLinesFor } from "../../../src/ui/calendar/prayerTimes";
import { prayerTimetableById } from "../../../src/ui/calendar/prayerTimetables";
import type { PanelDropTarget } from "../../../src/ui/calendar/usePanelDrag";
import {
    CopyIcon,
    DuplicateIcon,
    FileTextIcon,
    ScissorsIcon,
    TrashIcon,
} from "../../../src/ui/calendar/Icons";
import { NeoEvent, validateEvent } from "../../../src/types";
import { CalendarSource, DisplayEvent, ViewType } from "../../../src/ui/types";
import { t } from "../../../src/ui/i18n";
import DesktopSettings from "./DesktopSettings";
import AddCalendarDialog, {
    type AddCalendarRequest,
} from "./AddCalendarDialog";
import ConfirmDialog from "./ConfirmDialog";
import IcsFeedsPanel from "./IcsFeedsPanel";
import PrayerMosqueDialog from "./PrayerMosqueDialog";
import type { IcsFeedSubscription } from "./platform/icsFeedPreferences";
import RecurringDeleteDialog from "./RecurringDeleteDialog";
import {
    copyDesktopAttachment,
    copyDesktopPath,
    writeDesktopAttachment,
    readDesktopAttachment,
    createDesktopCalendarFolder,
    deleteDesktopCalendarFolder,
    deleteDesktopEventFile,
    ensureDesktopIcsFolder,
    fetchDesktopIcs,
    fetchDesktopPage,
    resolveDesktopUrl,
    loadDesktopWorkspace,
    openDesktopExternalTarget,
    openDesktopLinkedPath,
    openDesktopPath,
    writeDesktopClipboardText,
    searchDesktopVaultNotes,
    renameDesktopCalendarFolder,
    saveDesktopPreferences,
    writeDesktopEventFile,
} from "./platform/desktopCalendarStore";
import { shouldReloadOnWake } from "./platform/workspaceRefresh";
import {
    loadDeviceWorkspacePreferences,
    saveDeviceWorkspacePreferences,
    loadIcsRuntimeState,
    saveIcsRuntimeState,
} from "./platform/tauriSettingsStore";
import type { DesktopDetectedVaultDto } from "./platform/desktopCalendarStore";
import {
    DesktopCacheController,
    DesktopCalendarModel,
    DesktopEventCacheFacade,
} from "./platform/DesktopEventCache";
import {
    appendMarkdownToEventBody,
    calendarIdFromPath,
    DesktopStoredEvent,
    extractEventBodyLinks,
    filenameForEvent,
    findStoredEvent,
    markdownLinkForAttachment,
    markdownLinkForVaultNote,
    parseStoredEvent,
    recordOwnership,
    removeMarkdownTargetFromEventBody,
    renameMarkdownTargetInEventBody,
    serializeEventMarkdown,
} from "./platform/desktopEventFormat";
import { ThemeId } from "./themes/types";
import {
    buildAutoCalendarEvents,
    externalCalendarId,
    externalCalendarPreferenceKey,
    type DesktopExternalCalendarSource,
} from "./platform/desktopExternalCalendars";
import {
    hasIcalDirectory,
    planIcalDirectoryAssignments,
} from "./platform/icalNoteSync";
import { syncIcsFeeds } from "./platform/icsCalendarIntegration";
import { SyncingFeedsContext } from "../../../src/ui/calendar/SyncingFeeds";
import {
    dueIcsFeeds,
    type IcsRuntimeStateByFeed,
} from "./platform/icsSyncScheduler";
import {
    defaultDesktopWorkspacePreferences,
    parseDesktopWorkspacePreferences,
    reconcileWorkspacePreferences,
    sharedWorkspacePreferences,
    deviceWorkspacePreferences,
    withDeviceWorkspacePreferences,
    type DeviceWorkspacePreferences,
    type DesktopWorkspacePreferences,
} from "./platform/desktopWorkspacePreferences";
import { createWorkspacePreferenceWriter } from "./platform/workspacePreferenceWriter";
import "./DesktopCalendar.css";

export interface DesktopCalendarProps {
    dataFolder: string;
    onChangeDataFolder: () => Promise<void>;
    linkedVaults: string[];
    vaultFolders: string[];
    detectedVaults: DesktopDetectedVaultDto[];
    disabledVaults: string[];
    onAddVaultFolder: () => Promise<void>;
    onRemoveVaultFolder: (folderPath: string) => Promise<void>;
    onSetVaultEnabled: (vaultPath: string, enabled: boolean) => Promise<void>;
    isChoosingVaultFolder: boolean;
    isScanningVaults: boolean;
    themeId: ThemeId;
    onThemeChange: (themeId: ThemeId) => Promise<void>;
    /** Fired once the folder has been read, so the shell can reveal the
        calendar only when it has something to show. */
    onReady?: () => void;
}

interface DraftSlot {
    start: Date;
    end: Date;
    allDay: boolean;
    calendarId: string;
}

interface EventContextState {
    type: "event";
    eventId: string;
    x: number;
    y: number;
}

interface EmptyContextState {
    type: "empty";
    date: Date;
    x: number;
    y: number;
}

type ContextState = EventContextState | EmptyContextState;

interface ClipboardState {
    event: NeoEvent;
    mode: "copy" | "cut";
    sourceEventId: string;
    sourceCalendarId: string;
}

interface MarqueeState {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
}

const COLOR_PALETTE = [
    "#89b4fa",
    "#a6e3a1",
    "#f9e2af",
    "#f38ba8",
    "#cba6f7",
    "#94e2d5",
    "#fab387",
    "#74c7ec",
    "#b4befe",
    "#eba0ac",
];

interface DesktopEventRoute {
    relativePath: string;
    occurrenceDate: string | null;
}

function normalizeDesktopEventPath(value: string): string {
    return value.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+/g, "/");
}

function parseDesktopEventRoute(url: string): DesktopEventRoute | null {
    try {
        const parsed = new URL(url);

        if (
            parsed.protocol !== "neo-calendar:" ||
            parsed.hostname !== "event"
        ) {
            return null;
        }

        const encodedPath = parsed.pathname.replace(/^\/+/, "");
        if (!encodedPath) return null;

        const relativePath = normalizeDesktopEventPath(
            decodeURIComponent(encodedPath)
        );

        if (
            !relativePath ||
            relativePath.length > 2048 ||
            /[\u0000-\u001f\u007f]/.test(relativePath) ||
            relativePath
                .split("/")
                .some(
                    (segment) =>
                        segment.length === 0 ||
                        segment === "." ||
                        segment === ".."
                )
        ) {
            return null;
        }

        const dateValue = parsed.searchParams.get("date");
        const occurrenceDate =
            dateValue && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)
                ? dateValue
                : null;

        return {
            relativePath,
            occurrenceDate,
        };
    } catch {
        return null;
    }
}

function pad(value: number): string {
    return String(value).padStart(2, "0");
}

function formatLocalDate(date: Date): string {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
        date.getDate()
    )}`;
}

function parseLocalDate(value: string): Date {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day, 0, 0, 0, 0);
}

function stableColor(path: string, index: number): string {
    let hash = 0;
    for (let i = 0; i < path.length; i += 1) {
        hash = (hash * 31 + path.charCodeAt(i)) | 0;
    }
    return COLOR_PALETTE[Math.abs(hash + index) % COLOR_PALETTE.length];
}

function errorMessage(reason: unknown): string {
    if (reason instanceof Error) return reason.message;
    return String(reason);
}

function fileNameFromRelativePath(path: string): string {
    return path.split(/[\\/]/).pop() || "event.md";
}

function folderName(path: string): string {
    const normalized = path.replace(/[\\/]+$/, "");
    return normalized.split(/[\\/]/).pop() || path;
}

function internalEventId(): string {
    return (
        globalThis.crypto?.randomUUID?.() ??
        `desktop-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );
}

function eventRecordForDisplay(
    record: DesktopStoredEvent,
    calendar: DesktopCalendarModel
): DisplayEvent {
    const now = new Date();
    const completed =
        record.event.type === "someday"
            ? record.event.completed ?? false
            : false;
    return {
        id: record.id,
        title: record.event.title,
        start: now,
        end: now,
        allDay: true,
        color: calendar.color,
        editable: calendar.editable && !record.readOnly,
        calendarId: calendar.id,
        calendarName: calendar.name,
        icsFeedId: record.icsFeedId,
        isTask:
            record.event.type === "someday" &&
            record.event.completed !== undefined &&
            record.event.completed !== null,
        taskCompleted: completed,
        taskStatus: completed ? "complete" : "todo",
        isRecurring: false,
        isMultiDay: false,
        description: record.event.description,
        isSomeday: true,
    };
}

function externalEventRecord(
    source: DesktopExternalCalendarSource,
    event: NeoEvent,
    index: number
): DesktopStoredEvent {
    const calendarId = externalCalendarId(source);
    const sourceEventId =
        typeof event.id === "string" && event.id.trim()
            ? event.id
            : `event-${index}`;
    // Prefix remote event ids with their calendar id. Different feeds often
    // reuse the same UID, so the feed must be part of the desktop cache key.
    const eventId = `${calendarId}::${sourceEventId}`;
    return {
        id: eventId,
        calendarId,
        calendarPath: calendarId,
        relativePath: `@external/${encodeURIComponent(
            calendarId
        )}/${encodeURIComponent(sourceEventId)}`,
        fileName: `${encodeURIComponent(sourceEventId)}.ics`,
        contents: "",
        event: { ...event, id: eventId },
        readOnly: true,
    };
}

function hasPhysicalEventNote(record: DesktopStoredEvent): boolean {
    return (
        !record.relativePath.startsWith("@external/") &&
        /\.md$/i.test(record.relativePath)
    );
}

function anchorForEvent(eventId: string): DOMRect | null {
    const escaped =
        typeof CSS !== "undefined" && CSS.escape
            ? CSS.escape(eventId)
            : eventId.replace(/["\\]/g, "\\$&");
    return (
        document
            .querySelector(`[data-event-id="${escaped}"]`)
            ?.getBoundingClientRect() ?? null
    );
}

const ANDROID_VIEW_STORAGE_KEY =
    "neo-calendar.android.view.single-day-compatible-v1";
const ANDROID_DAY_COUNT_STORAGE_KEY =
    "neo-calendar.android.day-count.single-day-compatible-v1";

function isAndroidRuntime(): boolean {
    if (typeof window === "undefined") return false;
    const androidWindow = window as Window & { NeoAndroid?: unknown };
    return (
        Boolean(androidWindow.NeoAndroid) ||
        document.documentElement.classList.contains("nc-platform-android") ||
        document.body?.classList.contains("nc-platform-android") === true ||
        document.documentElement.dataset.neoCalendarPlatform === "android"
    );
}

/**
 * Le meme tableau, avec un enregistrement remplace par sa nouvelle version.
 */
export function replaceRecord(
    records: DesktopStoredEvent[],
    id: string,
    next: DesktopStoredEvent
): DesktopStoredEvent[] {
    return records.map((record) => (record.id === id ? next : record));
}

/**
 * Remettre l'ancien enregistrement apres une ecriture ratee — mais seulement
 * si c'est bien celui qu'on avait montre qui est encore la.
 *
 * Deux appuis coup sur coup ecrivent l'un apres l'autre : l'echec du premier
 * ne doit pas effacer ce que le second a deja pose, ni ressusciter une note
 * supprimee entre-temps.
 */
export function revertRecord(
    records: DesktopStoredEvent[],
    shown: DesktopStoredEvent,
    previous: DesktopStoredEvent
): DesktopStoredEvent[] {
    return records.some((record) => record === shown)
        ? records.map((record) => (record === shown ? previous : record))
        : records;
}

export function canPersistDesktopTaskCompletion(
    event: NeoEvent,
    done: boolean,
    isAndroid = isAndroidRuntime()
): boolean {
    if (
        done &&
        !isAndroid &&
        !hasTaskCompletionDate(
            event.type === "single" ? event.date : null,
            (event as { due?: string | null }).due
        )
    ) {
        return false;
    }
    return true;
}

function readAndroidView(): ViewType {
    try {
        const saved = window.localStorage.getItem(ANDROID_VIEW_STORAGE_KEY);
        if (
            saved === "day" ||
            saved === "week" ||
            saved === "month" ||
            saved === "list" ||
            saved === "3days" ||
            saved === "days"
        ) {
            return saved;
        }
    } catch {
        // A restricted WebView may temporarily deny localStorage.
    }
    return "days";
}

function readAndroidDayCount(): number {
    try {
        const saved = Number(
            window.localStorage.getItem(ANDROID_DAY_COUNT_STORAGE_KEY)
        );
        if (Number.isFinite(saved) && saved >= 1 && saved <= 60) {
            return Math.round(saved);
        }
    } catch {
        // A restricted WebView may temporarily deny localStorage.
    }
    return 2;
}

function saveAndroidNavigation(viewType: ViewType, dayCount: number): void {
    try {
        window.localStorage.setItem(ANDROID_VIEW_STORAGE_KEY, viewType);
        window.localStorage.setItem(
            ANDROID_DAY_COUNT_STORAGE_KEY,
            String(Math.max(1, Math.min(60, Math.round(dayCount))))
        );
    } catch {
        // Navigation still works for the current session without persistence.
    }
}

export default function DesktopCalendar({
    dataFolder,
    onChangeDataFolder,
    linkedVaults,
    vaultFolders,
    detectedVaults,
    disabledVaults,
    onAddVaultFolder,
    onRemoveVaultFolder,
    onSetVaultEnabled,
    isChoosingVaultFolder,
    isScanningVaults,
    themeId,
    onThemeChange,
    onReady,
}: DesktopCalendarProps) {
    const isAndroid = useMemo(isAndroidRuntime, []);
    const androidInitialView = useMemo(readAndroidView, []);
    const androidInitialDayCount = useMemo(readAndroidDayCount, []);

    const [preferences, setPreferences] = useState<DesktopWorkspacePreferences>(
        defaultDesktopWorkspacePreferences
    );
    const {
        currentDate,
        setCurrentDate,
        viewType,
        setViewType,
        dayCount,
        setDaysCount,
        goToday,
        alignToday,
        goPrev,
        goNext,
        shiftDays,
        shiftMonths,
        goToDateInView,
    } = useCalendarNavigation(
        isAndroid ? androidInitialView : preferences.initialView.desktop,
        preferences.firstDay,
        // Starting on the stored span avoids a visible 3-day flash on Android.
        isAndroid ? androidInitialDayCount : preferences.dayCount
    );

    const [calendars, setCalendars] = useState<DesktopCalendarModel[]>([]);
    const [storedEvents, setStoredEvents] = useState<DesktopStoredEvent[]>([]);
    const [defaultCalendarId, setDefaultCalendarIdState] = useState("");
    const [hiddenCalendars, setHiddenCalendars] = useState<Set<string>>(
        new Set()
    );
    const [soloCalendarId, setSoloCalendarId] = useState<string | null>(null);
    const hiddenBeforeSolo = useRef<Set<string>>(new Set());
    const [selectedCalendarId, setSelectedCalendarId] = useState<string | null>(
        null
    );
    // On Android the sidebar is a drawer: it must stay closed until tapped,
    // and its state never travels through the shared preference file.
    const [sidebarVisible, setSidebarVisible] = useState(!isAndroid);
    const [showWeekNumbers, setShowWeekNumbers] = useState(false);
    const [allDayCollapsed, setAllDayCollapsed] = useState(false);
    const [secondaryTimezones, setSecondaryTimezones] = useState<string[]>([]);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [addCalendarOpen, setAddCalendarOpen] = useState(false);
    const [calendarToDelete, setCalendarToDelete] = useState<string | null>(
        null
    );
    // The occurrence a delete is waiting on an answer for, if any.
    const [recurringDeleteId, setRecurringDeleteId] = useState<string | null>(
        null
    );
    const [panelEventId, setPanelEventId] = useState<string | null>(null);

    /* Ou mene le lieu des evenements du lien ouvert, quand une adresse y a ete
       reglee. Un emploi du temps nomme des salles et publie au mieux un point
       unique pour toutes : c'est cette adresse-la qui sait le campus. */
    const panelLinkAddress = useMemo(() => {
        if (!panelEventId) return undefined;
        const record = findStoredEvent(storedEvents, panelEventId);
        if (!record?.icsFeedId) return undefined;
        return preferences.icsFeeds.find(
            (feed) => feed.id === record.icsFeedId
        )?.address;
    }, [panelEventId, preferences.icsFeeds, storedEvents]);
    const [panelAnchor, setPanelAnchor] = useState<DOMRect | null>(null);
    const [draftSlot, setDraftSlot] = useState<DraftSlot | null>(null);
    const [committingDraft, setCommittingDraft] = useState(false);
    const [commandPaletteVisible, setCommandPaletteVisible] = useState(false);
    const [contextMenu, setContextMenu] = useState<ContextState | null>(null);
    const [contextLine, setContextLine] = useState<{
        date: Date;
        top: number;
    } | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [marquee, setMarquee] = useState<MarqueeState | null>(null);
    const [clipboard, setClipboard] = useState<ClipboardState | null>(null);
    const [deletedBatch, setDeletedBatch] = useState<DesktopStoredEvent[]>([]);
    const [panelPreview, setPanelPreview] = useState<DragPreview | null>(null);
    const [, setIsSaving] = useState(false);
    const [storageError, setStorageError] = useState<string | null>(null);
    const [prayerDialogCalendarId, setPrayerDialogCalendarId] = useState<
        string | null
    >(null);
    const [icsFeedsPanelCalendarId, setIcsFeedsPanelCalendarId] = useState<
        string | null
    >(null);
    const [icsRuntimeStates, setIcsRuntimeStates] =
        useState<IcsRuntimeStateByFeed>({});
    const [syncingIcsFeedIds, setSyncingIcsFeedIds] = useState<Set<string>>(
        new Set()
    );

    const calendarRootRef = useRef<HTMLElement>(null);
    const calendarsRef = useRef(calendars);
    const reminderSchedulerRef = useRef<ReturnType<
        typeof createReminderScheduler
    > | null>(null);
    const recordsRef = useRef(storedEvents);
    const pendingEventRouteRef = useRef<DesktopEventRoute | null>(null);
    const didApplyInitialViewRef = useRef(false);
    useEffect(() => {
        calendarsRef.current = calendars;
    }, [calendars]);
    useEffect(() => {
        recordsRef.current = storedEvents;
    }, [storedEvents]);

    // The grid's own pointerdown handlers call `preventDefault()` (needed to
    // stop text selection while dragging) — which, as a side effect, also
    // suppresses the browser's default "clicking elsewhere blurs the
    // previously focused control" behaviour. A button clicked earlier (the
    // Tasks summary pills, say) stayed the document's active element even
    // after a click on plain grid background — invisible, since a
    // mouse-originated focus doesn't show its ring — until any keypress
    // (Shift included) flipped `:focus-visible` back on for it, popping a
    // stray blue outline onto a button nobody meant to still be focused.
    // Blurring explicitly on every non-form pointerdown makes "click
    // elsewhere" actually mean elsewhere, regardless of what any other
    // handler further down does with the event.
    useEffect(() => {
        const onPointerDown = (event: PointerEvent) => {
            const active = document.activeElement;
            if (!(active instanceof HTMLElement) || active === document.body) {
                return;
            }
            if (active.matches('input, textarea, select, [contenteditable="true"]')) {
                return;
            }
            const target = event.target as Node | null;
            if (target && active.contains(target)) return;
            active.blur();
        };
        document.addEventListener("pointerdown", onPointerDown, true);
        return () =>
            document.removeEventListener("pointerdown", onPointerDown, true);
    }, []);

    const revealDesktopEventRoute = useCallback(
        (
            route: DesktopEventRoute,
            records: readonly DesktopStoredEvent[] = recordsRef.current
        ): boolean => {
            const requestedPath = normalizeDesktopEventPath(route.relativePath);
            const record = records.find(
                (candidate) =>
                    !candidate.readOnly &&
                    normalizeDesktopEventPath(candidate.relativePath) ===
                        requestedPath
            );

            if (!record) return false;

            const preferredDate =
                route.occurrenceDate ??
                (record.event.type === "single" ? record.event.date : null);

            if (preferredDate && /^\d{4}-\d{2}-\d{2}$/.test(preferredDate)) {
                setCurrentDate(parseLocalDate(preferredDate));
            }

            pendingEventRouteRef.current = null;
            setSelectedIds(new Set());
            setDraftSlot(null);
            setPanelEventId(record.id);
            setPanelAnchor(null);
            setSettingsOpen(false);
            setAddCalendarOpen(false);
            return true;
        },
        [setCurrentDate]
    );

    // Read once at startup and kept in a ref rather than in state: it is only
    // ever consulted while loading or saving, and a re-render for it would be
    // wasted work.
    const deviceWorkspaceRef = useRef<DeviceWorkspacePreferences>({});

    useEffect(() => {
        let cancelled = false;
        loadDeviceWorkspacePreferences()
            .then((stored) => {
                if (!cancelled) deviceWorkspaceRef.current = stored;
            })
            .catch(() => {
                // A device that cannot recall its own last view simply opens on
                // the shared default; nothing worth surfacing.
            });
        return () => {
            cancelled = true;
        };
    }, []);

    // Per-feed sync bookkeeping is local to this device (see
    // tauriSettingsStore's ICS_RUNTIME_STATE_KEY). Kept in a ref alongside the
    // state so a sync cycle always reads the latest values without needing to
    // be re-created on every render.
    const icsRuntimeStatesRef = useRef<IcsRuntimeStateByFeed>({});
    // `dueIcsFeeds` only learns a sync happened once `icsRuntimeStatesRef` is
    // written back, which is after the network round-trip. An overlapping
    // call started meanwhile — another wake, the minute timer, a manual
    // "refresh now" — would still read the pre-sync state, see the feed as
    // due, and run its own independent fetch-and-write cycle against the same
    // pre-sync `recordsRef` snapshot: neither cycle can see the other's
    // notes, so both create one, and the file writer resolves the name
    // collision with " (n)" instead of catching a duplicate. This set is the
    // guard `dueIcsFeeds` itself can't provide: a feed already mid-cycle is
    // withheld from every subsequent call until that cycle settles.
    const icsSyncInFlightRef = useRef<Set<string>>(new Set());

    // `reloadWorkspace` ends by writing freshly parsed preferences, and
    // `parseIcsFeeds` hands back a new array every time — so any callback that
    // took `preferences.icsFeeds` as a dependency was rebuilt by the very
    // reload it took part in. `reloadWorkspace` depended on one such callback
    // and was itself run from an effect keyed on its identity: each reload
    // scheduled the next, forever. The links are read through a ref instead,
    // so a sync cycle always sees the current ones without tying any identity
    // to them.
    const icsFeedsRef = useRef(preferences.icsFeeds);
    const icsRefreshMinutesRef = useRef(preferences.icsDefaultRefreshMinutes);
    icsFeedsRef.current = preferences.icsFeeds;
    icsRefreshMinutesRef.current = preferences.icsDefaultRefreshMinutes;

    // A sync cycle that just provisioned a link's folder persists it through
    // this ref for the same reason as the two above: `updateWorkspacePreferences`
    // is declared much further down (it closes over `preferences`), so taking
    // it as a dependency here would tie `refreshIcsFeeds` right back into the
    // reload cycle it was just pulled out of.
    const updatePreferencesRef = useRef<
        (patch: Partial<DesktopWorkspacePreferences>) => Promise<void>
    >(async () => {});

    // Same reason, for the two callbacks `reloadWorkspace` and the deep-link
    // listener call back into: `revealDesktopEventRoute` follows the current
    // view, so keying an effect on it re-registered the Tauri URL listener on
    // every view switch.
    const revealRouteRef = useRef(revealDesktopEventRoute);
    revealRouteRef.current = revealDesktopEventRoute;

    const hasIcsFeeds = preferences.icsFeeds.length > 0;

    useEffect(() => {
        let cancelled = false;
        loadIcsRuntimeState()
            .then((stored) => {
                if (cancelled) return;
                icsRuntimeStatesRef.current = stored;
                setIcsRuntimeStates(stored);
            })
            .catch(() => {
                // No local sync history yet — every feed starts as due.
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const preferenceWriter = useMemo(
        () =>
            createWorkspacePreferenceWriter(
                defaultDesktopWorkspacePreferences(),
                async (value: DesktopWorkspacePreferences) => {
                    // Two destinations: what the calendar owns goes to the
                    // synced file, what this machine owns stays here. Switching
                    // view no longer rewrites the colours, so there is nothing
                    // left for the two devices to disagree about.
                    deviceWorkspaceRef.current =
                        deviceWorkspacePreferences(value);
                    await Promise.all([
                        saveDesktopPreferences(
                            dataFolder,
                            sharedWorkspacePreferences(value)
                        ),
                        saveDeviceWorkspacePreferences(
                            deviceWorkspaceRef.current
                        ),
                    ]);
                }
            ),
        [dataFolder]
    );

    const persistPreferences = useCallback(
        async (
            mutate: (
                current: DesktopWorkspacePreferences
            ) => DesktopWorkspacePreferences
        ) => {
            try {
                setPreferences(await preferenceWriter.mutate(mutate));
            } catch (reason) {
                setPreferences(preferenceWriter.current());
                setStorageError(errorMessage(reason));
            }
        },
        [preferenceWriter]
    );

    /**
     * Run one ICS sync cycle over whichever links are due (or exactly the
     * forced ones), through the pure `syncIcsFeeds` orchestration: fetch,
     * parse, plan, write, guarded-delete, then fold the result back into the
     * records and the local per-feed sync state. Never awaited by its
     * startup caller — disk-backed notes must render before network
     * completes — but every other caller (focus, the wake timer, a manual
     * "refresh now") awaits it so its own follow-up work sees the outcome.
     */
    const refreshIcsFeeds = useCallback(
        async ({ forcedIds }: { forcedIds?: ReadonlySet<string> } = {}) => {
            const feeds = icsFeedsRef.current;
            if (feeds.length === 0) return;

            const now = new Date();
            const due = dueIcsFeeds(
                feeds,
                icsRuntimeStatesRef.current,
                now,
                icsRefreshMinutesRef.current,
                forcedIds
            ).filter((feed) => !icsSyncInFlightRef.current.has(feed.id));
            if (due.length === 0) return;

            for (const item of due) icsSyncInFlightRef.current.add(item.id);
            setSyncingIcsFeedIds((current) => {
                const next = new Set(current);
                for (const item of due) next.add(item.id);
                return next;
            });

            // `due` is already the exact set to run — forcing it rather than
            // handing `syncIcsFeeds` the unfiltered `feeds`/`forcedIds` stops
            // its own internal `dueIcsFeeds` call from re-admitting a feed
            // this call just excluded as already in flight.
            const dueIds = new Set(due.map((feed) => feed.id));
            try {
                const result = await syncIcsFeeds({
                    feeds: due,
                    states: icsRuntimeStatesRef.current,
                    records: recordsRef.current,
                    now,
                    defaultMinutes: icsRefreshMinutesRef.current,
                    forcedIds: dueIds,
                    io: {
                        fetchIcs: fetchDesktopIcs,
                        writeEventFile: (write) =>
                            writeDesktopEventFile({
                                dataFolder,
                                calendarPath: write.calendarPath,
                                previousRelativePath:
                                    write.previousRelativePath,
                                fileName: write.fileName,
                                contents: write.contents,
                            }),
                        deleteEventFile: (relativePath) =>
                            deleteDesktopEventFile(dataFolder, relativePath),
                        ensureDirectory: (calendarPath, name) =>
                            ensureDesktopIcsFolder(
                                dataFolder,
                                calendarPath,
                                name
                            ),
                    },
                });

                recordsRef.current = result.records;
                setStoredEvents(result.records);
                icsRuntimeStatesRef.current = result.states;
                setIcsRuntimeStates(result.states);
                void saveIcsRuntimeState(result.states);

                const provisioned = Object.entries(
                    result.provisionedDirectories
                );
                if (provisioned.length > 0) {
                    const byId = new Map(provisioned);
                    const nextFeeds = icsFeedsRef.current.map((item) =>
                        byId.has(item.id)
                            ? { ...item, directory: byId.get(item.id) }
                            : item
                    );
                    icsFeedsRef.current = nextFeeds;
                    void updatePreferencesRef.current({
                        icsFeeds: nextFeeds,
                    });
                }
            } finally {
                for (const item of due) icsSyncInFlightRef.current.delete(item.id);
                setSyncingIcsFeedIds((current) => {
                    const next = new Set(current);
                    for (const item of due) next.delete(item.id);
                    return next;
                });
            }
        },
        [dataFolder]
    );

    const reloadWorkspace = useCallback(async () => {
        setStorageError(null);
        try {
            const snapshot = await loadDesktopWorkspace(dataFolder);
            const isFirstLoad = !preferenceWriter.isLoaded();
            // Adopting replays whatever the user changed while the folder was
            // still loading, so their action is kept without discarding the
            // stored colors, ordering and hidden calendars.
            //
            // What is read is reconciled with what is already known rather than
            // replacing it: the file sits in a synced folder, so it can arrive
            // missing colours another device has, or not arrive at all while it
            // is being replaced.
            let storedPreferences = await preferenceWriter.adopt(
                reconcileWorkspacePreferences({
                    previous: preferenceWriter.isLoaded()
                        ? preferenceWriter.current()
                        : null,
                    loaded: parseDesktopWorkspacePreferences(
                        snapshot.preferences
                    ),
                    fileExisted: snapshot.preferencesFound,
                })
            );
            const directoryPlan = planIcalDirectoryAssignments(
                storedPreferences.externalCalendars,
                snapshot.calendars.map((calendar) => calendar.relativePath)
            );
            for (const directory of directoryPlan.directoriesToCreate) {
                try {
                    await createDesktopCalendarFolder(dataFolder, directory);
                } catch (reason) {
                    // A sync tool or another instance may have created the
                    // assigned folder after the snapshot was read.
                    if (!/already exists/i.test(errorMessage(reason))) {
                        throw reason;
                    }
                }
            }
            if (directoryPlan.changed) {
                storedPreferences = await preferenceWriter.mutate(
                    (current) => ({
                        ...current,
                        externalCalendars: directoryPlan.sources,
                    })
                );
            }

            const nextPreferences = withDeviceWorkspacePreferences(
                storedPreferences,
                deviceWorkspaceRef.current
            );
            const orderIndex = new Map(
                nextPreferences.order.map((path, index) => [path, index])
            );

            const icalSourcesWithDirectories =
                nextPreferences.externalCalendars.filter(
                    (
                        source
                    ): source is Extract<
                        DesktopExternalCalendarSource,
                        { type: "ical" }
                    > & { directory: string } =>
                        source.type === "ical" && hasIcalDirectory(source)
                );
            const icalSourceByDirectory = new Map(
                icalSourcesWithDirectories.map((source) => [
                    source.directory.toLocaleLowerCase(),
                    source,
                ])
            );
            const localCalendars = snapshot.calendars
                .filter(
                    (calendar) =>
                        !icalSourceByDirectory.has(
                            calendar.relativePath.toLocaleLowerCase()
                        )
                )
                .map(
                    (calendar, index): DesktopCalendarModel => ({
                        id: calendarIdFromPath(calendar.relativePath),
                        relativePath: calendar.relativePath,
                        name: calendar.name,
                        color:
                            nextPreferences.colors[calendar.relativePath] ??
                            stableColor(calendar.relativePath, index),
                        editable: true,
                        type: "local",
                    })
                );
            const externalCalendars = nextPreferences.externalCalendars.map(
                (source, index): DesktopCalendarModel => {
                    const key = externalCalendarPreferenceKey(source);
                    return {
                        id: externalCalendarId(source),
                        relativePath: key,
                        name: source.name,
                        color:
                            nextPreferences.colors[key] ??
                            source.color ??
                            stableColor(key, localCalendars.length + index),
                        editable: false,
                        type: source.type,
                        icon: source.type === "auto" ? source.icon : undefined,
                    };
                }
            );
            const nextCalendars = [
                ...localCalendars,
                ...externalCalendars,
            ].sort((left, right) => {
                const leftOrder =
                    orderIndex.get(left.relativePath) ??
                    Number.MAX_SAFE_INTEGER;
                const rightOrder =
                    orderIndex.get(right.relativePath) ??
                    Number.MAX_SAFE_INTEGER;
                return leftOrder !== rightOrder
                    ? leftOrder - rightOrder
                    : left.name.localeCompare(right.name);
            });

            // The parser still validates a materialised feed note as a file in
            // its physical folder. Once parsed, route it back to the logical
            // read-only subscription id so the calendar identity stays stable.
            const knownPhysicalIds = new Set<string>([
                ...localCalendars.map((calendar) => calendar.id),
                ...icalSourcesWithDirectories.map((source) =>
                    calendarIdFromPath(source.directory)
                ),
            ]);
            const previousByPath = new Map(
                recordsRef.current
                    .filter(hasPhysicalEventNote)
                    .map((record) => [record.relativePath, record.id])
            );
            const localEvents = snapshot.eventFiles
                .map((file) => parseStoredEvent(file, knownPhysicalIds))
                .filter((event): event is DesktopStoredEvent => event !== null)
                .map((record) => {
                    const source = icalSourceByDirectory.get(
                        record.calendarPath.toLocaleLowerCase()
                    );
                    return recordOwnership(
                        {
                            ...record,
                            id:
                                previousByPath.get(record.relativePath) ??
                                record.id,
                        },
                        source ? externalCalendarId(source) : null
                    );
                });

            const automaticEvents = nextPreferences.externalCalendars
                .filter(
                    (
                        source
                    ): source is Extract<
                        DesktopExternalCalendarSource,
                        { type: "auto" }
                    > => source.type === "auto"
                )
                .flatMap((source) =>
                    buildAutoCalendarEvents(
                        source,
                        new Date().getFullYear()
                    ).map((event, index) =>
                        externalEventRecord(source, event, index)
                    )
                );

            /*
             * Ce qui est sur le disque suffit à dessiner le calendrier.
             *
             * Les abonnements distants étaient attendus ici, avant que quoi que
             * ce soit ne s'affiche — et la coque Android retient son écran de
             * démarrage jusqu'à ce que la page se dise prête. Un abonnement sur
             * une connexion lente pouvait donc coûter trente-cinq secondes de
             * lancement (quinze de connexion, vingt de lecture), alors que sans
             * réseau du tout la tentative échouait aussitôt et l'application
             * s'ouvrait sur-le-champ. Se lancer plus vite hors ligne qu'en
             * ligne est le signe qu'on attend quelque chose qu'on ne devrait
             * pas attendre.
             *
             * Les abonnements arrivent maintenant après coup et se fondent dans
             * ce qui est déjà à l'écran.
             */
            const nextEvents = [...localEvents, ...automaticEvents];

            const preferredDefault = localCalendars.find(
                (calendar) =>
                    calendar.relativePath ===
                    nextPreferences.defaultCalendarPath
            );
            const nextDefaultId =
                preferredDefault?.id ?? localCalendars[0]?.id ?? "";
            const nextHidden = new Set(
                nextCalendars
                    .filter((calendar) =>
                        nextPreferences.hiddenCalendarPaths.includes(
                            calendar.relativePath
                        )
                    )
                    .map((calendar) => calendar.id)
            );

            calendarsRef.current = nextCalendars;
            recordsRef.current = nextEvents;

            const pendingRoute = pendingEventRouteRef.current;
            if (pendingRoute) {
                revealRouteRef.current(pendingRoute, nextEvents);
            }

            setCalendars(nextCalendars);
            setStoredEvents(nextEvents);
            setPreferences(nextPreferences);
            setDefaultCalendarIdState(nextDefaultId);
            setHiddenCalendars(nextHidden);
            // Later reloads (window focus, remote calendar refresh) must not
            // snap the interface back: they would undo what the user just did.
            if (isFirstLoad) {
                setAllDayCollapsed(nextPreferences.allDayCollapsed);
                setShowWeekNumbers(nextPreferences.showWeekNumbers);
                setSecondaryTimezones(nextPreferences.secondaryTimezones);
                if (!isAndroid) {
                    setSidebarVisible(nextPreferences.sidebarVisible);
                }
                setDaysCount(
                    isAndroid
                        ? androidInitialDayCount
                        : nextPreferences.dayCount
                );
            }
            if (isFirstLoad) {
                // The events are in hand, so the calendar is about to draw
                // something rather than an empty grid. The Android shell holds
                // its splash screen until it hears this.
                window.dispatchEvent(new Event("neo-calendar-ready"));
            }
            if (!didApplyInitialViewRef.current) {
                didApplyInitialViewRef.current = true;
                setViewType(
                    isAndroid
                        ? androidInitialView
                        : nextPreferences.initialView.desktop
                );
            }
            setSelectedCalendarId((current) =>
                current &&
                nextCalendars.some((calendar) => calendar.id === current)
                    ? current
                    : null
            );
            // The refs still hold what the previous render saw: this reload is
            // what discovered the links, so hand them over before syncing.
            icsFeedsRef.current = nextPreferences.icsFeeds;
            icsRefreshMinutesRef.current =
                nextPreferences.icsDefaultRefreshMinutes;
            void refreshIcsFeeds();
        } catch (reason) {
            setStorageError(errorMessage(reason));
        } finally {
            // Also on failure: the shell must never stay on the splash because
            // the folder could not be read — the error has to be reachable.
            onReady?.();
        }
    }, [
        dataFolder,
        onReady,
        preferenceWriter,
        refreshIcsFeeds,
        setDaysCount,
        setViewType,
    ]);

    useEffect(() => {
        void reloadWorkspace();
    }, [reloadWorkspace]);

    useEffect(() => {
        let active = true;
        let dispose: (() => void) | undefined;

        const acceptRoutes = (urls: string[]) => {
            if (!active) return;

            let route: DesktopEventRoute | null = null;

            for (const url of urls) {
                route = parseDesktopEventRoute(url) ?? route;
            }

            if (!route) return;

            pendingEventRouteRef.current = route;

            if (!revealRouteRef.current(route)) {
                void reloadWorkspace();
            }
        };

        void getCurrent()
            .then((urls) => acceptRoutes(urls ?? []))
            .catch((reason) => {
                console.error(
                    "Neo Calendar: deep-link startup route failed.",
                    reason
                );
            });

        void onOpenUrl(acceptRoutes)
            .then((unlisten) => {
                if (active) {
                    dispose = unlisten;
                } else {
                    unlisten();
                }
            })
            .catch((reason) => {
                console.error(
                    "Neo Calendar: deep-link listener failed.",
                    reason
                );
            });

        return () => {
            active = false;
            dispose?.();
        };
    }, [reloadWorkspace]);

    // Files in the data folder are changed by a sync tool while the app is in
    // the background, so coming back into view is when a change has to appear.
    // `focus` alone was not enough: an Android WebView never fires it when its
    // activity resumes, which is why an event created on the desktop only
    // showed up after quitting and relaunching.
    const lastWakeReloadRef = useRef<number | null>(null);

    useEffect(() => {
        const reloadOnWake = () => {
            if (document.visibilityState === "hidden") return;

            const now = Date.now();
            if (
                !shouldReloadOnWake({
                    lastReloadAt: lastWakeReloadRef.current,
                    now,
                })
            ) {
                return;
            }

            lastWakeReloadRef.current = now;
            void reloadWorkspace();
        };

        window.addEventListener("focus", reloadOnWake);
        document.addEventListener("visibilitychange", reloadOnWake);
        return () => {
            window.removeEventListener("focus", reloadOnWake);
            document.removeEventListener("visibilitychange", reloadOnWake);
        };
    }, [reloadWorkspace]);

    // A minute-level wake rather than a fixed interval synchronizing every
    // link: `refreshIcsFeeds` already filters to what `dueIcsFeeds` reports
    // due, so a link on a long frequency is simply a no-op most minutes
    // rather than being resynced regardless of its own schedule.
    useEffect(() => {
        // Keyed on whether there is anything to sync, not on the links
        // themselves: that array is rebuilt by every reload, and rebuilding
        // the timer with it reset the minute before it ever elapsed.
        if (!hasIcsFeeds) return;
        const timer = window.setInterval(() => {
            void refreshIcsFeeds();
        }, 60 * 1000);
        return () => window.clearInterval(timer);
    }, [hasIcsFeeds, refreshIcsFeeds]);

    /* ── Les horaires de prière ────────────────────────────────────────
     *
     * Un calendrier peut suivre une mosquée. Ses horaires ne deviennent pas des
     * évènements — rien n'est écrit sur le disque, rien ne s'ouvre, rien ne se
     * déplace : ce sont des heures de la journée, et la grille les montre par un
     * trait, comme elle montre l'heure qu'il est.
     *
     * Le trait de la prochaine prière est là en permanence. Les cinq du jour ne
     * s'affichent que tant qu'on tient la touche P — sur ordinateur seulement :
     * un téléphone n'a pas de touche à tenir, et Mawaqit y fait déjà ce
     * travail.
     */
    const prayerCalendar = useMemo(
        () =>
            calendars.find(
                (calendar) =>
                    !hiddenCalendars.has(calendar.id) &&
                    prayerTimetableById(
                        preferences.prayerMosques[calendar.relativePath]
                    ) !== null
            ) ?? null,
        [calendars, hiddenCalendars, preferences.prayerMosques]
    );

    const prayerTimetable = prayerTimetableById(
        prayerCalendar
            ? preferences.prayerMosques[prayerCalendar.relativePath]
            : null
    );

    // Le reglage prime, la couleur du calendrier repond a defaut : une entree
    // absente veut dire « celle du calendrier », et non « pas de couleur ».
    const prayerLineColor = prayerCalendar
        ? (preferences.prayerColors[prayerCalendar.relativePath] ??
          prayerCalendar.color)
        : undefined;

    // La minute, pas la seconde : le trait de la prochaine prière ne bouge
    // qu'aux changements de prière, et une horloge à la minute suffit pour
    // qu'il passe à la suivante sans qu'on ait à recharger.
    const [prayerMinute, setPrayerMinute] = useState(() => new Date());
    useEffect(() => {
        if (!prayerTimetable) return;
        const timer = window.setInterval(
            () => setPrayerMinute(new Date()),
            60 * 1000
        );
        return () => window.clearInterval(timer);
    }, [prayerTimetable]);

    const [prayerAllHeld, setPrayerAllHeld] = useState(false);
    useEffect(() => {
        if (isAndroid || !prayerTimetable) return;

        const isTyping = () => {
            const active = document.activeElement;
            return (
                active instanceof HTMLElement &&
                (active.isContentEditable ||
                    ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName))
            );
        };
        // Une touche nue, donc jamais pendant qu'on écrit, et jamais en
        // combinaison : Ctrl+P imprime, et ce raccourci n'a pas à s'en mêler.
        const holds = (event: KeyboardEvent) =>
            event.key.toLowerCase() === "p" &&
            !event.ctrlKey &&
            !event.metaKey &&
            !event.altKey &&
            !isTyping();

        const onKeyDown = (event: KeyboardEvent) => {
            if (!holds(event)) return;
            event.preventDefault();
            setPrayerAllHeld(true);
        };
        const onKeyUp = (event: KeyboardEvent) => {
            if (event.key.toLowerCase() !== "p") return;
            setPrayerAllHeld(false);
        };
        // La fenêtre qui perd le focus ne rendra jamais son keyup : sans ça les
        // cinq traits restaient affichés après un alt-tab.
        const onBlur = () => setPrayerAllHeld(false);

        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("keyup", onKeyUp);
        window.addEventListener("blur", onBlur);
        return () => {
            window.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("keyup", onKeyUp);
            window.removeEventListener("blur", onBlur);
        };
    }, [isAndroid, prayerTimetable]);

    const prayerLines = useMemo(
        (): PrayerLine[] =>
            prayerLinesFor({
                timetable: prayerTimetable,
                now: prayerMinute,
                showAll: prayerAllHeld,
            }),
        [prayerAllHeld, prayerMinute, prayerTimetable]
    );

    const calendarPath = useCallback((calendarId: string): string | null => {
        const calendar = calendarsRef.current.find(
            (candidate) => candidate.id === calendarId
        );
        return calendar?.editable && calendar.type === "local"
            ? calendar.relativePath
            : null;
    }, []);

    const persistEvent = useCallback(
        async (
            event: NeoEvent,
            calendarId: string,
            previous?: DesktopStoredEvent
        ): Promise<string> => {
            const normalized = validateEvent(event);
            if (!normalized) throw new Error("The event is invalid.");
            const targetPath = calendarPath(calendarId);
            if (targetPath === null) {
                throw new Error("The selected calendar no longer exists.");
            }

            setIsSaving(true);
            setStorageError(null);
            const contents = serializeEventMarkdown(
                normalized,
                previous?.contents
            );

            /* Montrer la decision avant de l'ecrire.
               L'ecriture passe par le pont natif et, sur telephone, par le
               stockage partage : attendre qu'elle revienne laissait la case
               d'une tache vide une bonne seconde apres l'appui, comme si rien
               ne s'etait passe. L'enregistrement porte donc tout de suite ce
               que l'on vient de decider, et l'ancien revient si l'ecriture
               echoue. */
            const shown: DesktopStoredEvent | null = previous
                ? { ...previous, contents, event: normalized }
                : null;
            if (previous && shown) {
                const next = replaceRecord(
                    recordsRef.current,
                    previous.id,
                    shown
                );
                recordsRef.current = next;
                setStoredEvents(next);
            }

            try {
                const relativePath = await writeDesktopEventFile({
                    dataFolder,
                    calendarPath: targetPath,
                    previousRelativePath: previous?.relativePath,
                    fileName: filenameForEvent(normalized),
                    contents,
                });
                const id = previous?.id ?? internalEventId();
                const nextRecord: DesktopStoredEvent = {
                    id,
                    calendarId,
                    calendarPath: targetPath,
                    relativePath,
                    fileName: fileNameFromRelativePath(relativePath),
                    contents,
                    event: normalized,
                };
                const next = previous
                    ? recordsRef.current.map((record) =>
                          record.id === previous.id ? nextRecord : record
                      )
                    : [...recordsRef.current, nextRecord];
                recordsRef.current = next;
                setStoredEvents(next);
                return id;
            } catch (reason) {
                if (previous && shown) {
                    const next = revertRecord(
                        recordsRef.current,
                        shown,
                        previous
                    );
                    recordsRef.current = next;
                    setStoredEvents(next);
                }
                setStorageError(errorMessage(reason));
                throw reason;
            } finally {
                setIsSaving(false);
            }
        },
        [calendarPath, dataFolder]
    );

    const appendEventBody = useCallback(
        async (eventId: string, markdown: string): Promise<void> => {
            const previous = findStoredEvent(recordsRef.current, eventId);
            if (!previous || previous.readOnly) {
                throw new Error("This calendar is read-only.");
            }
            const contents = appendMarkdownToEventBody(
                previous.contents,
                markdown
            );
            if (contents === previous.contents) return;

            setIsSaving(true);
            setStorageError(null);
            try {
                const relativePath = await writeDesktopEventFile({
                    dataFolder,
                    calendarPath: previous.calendarPath,
                    previousRelativePath: previous.relativePath,
                    fileName: previous.fileName,
                    contents,
                });
                const nextRecord: DesktopStoredEvent = {
                    ...previous,
                    relativePath,
                    fileName: fileNameFromRelativePath(relativePath),
                    contents,
                };
                const next = recordsRef.current.map((record) =>
                    record.id === previous.id ? nextRecord : record
                );
                recordsRef.current = next;
                setStoredEvents(next);
            } catch (reason) {
                setStorageError(errorMessage(reason));
                throw reason;
            } finally {
                setIsSaving(false);
            }
        },
        [dataFolder]
    );

    const removeEventBodyLink = useCallback(
        async (eventId: string, target: string): Promise<void> => {
            const previous = findStoredEvent(recordsRef.current, eventId);
            if (!previous || previous.readOnly) {
                throw new Error("This calendar is read-only.");
            }
            const contents = removeMarkdownTargetFromEventBody(
                previous.contents,
                target
            );
            if (contents === previous.contents) return;

            setIsSaving(true);
            setStorageError(null);
            try {
                const relativePath = await writeDesktopEventFile({
                    dataFolder,
                    calendarPath: previous.calendarPath,
                    previousRelativePath: previous.relativePath,
                    fileName: previous.fileName,
                    contents,
                });
                const nextRecord: DesktopStoredEvent = {
                    ...previous,
                    relativePath,
                    fileName: fileNameFromRelativePath(relativePath),
                    contents,
                };
                const next = recordsRef.current.map((record) =>
                    record.id === previous.id ? nextRecord : record
                );
                recordsRef.current = next;
                setStoredEvents(next);
            } catch (reason) {
                setStorageError(errorMessage(reason));
                throw reason;
            } finally {
                setIsSaving(false);
            }
        },
        [dataFolder]
    );

    /**
     * Nommer un lien soi-même.
     *
     * Le titre est lu une fois, à l'ajout, et ce que le site voulait bien dire
     * ce jour-là reste dans le fichier pour toujours. Un lien de partage, une
     * connexion lente, un site qui refuse un client ordinaire : il n'y avait
     * pas de retour en arrière. Le libellé n'est que du texte dans un lien
     * Markdown ; le réécrire ne demande ni réseau ni permission.
     */
    const renameEventBodyLink = useCallback(
        async (
            eventId: string,
            target: string,
            label: string,
            nextTarget?: string
        ): Promise<void> => {
            const previous = findStoredEvent(recordsRef.current, eventId);
            if (!previous || previous.readOnly) {
                throw new Error("This calendar is read-only.");
            }
            const contents = renameMarkdownTargetInEventBody(
                previous.contents,
                target,
                label,
                nextTarget
            );
            if (contents === previous.contents) return;

            setIsSaving(true);
            setStorageError(null);
            try {
                const relativePath = await writeDesktopEventFile({
                    dataFolder,
                    calendarPath: previous.calendarPath,
                    previousRelativePath: previous.relativePath,
                    fileName: previous.fileName,
                    contents,
                });
                const nextRecord: DesktopStoredEvent = {
                    ...previous,
                    relativePath,
                    fileName: fileNameFromRelativePath(relativePath),
                    contents,
                };
                const next = recordsRef.current.map((record) =>
                    record.id === previous.id ? nextRecord : record
                );
                recordsRef.current = next;
                setStoredEvents(next);
            } catch (reason) {
                setStorageError(errorMessage(reason));
                throw reason;
            } finally {
                setIsSaving(false);
            }
        },
        [dataFolder]
    );

    const searchEventLinks = useCallback(
        async (
            query: string,
            requestedVaultPath?: string
        ): Promise<EventLinkTarget[]> => {
            const paths = requestedVaultPath
                ? linkedVaults.filter(
                      (path) =>
                          path.replace(/\\/g, "/").toLowerCase() ===
                          requestedVaultPath.replace(/\\/g, "/").toLowerCase()
                  )
                : linkedVaults;
            if (!paths.length) return [];
            const notes = await searchDesktopVaultNotes(paths, query, 40);
            return notes.map((note) => ({
                id: `${note.vaultPath}::${note.relativePath}`,
                vaultPath: note.vaultPath,
                vaultName: note.vaultName,
                title: note.title,
                relativePath: note.relativePath,
                detail: note.relativePath,
                markdown: markdownLinkForVaultNote(note),
            }));
        },
        [linkedVaults]
    );

    const pickEventAttachments = useCallback(
        async (eventId: string): Promise<void> => {
            const record = findStoredEvent(recordsRef.current, eventId);
            if (!record || record.readOnly) {
                throw new Error("This calendar is read-only.");
            }
            const selected = await open({
                directory: false,
                multiple: true,
                title: "Choose files to attach",
            });
            const paths = Array.isArray(selected)
                ? selected
                : typeof selected === "string"
                ? [selected]
                : [];
            if (!paths.length) return;

            const markdown: string[] = [];
            for (const sourcePath of paths) {
                const attachment = await copyDesktopAttachment(
                    dataFolder,
                    record.relativePath,
                    sourcePath
                );
                markdown.push(markdownLinkForAttachment(attachment));
            }
            await appendEventBody(eventId, markdown.join("\n"));
        },
        [appendEventBody, dataFolder]
    );

    /**
     * Ce que Ctrl+V dépose sur un événement.
     *
     * Le chemin est le même que pour un fichier choisi dans une boîte de
     * dialogue — dossier `.attachments`, nom rendu unique, lien ajouté au corps
     * de la note — à ceci près qu'il n'y a pas de fichier de départ : une
     * capture d'écran n'existe que sur le presse-papiers.
     */
    const pasteEventAttachment = useCallback(
        async (
            eventId: string,
            fileName: string,
            contents: Uint8Array
        ): Promise<void> => {
            const record = findStoredEvent(recordsRef.current, eventId);
            if (!record || record.readOnly) {
                throw new Error("This calendar is read-only.");
            }
            const attachment = await writeDesktopAttachment(
                dataFolder,
                record.relativePath,
                fileName,
                contents
            );
            await appendEventBody(
                eventId,
                markdownLinkForAttachment(attachment)
            );
        },
        [appendEventBody, dataFolder]
    );

    /**
     * Le contenu d'une pièce jointe, pour la montrer.
     *
     * Le chemin est celui écrit dans la note, relatif au dossier de
     * l'événement ; c'est ici qu'il redevient un chemin dans le dossier de
     * données. Rendu `null` plutôt que jeté quand le fichier ne se lit pas : la
     * ligne montre alors son nom, ce qu'elle a toujours fait.
     */
    const readEventAttachment = useCallback(
        async (eventId: string, target: string): Promise<string | null> => {
            const record = findStoredEvent(recordsRef.current, eventId);
            if (!record) return null;
            let written = target;
            try {
                written = decodeURIComponent(target);
            } catch {
                // Une cible mal échappée se lit telle qu'elle est écrite.
            }
            try {
                return await readDesktopAttachment(
                    dataFolder,
                    attachmentPathFor(record.relativePath, written)
                );
            } catch {
                return null;
            }
        },
        [dataFolder]
    );

    const addEvent = useCallback(
        async (calendarId: string, event: NeoEvent): Promise<string> =>
            persistEvent(event, calendarId),
        [persistEvent]
    );

    const updateEvent = useCallback(
        async (
            eventId: string,
            event: NeoEvent,
            targetCalendarId?: string
        ): Promise<boolean> => {
            const previous = findStoredEvent(recordsRef.current, eventId);
            if (!previous || previous.readOnly) return false;
            await persistEvent(
                event,
                targetCalendarId ?? previous.calendarId,
                previous
            );
            return true;
        },
        [persistEvent]
    );

    const deleteEventFiles = useCallback(
        async (records: DesktopStoredEvent[]): Promise<void> => {
            const editableRecords = records.filter(
                (record) => !record.readOnly
            );
            if (!editableRecords.length) return;
            setIsSaving(true);
            setStorageError(null);
            try {
                for (const record of editableRecords) {
                    await deleteDesktopEventFile(
                        dataFolder,
                        record.relativePath
                    );
                }
                const removed = new Set(
                    editableRecords.map((record) => record.id)
                );
                const next = recordsRef.current.filter(
                    (candidate) => !removed.has(candidate.id)
                );
                recordsRef.current = next;
                setStoredEvents(next);
                setPanelEventId(null);
                setPanelAnchor(null);
                setSelectedIds(new Set());
            } catch (reason) {
                setStorageError(errorMessage(reason));
                throw reason;
            } finally {
                setIsSaving(false);
            }
        },
        [dataFolder]
    );

    const deleteEvents = useCallback(
        async (eventIds: string[], remember = true): Promise<void> => {
            const unique = new Map<string, DesktopStoredEvent>();
            for (const eventId of eventIds) {
                const record = findStoredEvent(recordsRef.current, eventId);
                if (record && !record.readOnly) unique.set(record.id, record);
            }
            const records = [...unique.values()];
            if (!records.length) return;
            if (remember) setDeletedBatch(records);
            await deleteEventFiles(records);
        },
        [deleteEventFiles]
    );

    const deleteEvent = useCallback(
        async (eventId: string): Promise<void> => deleteEvents([eventId]),
        [deleteEvents]
    );

    /**
     * Deleting one date of a series is not deleting its note: the whole series
     * lives in that one file. So a single occurrence asks what to delete, and
     * everything else deletes as it always did.
     */
    const requestDeleteEvents = useCallback(
        async (eventIds: string[]): Promise<void> => {
            if (eventIds.length === 1) {
                const record = findStoredEvent(recordsRef.current, eventIds[0]);
                if (
                    record &&
                    !record.readOnly &&
                    needsOccurrenceChoice(record.event, eventIds[0])
                ) {
                    setRecurringDeleteId(eventIds[0]);
                    return;
                }
            }
            await deleteEvents(eventIds);
        },
        [deleteEvents]
    );

    const applyRecurringDelete = useCallback(
        async (displayId: string, following: boolean): Promise<void> => {
            const record = findStoredEvent(recordsRef.current, displayId);
            const occurrence = parseOccurrenceId(displayId);
            if (!record || record.readOnly || !occurrence) return;

            const next = following
                ? withFollowingRemoved(record.event, occurrence.date)
                : withOccurrenceRemoved(record.event, occurrence.date);
            // Nothing would be left of the series, so its note goes too — and
            // through the usual path, which keeps the undo.
            if (!next) {
                await deleteEvents([displayId]);
                return;
            }

            await updateEvent(displayId, next);
            if (panelEventId === displayId) {
                setPanelEventId(null);
                setPanelAnchor(null);
            }
            setSelectedIds((current) => {
                if (!current.has(displayId)) return current;
                const remaining = new Set(current);
                remaining.delete(displayId);
                return remaining;
            });
        },
        [deleteEvents, panelEventId, updateEvent]
    );

    // Which of the two wordings the question is asked in.
    const recurringDeleteIsTask = useMemo(() => {
        if (!recurringDeleteId) return false;
        const record = findStoredEvent(recordsRef.current, recurringDeleteId);
        return !!record && isTask(record.event);
    }, [recurringDeleteId]);

    const undoLastDeletion = useCallback(async () => {
        if (!deletedBatch.length) return;
        setIsSaving(true);
        setStorageError(null);
        try {
            const restored: DesktopStoredEvent[] = [];
            for (const record of deletedBatch) {
                const relativePath = await writeDesktopEventFile({
                    dataFolder,
                    calendarPath: record.calendarPath,
                    fileName: record.fileName,
                    contents: record.contents,
                });
                restored.push({ ...record, relativePath });
            }
            const restoredIds = new Set(restored.map((record) => record.id));
            const next = [
                ...recordsRef.current.filter(
                    (record) => !restoredIds.has(record.id)
                ),
                ...restored,
            ];
            recordsRef.current = next;
            setStoredEvents(next);
            setDeletedBatch([]);
        } catch (reason) {
            setStorageError(errorMessage(reason));
        } finally {
            setIsSaving(false);
        }
    }, [dataFolder, deletedBatch]);

    const controller = useMemo<DesktopCacheController>(
        () => ({
            getRecords: () => recordsRef.current,
            getCalendars: () => calendarsRef.current,
            addEvent,
            updateEvent,
            deleteEvent,
        }),
        [addEvent, deleteEvent, updateEvent]
    );
    const cacheFacade = useMemo(
        () => new DesktopEventCacheFacade(controller),
        [controller]
    );
    useEffect(() => cacheFacade.syncCalendars(), [cacheFacade, calendars]);
    const cache = cacheFacade.asEventCache();
    const { handleEventDrag, handleEventResize, handleEventUnschedule } =
        useEventDragResize(cache);

    const visibleDates = useMemo(() => {
        switch (viewType) {
            case "day":
                return [currentDate];
            case "3days":
                return [0, 1, 2].map((offset) => addDays(currentDate, offset));
            case "days":
                return Array.from({ length: dayCount }, (_, offset) =>
                    addDays(currentDate, offset)
                );
            case "month": {
                const firstOfMonth = new Date(
                    currentDate.getFullYear(),
                    currentDate.getMonth(),
                    1
                );
                const start = getWeekStart(firstOfMonth, preferences.firstDay);
                return Array.from({ length: 42 }, (_, offset) =>
                    addDays(start, offset)
                );
            }
            case "list":
            case "week":
            default:
                return Array.from({ length: 7 }, (_, offset) =>
                    addDays(currentDate, offset)
                );
        }
    }, [currentDate, dayCount, preferences.firstDay, viewType]);

    const calendarById = useMemo(
        () => new Map(calendars.map((calendar) => [calendar.id, calendar])),
        [calendars]
    );

    const displayEvents = useMemo(() => {
        if (!visibleDates.length) return [];
        const rangeStart = addDays(visibleDates[0], -7);
        const rangeEnd = addDays(visibleDates[visibleDates.length - 1], 7);
        return storedEvents.flatMap((record) => {
            if (
                record.event.type === "someday" ||
                hiddenCalendars.has(record.calendarId)
            ) {
                return [];
            }
            const calendar = calendarById.get(record.calendarId);
            if (!calendar) return [];
            return neoEventToDisplayEvents(
                record.event,
                record.id,
                calendar.id,
                calendar.name,
                calendar.color,
                // Le calendrier peut etre modifiable sans que CETTE note le
                // soit : celles qu'un lien ICS ecrit vivent dans un calendrier
                // local ordinaire. Le stockage refusait deja de les ecrire, mais
                // le bloc offrait quand meme ses poignees de glissement et de
                // redimensionnement, et le geste mourait sans rien dire.
                calendar.editable && !record.readOnly,
                rangeStart,
                rangeEnd
            ).map((event) => ({
                ...event,
                icsFeedId: record.icsFeedId,
                selected:
                    selectedIds.has(record.id) ||
                    selectedIds.has(event.id) ||
                    panelEventId === record.id ||
                    panelEventId === event.id,
            }));
        });
    }, [
        calendarById,
        hiddenCalendars,
        panelEventId,
        selectedIds,
        storedEvents,
        visibleDates,
    ]);

    const somedayEvents = useMemo(
        () =>
            storedEvents.flatMap((record) => {
                if (
                    record.event.type !== "someday" ||
                    hiddenCalendars.has(record.calendarId)
                ) {
                    return [];
                }
                const calendar = calendarById.get(record.calendarId);
                return calendar
                    ? [
                          {
                              ...eventRecordForDisplay(record, calendar),
                              selected:
                                  selectedIds.has(record.id) ||
                                  panelEventId === record.id,
                          },
                      ]
                    : [];
            }),
        [calendarById, hiddenCalendars, panelEventId, selectedIds, storedEvents]
    );

    // Every task, for the sidebar's task list. Built from the stored records
    // rather than from the windowed display events, so a task whose date has
    // long passed still shows up — which is the whole point of the list.
    // A hidden calendar stays hidden here too.
    const tasks = useMemo(() => {
        const sources = new Map<string, TaskSource>();
        for (const record of storedEvents) {
            if (hiddenCalendars.has(record.calendarId)) continue;
            const calendar = calendarById.get(record.calendarId);
            if (!calendar) continue;
            let source = sources.get(calendar.id);
            if (!source) {
                source = {
                    id: calendar.id,
                    name: calendar.name,
                    color: calendar.color,
                    editable: calendar.editable,
                    events: [],
                };
                sources.set(calendar.id, source);
            }
            source.events.push({ id: record.id, event: record.event });
        }
        return collectTasks([...sources.values()]);
    }, [calendarById, hiddenCalendars, storedEvents]);
    const today = todayISO();

    // Timed entries still carrying `completed: false` from the old bug — the
    // flights and meetings that would otherwise crowd the task list as
    // overdue. Hidden calendars are NOT filtered here: this is a repair over
    // the whole vault, not a view.
    const misfiledEvents = useMemo(
        () =>
            findMisfiledEvents(
                [...calendarById.values()].map((calendar) => ({
                    editable: calendar.editable,
                    events: storedEvents
                        .filter((r) => r.calendarId === calendar.id)
                        .map((r) => ({ id: r.id, event: r.event })),
                }))
            ),
        [calendarById, storedEvents]
    );

    // Turn those entries back into plain events, one write each.
    //
    // Sequential rather than Promise.all: these go through the same file layer
    // as every other edit, and firing hundreds of concurrent writes at a vault
    // is how you get half-written notes. A failure on one entry must not abort
    // the rest either — the count reported back is what actually landed.
    const convertMisfiledEvents = useCallback(async () => {
        let converted = 0;
        for (const { id, event } of misfiledEvents) {
            try {
                if (await updateEvent(id, asPlainEvent(event))) converted += 1;
            } catch {
                // Left as a task; the user can still flip it by hand.
            }
        }
        return converted;
    }, [misfiledEvents, updateEvent]);

    const panelEvents = useMemo(() => {
        if (!selectedCalendarId) return [];
        const calendar = calendarById.get(selectedCalendarId);
        if (!calendar) return [];
        const now = new Date();
        const rangeStart = new Date(now.getFullYear() - 2, 0, 1);
        const rangeEnd = new Date(now.getFullYear() + 2, 11, 31);
        const events = storedEvents
            .filter((record) => record.calendarId === selectedCalendarId)
            .flatMap((record) =>
                record.event.type === "someday"
                    ? [eventRecordForDisplay(record, calendar)]
                    : neoEventToDisplayEvents(
                          record.event,
                          record.id,
                          calendar.id,
                          calendar.name,
                          calendar.color,
                          // Comme dans la grille : la note d'un lien ICS n'est
                          // pas modifiable, meme dans un calendrier qui l'est.
                          calendar.editable && !record.readOnly,
                          rangeStart,
                          rangeEnd
                      ).map((display) => ({
                          ...display,
                          icsFeedId: record.icsFeedId,
                      }))
            );
        events.sort((left, right) => {
            if (left.isSomeday !== right.isSomeday) {
                return left.isSomeday ? -1 : 1;
            }
            return right.start.getTime() - left.start.getTime();
        });
        return events;
    }, [calendarById, selectedCalendarId, storedEvents]);

    const panelIcsFeeds = useMemo(() => {
        const path = selectedCalendarId
            ? calendarById.get(selectedCalendarId)?.relativePath
            : undefined;
        if (!path) return undefined;
        return preferences.icsFeeds
            .filter((feed) => feed.calendarPath === path)
            .map((feed) => ({ id: feed.id, name: feed.name }));
    }, [calendarById, selectedCalendarId, preferences.icsFeeds]);

    const panelLinkedItems = useMemo<EventLinkedItem[]>(() => {
        if (!panelEventId) return [];
        const record = findStoredEvent(storedEvents, panelEventId);
        return record && !record.readOnly
            ? extractEventBodyLinks(record.contents)
            : [];
    }, [panelEventId, storedEvents]);

    const calendarSources: CalendarSource[] = useMemo(
        () =>
            calendars.map((calendar) => ({
                id: calendar.id,
                name: calendar.name,
                color: calendar.color,
                editable: calendar.editable,
                type: calendar.type,
                ...(calendar.icon ? { icon: calendar.icon } : {}),
            })),
        [calendars]
    );

    const selectedCalendar = useMemo(() => {
        const calendar = selectedCalendarId
            ? calendarById.get(selectedCalendarId)
            : undefined;
        return calendar
            ? {
                  id: calendar.id,
                  name: calendar.name,
                  color: calendar.color,
                  type: calendar.type,
                  editable: calendar.editable,
              }
            : null;
    }, [calendarById, selectedCalendarId]);

    const activeCalendarId = useCallback(
        (requested?: string): string => {
            if (requested && calendarById.get(requested)?.editable) {
                return requested;
            }
            if (
                defaultCalendarId &&
                calendarById.get(defaultCalendarId)?.editable
            ) {
                return defaultCalendarId;
            }
            return calendars.find((calendar) => calendar.editable)?.id ?? "";
        },
        [calendarById, calendars, defaultCalendarId]
    );

    const setDraftAnchorSoon = useCallback(() => {
        requestAnimationFrame(() => {
            const element = document.querySelector(
                '[data-draft-preview="true"]'
            );
            setPanelAnchor(element?.getBoundingClientRect() ?? null);
        });
    }, []);

    const openDraft = useCallback(
        (
            start: Date,
            end: Date,
            allDay: boolean,
            requestedCalendar?: string
        ) => {
            const calendarId = activeCalendarId(requestedCalendar);
            if (!calendarId) {
                setStorageError(
                    "Create a calendar folder before adding events."
                );
                return;
            }
            const safeEnd =
                end.getTime() > start.getTime()
                    ? end
                    : new Date(start.getTime() + 30 * 60_000);
            setPanelEventId(null);
            setDraftSlot({ start, end: safeEnd, allDay, calendarId });
            setDraftAnchorSoon();
        },
        [activeCalendarId, setDraftAnchorSoon]
    );

    const openNewEvent = useCallback(
        (calendarId?: string) => {
            const start = new Date();
            start.setSeconds(0, 0);
            start.setMinutes(Math.ceil(start.getMinutes() / 30) * 30);
            openDraft(
                start,
                new Date(start.getTime() + 30 * 60_000),
                false,
                calendarId
            );
        },
        [openDraft]
    );

    const openExistingEvent = useCallback(
        (eventId: string) => {
            const record = findStoredEvent(recordsRef.current, eventId);
            if (!record) return;
            // A click from the Someday panel names an event that can be
            // weeks or months from whatever the grid currently shows — same
            // as opening one from a deep link. Without this the panel
            // opened, unanchored, over a grid still sitting on today, which
            // read as nothing having happened: the whole point of clicking
            // an entry there is to land on it, not just describe it.
            if (record.event.type === "single") {
                const preferredDate = record.event.date;
                if (/^\d{4}-\d{2}-\d{2}$/.test(preferredDate)) {
                    setCurrentDate(parseLocalDate(preferredDate));
                }
            }
            setDraftSlot(null);
            setPanelEventId(eventId);
            setPanelAnchor(anchorForEvent(eventId));
        },
        [setCurrentDate]
    );

    const selectEvent = useCallback(
        (eventId: string, additive = false) => {
            if (!additive) {
                setSelectedIds(new Set());
                openExistingEvent(eventId);
                return;
            }
            setPanelEventId(null);
            setPanelAnchor(null);
            setSelectedIds((current) => {
                const next = new Set(current);
                if (next.has(eventId)) next.delete(eventId);
                else next.add(eventId);
                return next;
            });
        },
        [openExistingEvent]
    );

    const clearMultiSelection = useCallback(() => {
        setSelectedIds(new Set());
    }, []);

    // Desktop parity with the plugin's pointer interactions: Shift+drag draws
    // a marquee around events, an empty click clears the current multi-
    // selection, and Escape clears it as well.
    useEffect(() => {
        const root = calendarRootRef.current;
        if (!root) return;

        const isInteractive = (target: HTMLElement) =>
            Boolean(
                target.closest(
                    ".nc-event-block, .nc-event-popup, .nc-context-menu, " +
                        ".nc-command-palette, .nc-shortcuts-panel, .nc-settings, " +
                        ".nc-allday-collapse-btn, .nc-tz-corner-btn, button, " +
                        "input, textarea, select, a, [contenteditable='true']"
                )
            );

        const selectInBox = (
            x0: number,
            y0: number,
            x1: number,
            y1: number
        ) => {
            const left = Math.min(x0, x1);
            const right = Math.max(x0, x1);
            const top = Math.min(y0, y1);
            const bottom = Math.max(y0, y1);
            const ids = new Set<string>();

            root.querySelectorAll<HTMLElement>(
                ".nc-event-block[data-event-id]"
            ).forEach((node) => {
                const rect = node.getBoundingClientRect();
                if (
                    rect.left < right &&
                    rect.right > left &&
                    rect.top < bottom &&
                    rect.bottom > top
                ) {
                    const id = node.dataset.eventId;
                    if (id) ids.add(id);
                }
            });
            setSelectedIds(ids);
        };

        // Pointer events, not mouse events: the grid cancels its `pointerdown`,
        // which suppresses the compatibility mouse events. A press on the
        // calendar surface therefore never produced a `mousedown` — and a click
        // on empty space stopped clearing the multi-selection.
        const onPress = (event: PointerEvent) => {
            if (event.button !== 0 || event.ctrlKey || event.metaKey) return;
            const target = event.target as HTMLElement;
            if (isInteractive(target)) return;
            if (!target.closest(".nc-main")) return;

            if (!event.shiftKey) {
                clearMultiSelection();
                return;
            }

            event.preventDefault();
            setPanelEventId(null);
            setPanelAnchor(null);
            const bounds = root.getBoundingClientRect();
            const viewportX = event.clientX;
            const viewportY = event.clientY;
            const localX = viewportX - bounds.left;
            const localY = viewportY - bounds.top;
            setMarquee({
                x0: localX,
                y0: localY,
                x1: localX,
                y1: localY,
            });
            selectInBox(viewportX, viewportY, viewportX, viewportY);

            const onMove = (moveEvent: PointerEvent) => {
                setMarquee({
                    x0: localX,
                    y0: localY,
                    x1: moveEvent.clientX - bounds.left,
                    y1: moveEvent.clientY - bounds.top,
                });
                selectInBox(
                    viewportX,
                    viewportY,
                    moveEvent.clientX,
                    moveEvent.clientY
                );
            };
            const onUp = () => {
                window.removeEventListener("pointermove", onMove, true);
                window.removeEventListener("pointerup", onUp, true);
                setMarquee(null);
            };
            window.addEventListener("pointermove", onMove, true);
            window.addEventListener("pointerup", onUp, true);
        };

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") clearMultiSelection();
        };
        const onBlur = () => setMarquee(null);

        root.addEventListener("pointerdown", onPress);
        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("blur", onBlur);
        return () => {
            root.removeEventListener("pointerdown", onPress);
            window.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("blur", onBlur);
        };
    }, [clearMultiSelection]);

    /*
     * Escape closes the calendar's events panel — the drawer its someday pile
     * lives in — but only when it is the layer in front. A dialog, the settings
     * and the command palette answer Escape themselves, an open event answers
     * it itself, and a selection is cleared by it: one press, one thing.
     *
     * On the phone the panel is left to the back gesture, which is what closes
     * a screen there.
     */
    useEffect(() => {
        if (isAndroid) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            const closes = escapeClosesEventsPanel({
                eventsPanelOpen: selectedCalendarId !== null,
                overlayOpen:
                    settingsOpen ||
                    addCalendarOpen ||
                    commandPaletteVisible ||
                    calendarToDelete !== null ||
                    recurringDeleteId !== null ||
                    contextMenu !== null,
                eventPanelOpen: panelEventId !== null || draftSlot !== null,
                hasSelection: selectedIds.size > 0,
            });
            if (!closes) return;
            event.preventDefault();
            setSelectedCalendarId(null);
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [
        addCalendarOpen,
        calendarToDelete,
        commandPaletteVisible,
        contextMenu,
        draftSlot,
        isAndroid,
        panelEventId,
        recurringDeleteId,
        selectedCalendarId,
        selectedIds,
        settingsOpen,
    ]);

    const handlePanelDragTarget = useCallback(
        (event: DisplayEvent | null, target: PanelDropTarget) => {
            if (!event || !target) {
                setPanelPreview(null);
                return;
            }
            const next: DragPreview = {
                dayKey: target.start.toDateString(),
                event: { ...event, allDay: target.allDay },
                newStart: target.start,
                newEnd: target.end,
            };
            setPanelPreview((previous) =>
                previous &&
                previous.event.id === next.event.id &&
                previous.event.allDay === next.event.allDay &&
                previous.newStart.getTime() === next.newStart.getTime() &&
                previous.newEnd.getTime() === next.newEnd.getTime()
                    ? previous
                    : next
            );
        },
        []
    );

    const commitDraft = useCallback(
        async (
            title: string,
            updates?: Partial<NeoEvent>,
            calendarId?: string
        ) => {
            const targetCalendar = activeCalendarId(
                calendarId ?? draftSlot?.calendarId
            );
            if (!targetCalendar) return;
            const normalized = validateEvent({
                ...(updates ?? {}),
                title: title.trim(),
            });
            if (!normalized) {
                setStorageError("The event could not be validated.");
                return;
            }
            setCommittingDraft(true);
            try {
                const id = await addEvent(targetCalendar, normalized);
                setDraftSlot(null);
                setPanelEventId(id);
                requestAnimationFrame(() => setPanelAnchor(anchorForEvent(id)));
            } finally {
                setCommittingDraft(false);
            }
        },
        [activeCalendarId, addEvent, draftSlot]
    );

    const createSomeday = useCallback(async () => {
        const calendarId = activeCalendarId();
        if (!calendarId) return;
        // Always a task: this is what the task panel's add button calls, and a
        // dateless entry that is not a task would never appear in that list.
        const id = await addEvent(
            calendarId,
            createUnscheduledPanelEvent(true)
        );
        openExistingEvent(id);
    }, [activeCalendarId, addEvent, openExistingEvent]);

    const addPanelEvent = useCallback(
        async (calendarId: string) => {
            if (!calendarById.get(calendarId)?.editable) return;
            const id = await addEvent(
                calendarId,
                createUnscheduledPanelEvent(true)
            );
            setPanelAnchor(null);
            setPanelEventId(id);
        },
        [addEvent, calendarById]
    );

    const quickAdd = useCallback(
        async (partial: Partial<NeoEvent>) => {
            const calendarId = activeCalendarId();
            if (!calendarId || !partial.title) return;
            const source = partial as Record<string, unknown>;
            const date =
                typeof source.date === "string"
                    ? source.date
                    : formatLocalDate(new Date());
            const allDay = source.allDay === true;
            const event = validateEvent({
                ...partial,
                title: partial.title,
                type: "single",
                date,
                endDate:
                    typeof source.endDate === "string" ? source.endDate : null,
                ...(allDay
                    ? { allDay: true }
                    : {
                          allDay: false,
                          startTime:
                              typeof source.startTime === "string"
                                  ? source.startTime
                                  : "09:00",
                          endTime:
                              typeof source.endTime === "string"
                                  ? source.endTime
                                  : "09:30",
                      }),
            });
            if (event) await addEvent(calendarId, event);
        },
        [activeCalendarId, addEvent]
    );

    const toggleTask = useCallback(
        async (eventId: string, done: boolean): Promise<boolean> => {
            const record = findStoredEvent(recordsRef.current, eventId);
            if (!record || record.readOnly) return false;

            // A series records completion per occurrence, so the tick has to
            // name a day. Expansion put it in the display id, and only a series
            // may read it that way — a stored id can end in digits by chance.
            if (isSeries(record.event)) {
                const occurrence = parseOccurrenceId(eventId);
                if (!occurrence || !isTask(record.event)) return false;
                return updateEvent(
                    eventId,
                    setOccurrenceStatus(
                        record.event,
                        occurrence.date,
                        done ? "complete" : "todo"
                    )
                );
            }

            if (!canPersistDesktopTaskCompletion(record.event, done)) {
                return false;
            }

            return updateEvent(eventId, {
                ...record.event,
                completed: done ? new Date().toISOString() : false,
            } as NeoEvent);
        },
        [updateEvent]
    );

    const setDefaultCalendar = useCallback(
        (calendarId: string) => {
            const calendar = calendarById.get(calendarId);
            if (!calendar?.editable) return;
            setDefaultCalendarIdState(calendarId);
            void persistPreferences((current) => ({
                ...current,
                defaultCalendarPath: calendar.relativePath,
            }));
        },
        [calendarById, persistPreferences]
    );

    const toggleCalendar = useCallback(
        (calendarId: string) => {
            const calendar = calendarById.get(calendarId);
            if (!calendar) return;
            setSoloCalendarId(null);
            setHiddenCalendars((current) => {
                const next = new Set(current);
                if (next.has(calendarId)) next.delete(calendarId);
                else next.add(calendarId);
                const hidden = next.has(calendarId);
                // Expressed per calendar path so the change stays correct even
                // when replayed once the calendar list is finally loaded.
                void persistPreferences((stored) => ({
                    ...stored,
                    hiddenCalendarPaths: hidden
                        ? stored.hiddenCalendarPaths.includes(
                              calendar.relativePath
                          )
                            ? stored.hiddenCalendarPaths
                            : [
                                  ...stored.hiddenCalendarPaths,
                                  calendar.relativePath,
                              ]
                        : stored.hiddenCalendarPaths.filter(
                              (path) => path !== calendar.relativePath
                          ),
                }));
                return next;
            });
        },
        [calendarById, persistPreferences]
    );

    const showOnlyCalendar = useCallback(
        (calendarId: string) => {
            if (soloCalendarId === calendarId) {
                const restored = new Set(hiddenBeforeSolo.current);
                setHiddenCalendars(restored);
                setSoloCalendarId(null);
                return;
            }
            hiddenBeforeSolo.current = new Set(hiddenCalendars);
            setHiddenCalendars(
                new Set(
                    calendars
                        .filter((calendar) => calendar.id !== calendarId)
                        .map((calendar) => calendar.id)
                )
            );
            setSoloCalendarId(calendarId);
        },
        [calendars, hiddenCalendars, soloCalendarId]
    );

    const createCalendar = useCallback(
        async (request: AddCalendarRequest) => {
            setIsSaving(true);
            setStorageError(null);
            try {
                if (request.type === "local") {
                    const relativePath = await createDesktopCalendarFolder(
                        dataFolder,
                        request.name
                    );
                    // Le premier lien du calendrier, quand le dialogue en a
                    // recu un. Meme forme que celui que pose le panneau des
                    // liens ICS : c'est le meme abonnement, seul l'endroit d'ou
                    // on le demande change. La synchro le prendra a son
                    // prochain cycle et lui provisionnera son dossier.
                    if (request.icsUrl) {
                        const feed: IcsFeedSubscription = {
                            id: internalEventId(),
                            calendarPath: relativePath,
                            name: request.name,
                            url: request.icsUrl,
                            active: true,
                        };
                        await persistPreferences((stored) => ({
                            ...stored,
                            icsFeeds: [...stored.icsFeeds, feed],
                        }));
                    }
                } else {
                    const calendarId = externalCalendarId(request);
                    if (
                        preferences.externalCalendars.some(
                            (source) =>
                                externalCalendarId(source) === calendarId
                        )
                    ) {
                        throw new Error("This calendar source already exists.");
                    }
                    const key = externalCalendarPreferenceKey(request);
                    await persistPreferences((stored) => ({
                        ...stored,
                        externalCalendars: [
                            ...stored.externalCalendars,
                            request,
                        ],
                        colors: {
                            ...stored.colors,
                            [key]: request.color,
                        },
                        order: stored.order.includes(key)
                            ? stored.order
                            : [...stored.order, key],
                    }));
                }
                await reloadWorkspace();
            } catch (reason) {
                const message = errorMessage(reason);
                setStorageError(message);
                throw new Error(message);
            } finally {
                setIsSaving(false);
            }
        },
        [
            dataFolder,
            persistPreferences,
            preferences.externalCalendars,
            reloadWorkspace,
        ]
    );

    const addCalendar = useCallback(() => {
        setAddCalendarOpen(true);
    }, []);

    const renameCalendar = useCallback(
        async (calendarId: string, newName: string) => {
            const calendar = calendarById.get(calendarId);
            if (!calendar) return;
            const trimmedName = newName.trim();
            if (!trimmedName) return;
            setIsSaving(true);
            try {
                if (calendar.editable && calendar.type === "local") {
                    const nextPath = await renameDesktopCalendarFolder(
                        dataFolder,
                        calendar.relativePath,
                        trimmedName
                    );
                    await persistPreferences((stored) => {
                        const nextColors = { ...stored.colors };
                        if (nextColors[calendar.relativePath]) {
                            nextColors[nextPath] =
                                nextColors[calendar.relativePath];
                            delete nextColors[calendar.relativePath];
                        }
                        return {
                            ...stored,
                            colors: nextColors,
                            order: stored.order.map((path) =>
                                path === calendar.relativePath ? nextPath : path
                            ),
                            defaultCalendarPath:
                                stored.defaultCalendarPath ===
                                calendar.relativePath
                                    ? nextPath
                                    : stored.defaultCalendarPath,
                            hiddenCalendarPaths: stored.hiddenCalendarPaths.map(
                                (path) =>
                                    path === calendar.relativePath
                                        ? nextPath
                                        : path
                            ),
                        };
                    });
                } else {
                    await persistPreferences((stored) => ({
                        ...stored,
                        externalCalendars: stored.externalCalendars.map(
                            (source) =>
                                externalCalendarId(source) === calendarId
                                    ? { ...source, name: trimmedName }
                                    : source
                        ),
                    }));
                }
                await reloadWorkspace();
            } catch (reason) {
                setStorageError(errorMessage(reason));
            } finally {
                setIsSaving(false);
            }
        },
        [calendarById, dataFolder, persistPreferences, reloadWorkspace]
    );

    const removeCalendar = useCallback(async (calendarId: string) => {
        setCalendarToDelete(calendarId);
    }, []);

    const confirmRemoveCalendar = useCallback(async () => {
        if (!calendarToDelete) return;
        const calendar = calendarById.get(calendarToDelete);
        if (!calendar) return;
        setIsSaving(true);
        setStorageError(null);
        try {
            if (calendar.editable && calendar.type === "local") {
                await deleteDesktopCalendarFolder(
                    dataFolder,
                    calendar.relativePath
                );
            } else {
                await persistPreferences((stored) => {
                    const source = stored.externalCalendars.find(
                        (candidate) =>
                            externalCalendarId(candidate) === calendar.id
                    );
                    const archivePath =
                        source?.type === "ical" && hasIcalDirectory(source)
                            ? source.directory
                            : null;
                    const nextColors = { ...stored.colors };
                    const previousColor =
                        nextColors[calendar.relativePath] ?? calendar.color;
                    delete nextColors[calendar.relativePath];
                    if (archivePath) nextColors[archivePath] = previousColor;

                    const remap = (values: string[]) => [
                        ...new Set(
                            values.flatMap((key) =>
                                key === calendar.relativePath
                                    ? archivePath
                                        ? [archivePath]
                                        : []
                                    : [key]
                            )
                        ),
                    ];
                    return {
                        ...stored,
                        colors: nextColors,
                        order: remap(stored.order),
                        hiddenCalendarPaths: remap(stored.hiddenCalendarPaths),
                        externalCalendars: stored.externalCalendars.filter(
                            (candidate) =>
                                externalCalendarId(candidate) !== calendar.id
                        ),
                    };
                });
            }
            await reloadWorkspace();
        } catch (reason) {
            const message = errorMessage(reason);
            setStorageError(message);
            throw new Error(message);
        } finally {
            setIsSaving(false);
        }
    }, [
        calendarById,
        calendarToDelete,
        dataFolder,
        persistPreferences,
        reloadWorkspace,
    ]);

    const changeColor = useCallback(
        (calendarId: string, color: string) => {
            const calendar = calendarById.get(calendarId);
            if (!calendar) return;
            setCalendars((current) =>
                current.map((item) =>
                    item.id === calendarId ? { ...item, color } : item
                )
            );
            void persistPreferences((current) => ({
                ...current,
                colors: {
                    ...current.colors,
                    [calendar.relativePath]: color,
                },
                externalCalendars: current.externalCalendars.map((source) =>
                    externalCalendarId(source) === calendarId
                        ? { ...source, color }
                        : source
                ),
            }));
        },
        [calendarById, persistPreferences]
    );

    const reorderCalendars = useCallback(
        (orderedIds: string[]) => {
            const byId = new Map<string, DesktopCalendarModel>(
                calendars.map((calendar) => [calendar.id, calendar])
            );
            const ordered: DesktopCalendarModel[] = orderedIds.flatMap((id) => {
                const calendar = byId.get(id);
                if (!calendar) return [];
                byId.delete(id);
                return [calendar];
            });
            ordered.push(...byId.values());
            setCalendars(ordered);
            void persistPreferences((current) => ({
                ...current,
                order: ordered.map((calendar) => calendar.relativePath),
            }));
        },
        [calendars, persistPreferences]
    );

    const actionTargetIds = useCallback((): string[] => {
        if (selectedIds.size > 0) return [...selectedIds];
        if (panelEventId) return [panelEventId];
        return [];
    }, [panelEventId, selectedIds]);

    const copyEvent = useCallback((eventId: string) => {
        const record = findStoredEvent(recordsRef.current, eventId);
        if (!record) return;
        setClipboard({
            event: record.event,
            mode: "copy",
            sourceEventId: eventId,
            sourceCalendarId: record.calendarId,
        });
    }, []);

    const cutEvent = useCallback((eventId: string) => {
        const record = findStoredEvent(recordsRef.current, eventId);
        if (!record) return;
        setClipboard({
            event: record.event,
            mode: record.readOnly ? "copy" : "cut",
            sourceEventId: eventId,
            sourceCalendarId: record.calendarId,
        });
    }, []);

    const pasteEvent = useCallback(
        async (targetDate: Date, allDay?: boolean) => {
            if (!clipboard) return;
            const pasted = eventToPaste(clipboard.event, allDay) as NeoEvent & {
                date?: string;
            };
            pasted.date = formatLocalDate(targetDate);
            const sourceCalendar = calendarById.get(clipboard.sourceCalendarId);
            const targetCalendarId = sourceCalendar?.editable
                ? sourceCalendar.id
                : activeCalendarId();
            if (!targetCalendarId) return;
            await addEvent(targetCalendarId, pasted);
            if (clipboard.mode === "cut") {
                if (
                    cutMayDeleteSource(
                        findStoredEvent(
                            recordsRef.current,
                            clipboard.sourceEventId
                        )?.event ?? null,
                        clipboard.sourceEventId
                    )
                ) {
                    await deleteEvents([clipboard.sourceEventId], false);
                }
                setClipboard(null);
            }
        },
        [activeCalendarId, addEvent, calendarById, clipboard, deleteEvents]
    );

    const duplicateEvent = useCallback(
        async (eventId: string) => {
            const record = findStoredEvent(recordsRef.current, eventId);
            if (!record) return;
            const duplicate = { ...record.event } as NeoEvent & {
                id?: string;
            };
            delete duplicate.id;
            const sourceCalendar = calendarById.get(record.calendarId);
            const targetCalendarId = sourceCalendar?.editable
                ? sourceCalendar.id
                : activeCalendarId();
            if (!targetCalendarId) return;
            await addEvent(targetCalendarId, duplicate);
        },
        [activeCalendarId, addEvent, calendarById]
    );

    const duplicateTargets = useCallback(async () => {
        for (const id of actionTargetIds()) await duplicateEvent(id);
    }, [actionTargetIds, duplicateEvent]);

    const deleteTargets = useCallback(async () => {
        await requestDeleteEvents(actionTargetIds());
    }, [actionTargetIds, requestDeleteEvents]);

    const contextItems = useMemo<ContextMenuItem[]>(() => {
        if (!contextMenu) return [];

        if (contextMenu.type === "empty") {
            const base: ContextMenuItem[] = [
                {
                    label: t("Create event"),
                    shortcut: "C",
                    onClick: () => {
                        const start = new Date(contextMenu.date);
                        openDraft(
                            start,
                            new Date(start.getTime() + 30 * 60_000),
                            false
                        );
                    },
                },
                {
                    label: t("Paste event"),
                    shortcut: "Ctrl+V",
                    disabled: clipboard === null,
                    onClick: () => void pasteEvent(contextMenu.date),
                },
            ];
            if (selectedIds.size === 0) return base;
            const count = selectedIds.size;
            return [
                {
                    label: countedLabel("Duplicate", count),
                    icon: <DuplicateIcon />,
                    onClick: () => void duplicateTargets(),
                },
                { label: "", separator: true, onClick: () => undefined },
                {
                    label: countedLabel("Delete", count),
                    shortcut: "delete",
                    danger: true,
                    icon: <TrashIcon />,
                    onClick: () => void deleteTargets(),
                },
                { label: "", separator: true, onClick: () => undefined },
                ...base,
            ];
        }

        const record = findStoredEvent(recordsRef.current, contextMenu.eventId);
        if (!record) return [];
        const selectedCount = selectedIds.has(record.id) ? selectedIds.size : 0;
        if (record.readOnly) {
            return [
                {
                    label: t("Copy"),
                    shortcut: "Ctrl C",
                    icon: <CopyIcon />,
                    onClick: () => copyEvent(contextMenu.eventId),
                },
                {
                    label: t("Duplicate to default calendar"),
                    shortcut: "Ctrl D",
                    icon: <DuplicateIcon />,
                    onClick: () => void duplicateEvent(contextMenu.eventId),
                },
                ...(hasPhysicalEventNote(record)
                    ? [
                          {
                              label: t("Go to note"),
                              icon: <FileTextIcon />,
                              onClick: () =>
                                  void openDesktopPath(
                                      dataFolder,
                                      record.relativePath
                                  ),
                          },
                      ]
                    : []),
            ];
        }
        return [
            {
                label: t("Cut"),
                shortcut: "Ctrl X",
                icon: <ScissorsIcon />,
                onClick: () => cutEvent(contextMenu.eventId),
            },
            {
                label: t("Copy"),
                shortcut: "Ctrl C",
                icon: <CopyIcon />,
                onClick: () => copyEvent(contextMenu.eventId),
            },
            {
                label: countedLabel("Duplicate", selectedCount),
                shortcut: "Ctrl D",
                icon: <DuplicateIcon />,
                onClick: () =>
                    void (selectedCount > 1
                        ? duplicateTargets()
                        : duplicateEvent(contextMenu.eventId)),
            },
            { label: "", separator: true, onClick: () => undefined },
            {
                label: t("Go to note"),
                icon: <FileTextIcon />,
                onClick: () =>
                    void openDesktopPath(dataFolder, record.relativePath),
            },
            { label: "", separator: true, onClick: () => undefined },
            {
                label: countedLabel("Delete", selectedCount),
                shortcut: "delete",
                danger: true,
                icon: <TrashIcon />,
                onClick: () =>
                    void (selectedCount > 1
                        ? deleteTargets()
                        : requestDeleteEvents([contextMenu.eventId])),
            },
        ];
    }, [
        clipboard,
        contextMenu,
        copyEvent,
        cutEvent,
        dataFolder,
        deleteTargets,
        requestDeleteEvents,
        duplicateEvent,
        duplicateTargets,
        openDraft,
        pasteEvent,
        selectedIds,
    ]);

    const toggleAllDayCollapsed = useCallback(() => {
        setAllDayCollapsed((current) => {
            const next = !current;
            void persistPreferences((stored) => ({
                ...stored,
                allDayCollapsed: next,
            }));
            return next;
        });
    }, [persistPreferences]);

    const toggleSidebar = useCallback(() => {
        setSidebarVisible((current) => {
            const next = !current;
            // The Android drawer is a per-session state: persisting it would
            // fight with the desktop value inside the shared preference file.
            if (!isAndroid) {
                void persistPreferences((stored) => ({
                    ...stored,
                    sidebarVisible: next,
                }));
            }
            return next;
        });
    }, [isAndroid, persistPreferences]);

    const changeView = useCallback(
        (next: ViewType) => {
            setViewType(next);
            if (isAndroid) {
                saveAndroidNavigation(next, dayCount);
                return;
            }
            void persistPreferences((stored) => ({
                ...stored,
                viewType: next,
            }));
        },
        [dayCount, isAndroid, persistPreferences, setViewType]
    );

    const changeDayCount = useCallback(
        (next: number) => {
            const normalized = Math.max(1, Math.min(60, Math.round(next)));
            setDaysCount(normalized);
            if (isAndroid) {
                saveAndroidNavigation("days", normalized);
                return;
            }
            void persistPreferences((stored) => ({
                ...stored,
                dayCount: normalized,
            }));
        },
        [isAndroid, persistPreferences, setDaysCount]
    );

    const updateWorkspacePreferences = useCallback(
        async (patch: Partial<DesktopWorkspacePreferences>) => {
            const firstDayChanged =
                patch.firstDay !== undefined &&
                patch.firstDay !== preferences.firstDay;
            if (patch.secondaryTimezones) {
                setSecondaryTimezones(patch.secondaryTimezones);
            }
            await persistPreferences((stored) => ({ ...stored, ...patch }));
            if (firstDayChanged) {
                requestAnimationFrame(() => setViewType(viewType));
            }
        },
        [persistPreferences, preferences.firstDay, setViewType, viewType]
    );
    updatePreferencesRef.current = updateWorkspacePreferences;

    /*
     * Hand the reminders to the phone.
     *
     * Rewritten whole on every change rather than diffed: the list is small,
     * and working out which alarms an edit invalidated is exactly the kind of
     * bookkeeping that ends with a reminder for an event that no longer exists.
     */
    /*
     * Every event of the coming month, whatever the grid happens to show.
     *
     * The visible events are the wrong list to remind from: they follow the
     * view, so a reminder set on an event three weeks out would only be armed
     * once you scrolled to it.
     */
    const reminderEvents = useMemo(() => {
        const from = new Date();
        const to = addDays(from, REMINDER_HORIZON_DAYS);
        return storedEvents.flatMap((record) => {
            if (
                record.event.type === "someday" ||
                hiddenCalendars.has(record.calendarId)
            ) {
                return [];
            }
            const calendar = calendarById.get(record.calendarId);
            if (!calendar) return [];
            return neoEventToDisplayEvents(
                record.event,
                record.id,
                calendar.id,
                calendar.name,
                calendar.color,
                calendar.editable,
                from,
                to
            );
        });
    }, [calendarById, hiddenCalendars, storedEvents]);

    /* Windows has no alarm to hand the list to, so the app keeps it and
       watches the clock while it is open. */
    useEffect(() => {
        if (isAndroid) return;
        const scheduler = createReminderScheduler(
            (reminder) => void postReminder(reminder)
        );
        reminderSchedulerRef.current = scheduler;
        return () => {
            scheduler.stop();
            reminderSchedulerRef.current = null;
        };
    }, [isAndroid]);

    useEffect(() => {
        const reminders = buildReminders({
            events: reminderEvents,
            now: new Date(),
            minutesBefore: preferences.reminderMinutes,
            timeFormat24h: preferences.timeFormat24h,
        });

        if (isAndroid) {
            void invoke("write_reminders", {
                payload: JSON.stringify(reminders),
            }).catch(() => {
                // A reminder that failed to schedule is not worth
                // interrupting for.
            });
            return;
        }

        // Asked for only once there is something to post, so opening the app
        // on an empty calendar never raises the question.
        if (reminders.length > 0) void ensureNotificationPermission();
        reminderSchedulerRef.current?.set(reminders);
    }, [
        isAndroid,
        preferences.reminderMinutes,
        preferences.timeFormat24h,
        reminderEvents,
    ]);

    /*
     * Keep the home-screen widget in step.
     *
     * It is written on every change rather than on a timer: the cost is a
     * single small JSON write, and anything less means a widget that shows an
     * event the calendar no longer has. The activity redraws the placed
     * widgets itself once the payload has landed.
     */
    useEffect(() => {
        if (!isAndroid) return;
        const payload = buildWidgetPayload({
            events: displayEvents,
            now: new Date(),
            timeFormat24h: preferences.timeFormat24h,
            theme: readWidgetTheme(),
        });
        void invoke("write_widget_events", {
            payload: JSON.stringify(payload),
        }).catch(() => {
            // A widget that failed to refresh is not worth interrupting for.
        });
    }, [displayEvents, isAndroid, preferences.timeFormat24h]);

    /*
     * A tap on the widget lands here.
     *
     * The activity fires this once the page is up — including when the widget
     * started the app from cold, where the tap arrives before there is anything
     * to hear it. Opening the event it names, or a new one for the "+".
     */
    useEffect(() => {
        if (!isAndroid) return;
        const onRoute = (event: Event) => {
            const detail = (event as CustomEvent).detail as
                | { type?: string; eventId?: string }
                | undefined;
            if (!detail) return;
            if (detail.type === "new-event") {
                openNewEvent();
                return;
            }
            if (detail.type === "event" && detail.eventId) {
                openExistingEvent(detail.eventId);
            }
        };
        window.addEventListener("neo-calendar-widget-route", onRoute);
        return () =>
            window.removeEventListener("neo-calendar-widget-route", onRoute);
    }, [isAndroid, openExistingEvent, openNewEvent]);

    const settingsCalendars = useMemo(
        () =>
            calendars.map((calendar) => ({
                id: calendar.id,
                name: calendar.name,
                color: calendar.color,
                hidden: hiddenCalendars.has(calendar.id),
                isDefault:
                    calendar.editable && calendar.id === defaultCalendarId,
                type: calendar.type,
                editable: calendar.editable,
                icon: calendar.icon,
            })),
        [calendars, defaultCalendarId, hiddenCalendars]
    );

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            const editing =
                target?.tagName === "INPUT" ||
                target?.tagName === "TEXTAREA" ||
                target?.tagName === "SELECT" ||
                target?.isContentEditable;
            if (editing) return;

            const claim = () => {
                event.preventDefault();
                event.stopImmediatePropagation();
            };
            const targets = actionTargetIds();

            if (event.ctrlKey || event.metaKey) {
                switch (event.key.toLowerCase()) {
                    case "c":
                        if (targets[0]) {
                            claim();
                            copyEvent(targets[0]);
                        }
                        return;
                    case "x":
                        if (targets[0]) {
                            claim();
                            cutEvent(targets[0]);
                        }
                        return;
                    case "v":
                        if (clipboard) {
                            claim();
                            void pasteEvent(currentDate);
                        }
                        return;
                    case "d":
                        claim();
                        void duplicateTargets();
                        return;
                    case "z":
                        if (deletedBatch.length) {
                            claim();
                            void undoLastDeletion();
                        }
                        return;
                    case "k":
                        claim();
                        setCommandPaletteVisible(true);
                        return;
                }
                return;
            }

            if (event.altKey) return;
            if (event.key === "Delete" || event.key === "Backspace") {
                if (targets.length) {
                    claim();
                    void deleteTargets();
                }
                return;
            }

            switch (event.key.toLowerCase()) {
                case "t":
                    claim();
                    if (event.shiftKey) goToday();
                    else alignToday();
                    break;
                case "j":
                case "]":
                    claim();
                    goNext();
                    break;
                case "k":
                case "[":
                    claim();
                    goPrev();
                    break;
                case "d":
                    claim();
                    changeView("day");
                    break;
                case "w":
                    claim();
                    changeView("week");
                    break;
                case "m":
                    claim();
                    changeView("month");
                    break;
                case "l":
                    claim();
                    changeView("list");
                    break;
                case "3":
                    claim();
                    changeView("3days");
                    break;
                case "c":
                case "n":
                    claim();
                    openNewEvent();
                    break;
                case "b":
                case ".": {
                    claim();
                    toggleSidebar();
                    break;
                }
                case "/":
                    claim();
                    setCommandPaletteVisible(true);
                    break;
            }
        };
        window.addEventListener("keydown", onKeyDown, true);
        return () => window.removeEventListener("keydown", onKeyDown, true);
    }, [
        actionTargetIds,
        alignToday,
        changeView,
        clipboard,
        copyEvent,
        currentDate,
        cutEvent,
        deleteTargets,
        deletedBatch.length,
        duplicateTargets,
        goNext,
        goPrev,
        goToday,
        openNewEvent,
        pasteEvent,
        toggleSidebar,
        undoLastDeletion,
    ]);

    return (
        <section
            ref={calendarRootRef}
            className="nc-desktop-calendar"
            data-view={viewType}
        >
            <SyncingFeedsContext.Provider value={syncingIcsFeedIds}>
            <CalendarLayout
                currentDate={currentDate}
                viewType={viewType}
                onViewTypeChange={changeView}
                dayCount={dayCount}
                onSetDayCount={changeDayCount}
                showWeekNumbers={showWeekNumbers}
                onToggleWeekNumbers={() => {
                    const next = !showWeekNumbers;
                    setShowWeekNumbers(next);
                    void persistPreferences((stored) => ({
                        ...stored,
                        showWeekNumbers: next,
                    }));
                }}
                onGoPrev={goPrev}
                onGoNext={goNext}
                onGoToday={goToday}
                onOpenSettings={() => setSettingsOpen(true)}
                onShiftDays={shiftDays}
                onShiftMonths={shiftMonths}
                onNewEvent={() => openNewEvent()}
                events={displayEvents}
                calendarSources={calendarSources}
                visibleDates={visibleDates}
                firstDay={preferences.firstDay}
                timeFormat24h={preferences.timeFormat24h}
                // Paged scrolling was tuned for a swipe's momentum on a
                // touch panel: free scroll is the only mode that reads right
                // under a mouse wheel or a trackpad, so the desktop build
                // never pages regardless of what a synced device wrote here.
                // Le telephone, lui, garde le choix — c'est son geste qui a
                // deux lectures possibles, et le reglage existe pour lui
                // (voir DesktopSettings, ou la ligne n'apparait que la).
                freeScroll={isAndroid ? preferences.freeScroll : true}
                prayerLines={prayerLines}
                prayerColor={prayerLineColor}
                sidebarVisible={sidebarVisible}
                onToggleSidebar={toggleSidebar}
                onEventClick={selectEvent}
                onEventDrag={handleEventDrag}
                onEventResize={handleEventResize}
                onSelectRange={(start: Date, end: Date, allDay: boolean) => {
                    setSelectedIds(new Set());
                    openDraft(start, end, allDay);
                }}
                onMonthDayClick={(date: Date) => {
                    setSelectedIds(new Set());
                    if (preferences.clickToCreateEventFromMonthView) {
                        openDraft(date, date, true);
                    } else {
                        setCurrentDate(date);
                        changeView("day");
                    }
                }}
                onContextMenu={(eventId: string, mouseEvent: MouseEvent) => {
                    mouseEvent.preventDefault();
                    setContextLine(null);
                    setContextMenu({
                        type: "event",
                        eventId,
                        x: mouseEvent.clientX,
                        y: mouseEvent.clientY,
                    });
                }}
                onEmptyContextMenu={(date: Date, mouseEvent: MouseEvent) => {
                    mouseEvent.preventDefault();
                    setContextMenu({
                        type: "empty",
                        date,
                        x: mouseEvent.clientX,
                        y: mouseEvent.clientY,
                    });
                    setContextLine({
                        date,
                        top: getEventTop(date, startOfDay(date)),
                    });
                }}
                contextLine={contextLine}
                onToggleTask={toggleTask}
                onDateSelect={setCurrentDate}
                hiddenCalendars={hiddenCalendars}
                onToggleCalendar={toggleCalendar}
                defaultCalendarId={defaultCalendarId}
                soloCalendarId={soloCalendarId}
                onSetDefaultCalendar={setDefaultCalendar}
                onShowOnly={showOnlyCalendar}
                tasks={tasks}
                today={today}
                onAddTask={() => void createSomeday()}
                onQuickAdd={(partial: Partial<NeoEvent>) =>
                    void quickAdd(partial)
                }
                onOpenSearch={() => setCommandPaletteVisible(true)}
                onAddCalendar={() => void addCalendar()}
                onRenameCalendar={renameCalendar}
                onEditCalendarLink={(calendarId: string) => {
                    const source = preferences.externalCalendars.find(
                        (candidate) =>
                            externalCalendarId(candidate) === calendarId
                    );
                    if (source?.type === "ical") {
                        setStorageError(
                            `To change “${source.name}”, remove it and add the new feed URL.`
                        );
                    }
                }}
                onManageIcsFeeds={(calendarId: string) =>
                    setIcsFeedsPanelCalendarId(calendarId)
                }
                onManagePrayerTimes={(calendarId: string) =>
                    setPrayerDialogCalendarId(calendarId)
                }
                panelIcsFeeds={panelIcsFeeds}
                onDeleteCalendar={(calendarId: string) =>
                    void removeCalendar(calendarId)
                }
                onColorChange={changeColor}
                onReorderCalendars={reorderCalendars}
                onOpenCalendarFolder={(calendarId: string) => {
                    const calendar = calendarById.get(calendarId);
                    if (calendar?.editable && calendar.type === "local") {
                        void openDesktopPath(dataFolder, calendar.relativePath);
                        return;
                    }
                    const source = preferences.externalCalendars.find(
                        (candidate) =>
                            externalCalendarId(candidate) === calendarId
                    );
                    if (source?.type === "ical" && hasIcalDirectory(source)) {
                        void openDesktopPath(dataFolder, source.directory);
                    }
                }}
                onOpenRootFolder={() => void openDesktopPath(dataFolder)}
                onCalendarClick={(calendarId: string) => {
                    /*
                     * The same everywhere now: the row opens the calendar's
                     * events, the swatch beside it sets the default.
                     *
                     * This used to divert to the default on Android, because
                     * the panel was a second column whose close button ended up
                     * under the status bar — a list with no way out. It slides
                     * in over the drawer there instead, clear of the status bar
                     * and leaving a strip of calendar that closes it.
                     *
                     * The drawer stays open BEHIND it, which is what makes the
                     * panel a step forward rather than a change of screen:
                     * pushing it back off the same edge uncovers the list the
                     * calendar was picked from, still where it was left.
                     */
                    setSelectedCalendarId(
                        selectedCalendarId !== calendarId ? calendarId : null
                    );
                }}
                selectedCalendar={selectedCalendar}
                panelEvents={panelEvents}
                onAddPanelEvent={(calendarId: string) =>
                    void addPanelEvent(calendarId)
                }
                onCloseEventsPanel={() => setSelectedCalendarId(null)}
                onPanelEventClick={selectEvent}
                secondaryTimezones={secondaryTimezones}
                onAddTimezone={(timezone: string) => {
                    const next = secondaryTimezones.includes(timezone)
                        ? secondaryTimezones
                        : [...secondaryTimezones, timezone];
                    setSecondaryTimezones(next);
                    void persistPreferences((stored) => ({
                        ...stored,
                        secondaryTimezones: next,
                    }));
                }}
                onRemoveTimezone={(timezone: string) => {
                    const next = secondaryTimezones.filter(
                        (item) => item !== timezone
                    );
                    setSecondaryTimezones(next);
                    void persistPreferences((stored) => ({
                        ...stored,
                        secondaryTimezones: next,
                    }));
                }}
                allDayCollapsed={allDayCollapsed}
                onToggleAllDayCollapsed={toggleAllDayCollapsed}
                draftSlot={draftSlot}
                draftColor={
                    calendarById.get(draftSlot?.calendarId ?? defaultCalendarId)
                        ?.color ?? "var(--nc-accent)"
                }
                onResizeDraft={(range) =>
                    setDraftSlot((current) =>
                        current
                            ? {
                                  ...current,
                                  start: range.start,
                                  end: range.end,
                              }
                            : current
                    )
                }
                panelPreview={panelPreview}
                onPanelDragTarget={handlePanelDragTarget}
                onPanelDrop={(
                    event: DisplayEvent,
                    start: Date,
                    end: Date,
                    allDay: boolean
                ) => {
                    setPanelPreview(null);
                    void handleEventDrag(event.id, start, end, allDay);
                }}
                onEventUnschedule={handleEventUnschedule}
            />
            </SyncingFeedsContext.Provider>

            <CommandPalette
                visible={commandPaletteVisible}
                onDismiss={() => setCommandPaletteVisible(false)}
                events={[...displayEvents, ...somedayEvents]}
                onEventSelect={openExistingEvent}
                onViewChange={changeView}
                onGoToday={goToday}
                onCreateEvent={() => openNewEvent()}
                onToggleSidebar={toggleSidebar}
                timeFormat24h={preferences.timeFormat24h}
            />

            <EventPanel
                visible={
                    panelEventId !== null ||
                    draftSlot !== null ||
                    committingDraft
                }
                eventId={panelEventId}
                draft={
                    draftSlot && !committingDraft
                        ? {
                              start: draftSlot.start,
                              end: draftSlot.end,
                              allDay: draftSlot.allDay,
                              defaultAsTask: preferences.defaultEventsAsTasks,
                          }
                        : null
                }
                committingDraft={committingDraft}
                anchorRect={panelAnchor}
                cache={cache}
                timeFormat24h={preferences.timeFormat24h}
                calendars={calendarSources.map((calendar) => ({
                    id: calendar.id,
                    name: calendar.name,
                    color: calendar.color,
                    type: calendar.type,
                }))}
                defaultCalendarId={draftSlot?.calendarId ?? defaultCalendarId}
                requireTaskDateForCompletion={!isAndroidRuntime()}
                onClose={() => {
                    setPanelEventId(null);
                    setPanelAnchor(null);
                    setDraftSlot(null);
                }}
                onDraftCommit={(
                    title: string,
                    updates?: Partial<NeoEvent>,
                    calendarId?: string
                ) => void commitDraft(title, updates, calendarId)}
                onOpenFile={(eventId: string) => {
                    const record = findStoredEvent(recordsRef.current, eventId);
                    if (record && hasPhysicalEventNote(record)) {
                        void openDesktopPath(dataFolder, record.relativePath);
                    }
                }}
                onCopyFilePath={async (eventId: string) => {
                    const record = findStoredEvent(recordsRef.current, eventId);
                    if (!record || !hasPhysicalEventNote(record)) {
                        throw new Error("The event note is unavailable.");
                    }
                    try {
                        await copyDesktopPath(dataFolder, record.relativePath);
                    } catch (reason) {
                        setStorageError(errorMessage(reason));
                        throw reason;
                    }
                }}
                onDelete={(eventId: string) =>
                    void requestDeleteEvents([eventId])
                }
                firstDay={preferences.firstDay}
                linkVaults={linkedVaults.map((path) => ({
                    path,
                    name: folderName(path),
                }))}
                onSearchEventLinks={searchEventLinks}
                onFetchPage={fetchDesktopPage}
                onResolveUrl={resolveDesktopUrl}
                linkedItems={panelLinkedItems}
                onAddEventLink={appendEventBody}
                onRemoveEventLink={removeEventBodyLink}
                onRenameEventLink={renameEventBodyLink}
                linkAddress={panelLinkAddress}
                travelMode={preferences.mapsTravelMode}
                onOpenLocation={(url) => {
                    void openDesktopExternalTarget(url).catch((reason) =>
                        setStorageError(errorMessage(reason))
                    );
                }}
                onOpenEventLink={async (item: EventLinkedItem) => {
                    try {
                        if (item.kind === "attachment") {
                            const record = panelEventId
                                ? findStoredEvent(
                                      recordsRef.current,
                                      panelEventId
                                  )
                                : null;
                            if (!record || record.readOnly) {
                                throw new Error(
                                    "The attachment source event is unavailable."
                                );
                            }
                            await openDesktopLinkedPath(
                                dataFolder,
                                record.relativePath,
                                item.target
                            );
                        } else {
                            await openDesktopExternalTarget(item.target);
                        }
                    } catch (reason) {
                        setStorageError(errorMessage(reason));
                    }
                }}
                onCopyEventLink={writeDesktopClipboardText}
                /* Dupliquer n'avait aucune porte sur telephone : ni clic
                   droit, ni clavier, et le menu du panneau reservait bien une
                   entree pour lui sans jamais la recevoir. */
                onDuplicate={(id: string) => void duplicateEvent(id)}
                onPickEventAttachment={pickEventAttachments}
                onPasteEventAttachment={pasteEventAttachment}
                onReadEventAttachment={readEventAttachment}
            />

            <ContextMenu
                visible={contextMenu !== null}
                x={contextMenu?.x ?? 0}
                y={contextMenu?.y ?? 0}
                items={contextItems}
                onDismiss={() => {
                    setContextMenu(null);
                    setContextLine(null);
                }}
            />

            {/* The local-folder loading notice stays removed: the calendar is
                already usable while the folder is read. An ICS sync is
                different — it is network-bound and can run long enough on a
                first sync that its absence read as a hang, so it gets its
                own (dismiss-free, no error styling) notice. */}
            {storageError ? (
                <div
                    className="nc-desktop-storage-status nc-desktop-storage-status--error"
                    role="alert"
                >
                    {storageError}
                    <button
                        type="button"
                        aria-label={t("Dismiss error")}
                        onClick={() => setStorageError(null)}
                    >
                        ×
                    </button>
                </div>
            ) : (
                syncingIcsFeedIds.size > 0 && (
                    <div className="nc-desktop-notice" role="status">
                        {t("Loading remote calendars…")}
                    </div>
                )
            )}

            {marquee && (
                <div
                    className="nc-marquee"
                    style={{
                        position: "absolute",
                        left: Math.min(marquee.x0, marquee.x1),
                        top: Math.min(marquee.y0, marquee.y1),
                        width: Math.abs(marquee.x1 - marquee.x0),
                        height: Math.abs(marquee.y1 - marquee.y0),
                    }}
                />
            )}

            <DesktopSettings
                open={settingsOpen}
                dataFolder={dataFolder}
                vaultFolders={vaultFolders}
                detectedVaults={detectedVaults}
                disabledVaults={disabledVaults}
                isChoosingVaultFolder={isChoosingVaultFolder}
                isScanningVaults={isScanningVaults}
                preferences={preferences}
                calendars={settingsCalendars}
                misfiledEventCount={misfiledEvents.length}
                onConvertMisfiledEvents={convertMisfiledEvents}
                onPreferencesChange={updateWorkspacePreferences}
                onClose={() => {
                    setSettingsOpen(false);
                    // Leaving the settings lands on the grid, not back on the
                    // drawer that opened them: on a phone the drawer covers the
                    // calendar, so closing the settings would otherwise reveal
                    // a menu nobody asked for a second time.
                    if (isAndroid) setSidebarVisible(false);
                }}
                onChangeDataFolder={onChangeDataFolder}
                onOpenDataFolder={() => openDesktopPath(dataFolder)}
                onAddVaultFolder={onAddVaultFolder}
                onRemoveVaultFolder={onRemoveVaultFolder}
                onSetVaultEnabled={onSetVaultEnabled}
                onAddCalendar={() => {
                    setSettingsOpen(false);
                    if (isAndroid) setSidebarVisible(false);
                    setAddCalendarOpen(true);
                }}
                onRenameCalendar={renameCalendar}
                onDeleteCalendar={removeCalendar}
                onToggleCalendar={toggleCalendar}
                onSetDefaultCalendar={setDefaultCalendar}
                onCalendarColorChange={changeColor}
                themeId={themeId}
                onThemeChange={onThemeChange}
            />

            <AddCalendarDialog
                open={addCalendarOpen}
                rootFolder={dataFolder}
                existingNames={calendars.map((calendar) => calendar.name)}
                onClose={() => setAddCalendarOpen(false)}
                onCreate={createCalendar}
            />

            <PrayerMosqueDialog
                open={prayerDialogCalendarId !== null}
                calendarName={
                    (prayerDialogCalendarId
                        ? calendarById.get(prayerDialogCalendarId)?.name
                        : undefined) ?? ""
                }
                mosqueId={
                    (prayerDialogCalendarId
                        ? preferences.prayerMosques[
                              calendarById.get(prayerDialogCalendarId)
                                  ?.relativePath ?? ""
                          ]
                        : undefined) ?? null
                }
                color={
                    (prayerDialogCalendarId
                        ? preferences.prayerColors[
                              calendarById.get(prayerDialogCalendarId)
                                  ?.relativePath ?? ""
                          ]
                        : undefined) ?? null
                }
                calendarColor={
                    (prayerDialogCalendarId
                        ? calendarById.get(prayerDialogCalendarId)?.color
                        : undefined) ?? "#4ca8df"
                }
                onColorChange={(hex) => {
                    const path = prayerDialogCalendarId
                        ? calendarById.get(prayerDialogCalendarId)?.relativePath
                        : undefined;
                    if (!path) return;
                    // Retirer l'entree plutot que d'y ecrire la couleur du
                    // calendrier : figer une copie ferait cesser les traits de
                    // le suivre le jour ou il change de couleur.
                    const next = { ...preferences.prayerColors };
                    if (hex === null) delete next[path];
                    else next[path] = hex;
                    void updateWorkspacePreferences({ prayerColors: next });
                }}
                onClose={() => setPrayerDialogCalendarId(null)}
                onChoose={(mosqueId) => {
                    const path = prayerDialogCalendarId
                        ? calendarById.get(prayerDialogCalendarId)?.relativePath
                        : undefined;
                    if (!path) return;
                    // Retirer l'entree plutot que d'y ecrire une chaine vide :
                    // le fichier de preferences ne garde ainsi que les
                    // calendriers qui suivent vraiment une mosquee.
                    void updateWorkspacePreferences({
                        prayerMosques: Object.fromEntries(
                            Object.entries({
                                ...preferences.prayerMosques,
                                [path]: mosqueId ?? "",
                            }).filter(([, value]) => value !== "")
                        ),
                    });
                }}
            />

            <IcsFeedsPanel
                open={icsFeedsPanelCalendarId !== null}
                calendarId={icsFeedsPanelCalendarId ?? ""}
                calendarName={
                    (icsFeedsPanelCalendarId &&
                        calendarById.get(icsFeedsPanelCalendarId)?.name) ??
                    ""
                }
                feeds={preferences.icsFeeds.filter(
                    (feed) =>
                        feed.calendarPath ===
                        (icsFeedsPanelCalendarId
                            ? calendarById.get(icsFeedsPanelCalendarId)
                                  ?.relativePath
                            : undefined)
                )}
                runtimeStates={icsRuntimeStates}
                syncingFeedIds={syncingIcsFeedIds}
                defaultRefreshMinutes={preferences.icsDefaultRefreshMinutes}
                onClose={() => setIcsFeedsPanelCalendarId(null)}
                onAdd={(name, url, refreshMinutes) => {
                    const calendarPath = icsFeedsPanelCalendarId
                        ? calendarById.get(icsFeedsPanelCalendarId)
                              ?.relativePath
                        : undefined;
                    if (!calendarPath) return;
                    const feed: IcsFeedSubscription = {
                        id: internalEventId(),
                        calendarPath,
                        name,
                        url,
                        active: true,
                        ...(refreshMinutes ? { refreshMinutes } : {}),
                    };
                    void updateWorkspacePreferences({
                        icsFeeds: [...preferences.icsFeeds, feed],
                    });
                }}
                onEdit={(feedId, patch) => {
                    void updateWorkspacePreferences({
                        icsFeeds: preferences.icsFeeds.map((feed) => {
                            if (feed.id !== feedId) return feed;
                            const next = { ...feed, ...patch };
                            // Une adresse effacee se retire, plutot que de
                            // laisser une chaine vide dans le fichier.
                            if (next.address !== undefined && !next.address) {
                                delete next.address;
                            }
                            return next;
                        }),
                    });
                }}
                onRemove={(feedId) => {
                    void updateWorkspacePreferences({
                        icsFeeds: preferences.icsFeeds.filter(
                            (feed) => feed.id !== feedId
                        ),
                    });
                }}
                onRefreshNow={(feedId) => {
                    void refreshIcsFeeds({ forcedIds: new Set([feedId]) });
                }}
            />

            <RecurringDeleteDialog
                open={recurringDeleteId !== null}
                isTask={recurringDeleteIsTask}
                onClose={() => setRecurringDeleteId(null)}
                onDeleteOccurrence={() => {
                    const target = recurringDeleteId;
                    setRecurringDeleteId(null);
                    if (target) void applyRecurringDelete(target, false);
                }}
                onDeleteFollowing={() => {
                    const target = recurringDeleteId;
                    setRecurringDeleteId(null);
                    if (target) void applyRecurringDelete(target, true);
                }}
            />

            <ConfirmDialog
                open={calendarToDelete !== null}
                title={t("Delete calendar")}
                message={
                    calendarToDelete
                        ? calendarById.get(calendarToDelete)?.editable
                            ? `${t("Remove the empty calendar folder")} “${
                                  calendarById.get(calendarToDelete)?.name ??
                                  t("Calendar")
                              }”?`
                            : `${t("Remove the read-only calendar")} “${
                                  calendarById.get(calendarToDelete)?.name ??
                                  t("Calendar")
                              }”?`
                        : ""
                }
                confirmLabel={t("Delete calendar")}
                danger
                onClose={() => setCalendarToDelete(null)}
                onConfirm={confirmRemoveCalendar}
            />
        </section>
    );
}
