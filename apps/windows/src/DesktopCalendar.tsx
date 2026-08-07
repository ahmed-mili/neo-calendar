import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import CalendarLayout from "../../../src/ui/calendar/CalendarLayout";
import CommandPalette from "../../../src/ui/calendar/CommandPalette";
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
    addDays,
    getEventTop,
    getWeekStart,
    neoEventToDisplayEvents,
    startOfDay,
} from "../../../src/ui/calendar/CalendarUtils";
import { useCalendarNavigation } from "../../../src/ui/calendar/useCalendarNavigation";
import { useEventDragResize } from "../../../src/ui/calendar/useEventDragResize";
import {
    eventToPaste,
    cutMayDeleteSource,
} from "../../../src/ui/calendar/useClipboardActions";
import type { DragPreview } from "../../../src/ui/calendar/TimeGrid.types";
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
import DesktopSettings from "./DesktopSettings";
import AddCalendarDialog, {
    type AddCalendarRequest,
} from "./AddCalendarDialog";
import ConfirmDialog from "./ConfirmDialog";
import {
    copyDesktopAttachment,
    createDesktopCalendarFolder,
    deleteDesktopCalendarFolder,
    deleteDesktopEventFile,
    fetchDesktopIcs,
    loadDesktopWorkspace,
    openDesktopExternalTarget,
    openDesktopLinkedPath,
    openDesktopPath,
    searchDesktopVaultNotes,
    renameDesktopCalendarFolder,
    saveDesktopPreferences,
    writeDesktopEventFile,
} from "./platform/desktopCalendarStore";
import { shouldReloadOnWake } from "./platform/workspaceRefresh";
import {
    loadDeviceWorkspacePreferences,
    saveDeviceWorkspacePreferences,
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
    removeMarkdownTargetFromEventBody,
    serializeEventMarkdown,
} from "./platform/desktopEventFormat";
import { ThemeId } from "./themes/types";
import {
    buildAutoCalendarEvents,
    externalCalendarId,
    externalCalendarPreferenceKey,
    parseIcalCalendarEvents,
    type DesktopExternalCalendarSource,
} from "./platform/desktopExternalCalendars";
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
        editable: calendar.editable,
        calendarId: calendar.id,
        calendarName: calendar.name,
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
    const [panelEventId, setPanelEventId] = useState<string | null>(null);
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

    const calendarRootRef = useRef<HTMLElement>(null);
    const calendarsRef = useRef(calendars);
    const recordsRef = useRef(storedEvents);
    const pendingEventRouteRef = useRef<DesktopEventRoute | null>(null);
    const didApplyInitialViewRef = useRef(false);
    useEffect(() => {
        calendarsRef.current = calendars;
    }, [calendars]);
    useEffect(() => {
        recordsRef.current = storedEvents;
    }, [storedEvents]);

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
            const storedPreferences = await preferenceWriter.adopt(
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
            const nextPreferences = withDeviceWorkspacePreferences(
                storedPreferences,
                deviceWorkspaceRef.current
            );
            const orderIndex = new Map(
                nextPreferences.order.map((path, index) => [path, index])
            );

            const localCalendars = snapshot.calendars.map(
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

            const knownLocalIds = new Set<string>(
                localCalendars.map((calendar) => calendar.id)
            );
            const previousByPath = new Map(
                recordsRef.current
                    .filter((record) => !record.readOnly)
                    .map((record) => [record.relativePath, record.id])
            );
            const localEvents = snapshot.eventFiles
                .map((file) => parseStoredEvent(file, knownLocalIds))
                .filter((event): event is DesktopStoredEvent => event !== null)
                .map((record) => ({
                    ...record,
                    id: previousByPath.get(record.relativePath) ?? record.id,
                    readOnly: false,
                }));

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

            const remoteErrors: string[] = [];
            const remoteEventGroups = await Promise.all(
                nextPreferences.externalCalendars
                    .filter(
                        (
                            source
                        ): source is Extract<
                            DesktopExternalCalendarSource,
                            { type: "ical" }
                        > => source.type === "ical"
                    )
                    .map(async (source) => {
                        try {
                            const text = await fetchDesktopIcs(source.url);
                            return parseIcalCalendarEvents(text).map(
                                (event, index) =>
                                    externalEventRecord(source, event, index)
                            );
                        } catch (reason) {
                            remoteErrors.push(
                                `${source.name}: ${errorMessage(reason)}`
                            );
                            return [];
                        }
                    })
            );
            const nextEvents = [
                ...localEvents,
                ...automaticEvents,
                ...remoteEventGroups.flat(),
            ];

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
                revealDesktopEventRoute(pendingRoute, nextEvents);
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
            if (remoteErrors.length) {
                setStorageError(
                    `Some remote calendars could not be refreshed: ${remoteErrors.join(
                        " | "
                    )}`
                );
            }
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
        revealDesktopEventRoute,
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

            if (!revealDesktopEventRoute(route)) {
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
    }, [reloadWorkspace, revealDesktopEventRoute]);

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

    useEffect(() => {
        if (
            !preferences.externalCalendars.some(
                (source) => source.type === "ical"
            )
        ) {
            return;
        }
        // Match the plugin's five-minute remote-calendar revalidation window.
        const timer = window.setInterval(() => {
            void reloadWorkspace();
        }, 5 * 60 * 1000);
        return () => window.clearInterval(timer);
    }, [preferences.externalCalendars, reloadWorkspace]);

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
            try {
                const contents = serializeEventMarkdown(
                    normalized,
                    previous?.contents
                );
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
                calendar.editable,
                rangeStart,
                rangeEnd
            ).map((event) => ({
                ...event,
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
                          calendar.editable,
                          rangeStart,
                          rangeEnd
                      )
            );
        events.sort((left, right) => {
            if (left.isSomeday !== right.isSomeday) {
                return left.isSomeday ? -1 : 1;
            }
            return right.start.getTime() - left.start.getTime();
        });
        return events;
    }, [calendarById, selectedCalendarId, storedEvents]);

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

    const openExistingEvent = useCallback((eventId: string) => {
        const record = findStoredEvent(recordsRef.current, eventId);
        if (!record) return;
        setDraftSlot(null);
        setPanelEventId(eventId);
        setPanelAnchor(anchorForEvent(eventId));
    }, []);

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

        const onMouseDown = (event: MouseEvent) => {
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

            const onMove = (moveEvent: MouseEvent) => {
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
                window.removeEventListener("mousemove", onMove, true);
                window.removeEventListener("mouseup", onUp, true);
                setMarquee(null);
            };
            window.addEventListener("mousemove", onMove, true);
            window.addEventListener("mouseup", onUp, true);
        };

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") clearMultiSelection();
        };
        const onBlur = () => setMarquee(null);

        root.addEventListener("mousedown", onMouseDown);
        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("blur", onBlur);
        return () => {
            root.removeEventListener("mousedown", onMouseDown);
            window.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("blur", onBlur);
        };
    }, [clearMultiSelection]);

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
        const id = await addEvent(
            calendarId,
            createUnscheduledPanelEvent(false)
        );
        openExistingEvent(id);
    }, [activeCalendarId, addEvent, openExistingEvent]);

    const addPanelEvent = useCallback(
        async (calendarId: string) => {
            if (!calendarById.get(calendarId)?.editable) return;
            const id = await addEvent(
                calendarId,
                createUnscheduledPanelEvent(false)
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
            if (
                record.event.type !== "single" &&
                record.event.type !== "someday"
            ) {
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
                    await createDesktopCalendarFolder(dataFolder, request.name);
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
                    const nextColors = { ...stored.colors };
                    delete nextColors[calendar.relativePath];
                    return {
                        ...stored,
                        colors: nextColors,
                        order: stored.order.filter(
                            (key) => key !== calendar.relativePath
                        ),
                        hiddenCalendarPaths: stored.hiddenCalendarPaths.filter(
                            (key) => key !== calendar.relativePath
                        ),
                        externalCalendars: stored.externalCalendars.filter(
                            (source) =>
                                externalCalendarId(source) !== calendar.id
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
        await deleteEvents(actionTargetIds());
    }, [actionTargetIds, deleteEvents]);

    const contextItems = useMemo<ContextMenuItem[]>(() => {
        if (!contextMenu) return [];

        if (contextMenu.type === "empty") {
            const base: ContextMenuItem[] = [
                {
                    label: "Create event",
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
                    label: "Paste event",
                    shortcut: "Ctrl+V",
                    disabled: clipboard === null,
                    onClick: () => void pasteEvent(contextMenu.date),
                },
            ];
            if (selectedIds.size === 0) return base;
            const count = selectedIds.size;
            const noun = count === 1 ? "event" : `${count} events`;
            return [
                {
                    label: `Duplicate ${noun}`,
                    icon: <DuplicateIcon />,
                    onClick: () => void duplicateTargets(),
                },
                { label: "", separator: true, onClick: () => undefined },
                {
                    label: `Delete ${noun}`,
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
                    label: "Copy",
                    shortcut: "Ctrl C",
                    icon: <CopyIcon />,
                    onClick: () => copyEvent(contextMenu.eventId),
                },
                {
                    label: "Duplicate to default calendar",
                    shortcut: "Ctrl D",
                    icon: <DuplicateIcon />,
                    onClick: () => void duplicateEvent(contextMenu.eventId),
                },
            ];
        }
        return [
            {
                label: "Cut",
                shortcut: "Ctrl X",
                icon: <ScissorsIcon />,
                onClick: () => cutEvent(contextMenu.eventId),
            },
            {
                label: "Copy",
                shortcut: "Ctrl C",
                icon: <CopyIcon />,
                onClick: () => copyEvent(contextMenu.eventId),
            },
            {
                label:
                    selectedCount > 1
                        ? `Duplicate ${selectedCount} events`
                        : "Duplicate",
                shortcut: "Ctrl D",
                icon: <DuplicateIcon />,
                onClick: () =>
                    void (selectedCount > 1
                        ? duplicateTargets()
                        : duplicateEvent(contextMenu.eventId)),
            },
            { label: "", separator: true, onClick: () => undefined },
            {
                label: "Go to note",
                icon: <FileTextIcon />,
                onClick: () =>
                    void openDesktopPath(dataFolder, record.relativePath),
            },
            { label: "", separator: true, onClick: () => undefined },
            {
                label:
                    selectedCount > 1
                        ? `Delete ${selectedCount} events`
                        : "Delete",
                shortcut: "delete",
                danger: true,
                icon: <TrashIcon />,
                onClick: () =>
                    void (selectedCount > 1
                        ? deleteTargets()
                        : deleteEvents([contextMenu.eventId])),
            },
        ];
    }, [
        clipboard,
        contextMenu,
        copyEvent,
        cutEvent,
        dataFolder,
        deleteEvents,
        deleteTargets,
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
                somedayEvents={somedayEvents}
                onAddSomeday={() => void createSomeday()}
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
                onDeleteCalendar={(calendarId: string) =>
                    void removeCalendar(calendarId)
                }
                onColorChange={changeColor}
                onReorderCalendars={reorderCalendars}
                onOpenCalendarFolder={(calendarId: string) => {
                    const calendar = calendarById.get(calendarId);
                    if (calendar?.editable && calendar.type === "local") {
                        void openDesktopPath(dataFolder, calendar.relativePath);
                    }
                }}
                onOpenRootFolder={() => void openDesktopPath(dataFolder)}
                onCalendarClick={(calendarId: string) =>
                    setSelectedCalendarId((current) =>
                        current === calendarId ? null : calendarId
                    )
                }
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

            <CommandPalette
                visible={commandPaletteVisible}
                onDismiss={() => setCommandPaletteVisible(false)}
                events={[...displayEvents, ...somedayEvents]}
                onEventSelect={openExistingEvent}
                onViewChange={changeView}
                onGoToday={goToday}
                onCreateEvent={() => openNewEvent()}
                onToggleSidebar={toggleSidebar}
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
                    if (record && !record.readOnly) {
                        void openDesktopPath(dataFolder, record.relativePath);
                    }
                }}
                onDelete={(eventId: string) => void deleteEvent(eventId)}
                firstDay={preferences.firstDay}
                linkVaults={linkedVaults.map((path) => ({
                    path,
                    name: folderName(path),
                }))}
                onSearchEventLinks={searchEventLinks}
                linkedItems={panelLinkedItems}
                onAddEventLink={appendEventBody}
                onRemoveEventLink={removeEventBodyLink}
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
                onPickEventAttachment={pickEventAttachments}
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

            {/* Errors only. The loading notice was removed: the calendar is
                already usable while the folder is read, so the toast only
                announced work the user does not act on. */}
            {storageError && (
                <div
                    className="nc-desktop-storage-status nc-desktop-storage-status--error"
                    role="alert"
                >
                    {storageError}
                    <button
                        type="button"
                        aria-label="Dismiss error"
                        onClick={() => setStorageError(null)}
                    >
                        ×
                    </button>
                </div>
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
                onPreferencesChange={updateWorkspacePreferences}
                onClose={() => setSettingsOpen(false)}
                onChangeDataFolder={onChangeDataFolder}
                onOpenDataFolder={() => openDesktopPath(dataFolder)}
                onAddVaultFolder={onAddVaultFolder}
                onRemoveVaultFolder={onRemoveVaultFolder}
                onSetVaultEnabled={onSetVaultEnabled}
                onAddCalendar={() => {
                    setSettingsOpen(false);
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

            <ConfirmDialog
                open={calendarToDelete !== null}
                title="Delete calendar"
                message={
                    calendarToDelete
                        ? calendarById.get(calendarToDelete)?.editable
                            ? `Remove the empty calendar folder “${
                                  calendarById.get(calendarToDelete)?.name ??
                                  "Calendar"
                              }”?`
                            : `Remove the read-only calendar “${
                                  calendarById.get(calendarToDelete)?.name ??
                                  "Calendar"
                              }”?`
                        : ""
                }
                confirmLabel="Delete calendar"
                danger
                onClose={() => setCalendarToDelete(null)}
                onConfirm={confirmRemoveCalendar}
            />
        </section>
    );
}
