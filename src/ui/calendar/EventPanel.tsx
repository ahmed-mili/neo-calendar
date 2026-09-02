import * as React from "react";
import * as ReactDOM from "react-dom";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { NeoEvent, CalendarInfo, NeoCalendarError } from "../../types";
import { Notice } from "obsidian";
import EventCache from "../../core/EventCache";
import { EditableCalendar } from "../../calendars/EditableCalendar";
import {
    POPUP_MAX_HEIGHT,
    formatDateLong,
    formatDateParts,
    formatPanelDate,
    panelEndDate,
    computeDuration,
    daysBetween,
    computePopupPosition,
    hasDraftCreationIntent,
    shouldAutoCommitDraft,
} from "./EventPanel.helpers";
import { usePopupDismiss } from "./usePopupDismiss";
import { sheetHandleGlyph, useSheetDrag } from "./useSheetDrag";
import { PANEL_EXIT_CLASS, panelHasLeft } from "./panelExit";
import { attachmentExtension, pastedFileName } from "./pastedAttachment";
import { usePopupDrag } from "./usePopupDrag";
import { useEventFormState } from "./useEventFormState";
import {
    EntryKind,
    PanelHeader,
    RecurringScopeDialog,
    TitleRow,
    DateRow,
    CustomRecurrencePanel,
    RemindersRow,
    LocationRow,
    CalendarRow,
} from "./EventPanelRows";
import type { MapsTravelMode } from "./locationLink";
import { DateOptionsRow } from "./EventDateControls";
import { DescriptionSection } from "./DescriptionSection";
import { FileTextIcon } from "./EventPanelIcons";
import { Toast, ToastMessage } from "./Toast";
import { t } from "../i18n";
import {
    PresetKey,
    defaultRecurrence,
    matchPreset,
    presetToRecurrence,
    recurrenceSummary,
} from "./recurrence";
import { mergeForSave } from "./eventScheduling";
import {
    RecurringEditScope,
    detachedOccurrence,
    needsScopeChoice,
    occurrenceDateOf,
    occurrenceIsDone,
    seriesWithoutOccurrence,
} from "./recurringEdit";
import { recurringEditChanges } from "./recurringEditChanges";
import { adjacentOccurrenceId } from "./seriesNavigation";
import {
    applyEntryKindSelection,
    BirthdayReturnState,
} from "./entryKindSelection";

/* NEO_ANDROID_RUNTIME_HELPER_V3_START */
function isNeoAndroidRuntime(): boolean {
    return (
        Boolean((window as Window & { NeoAndroid?: unknown }).NeoAndroid) ||
        document.documentElement.classList.contains("nc-platform-android") ||
        document.body.classList.contains("nc-platform-android") ||
        document.documentElement.dataset.neoCalendarPlatform === "android"
    );
}
/* NEO_ANDROID_RUNTIME_HELPER_V3_END */

export interface DraftInfo {
    start: Date;
    end: Date;
    allDay: boolean;
    defaultAsTask: boolean;
}

export interface EventLinkVault {
    path: string;
    name: string;
}

export interface EventLinkTarget {
    id: string;
    vaultPath: string;
    vaultName: string;
    title: string;
    relativePath: string;
    detail: string;
    markdown: string;
}

export interface EventLinkedItem {
    id: string;
    label: string;
    target: string;
    kind: "note" | "attachment" | "web";
}

interface EventPanelProps {
    visible: boolean;
    eventId: string | null;
    draft: DraftInfo | null;
    committingDraft: boolean;
    anchorRect: DOMRect | null;
    cache: EventCache;
    timeFormat24h: boolean;
    calendars: {
        id: string;
        name: string;
        color: string;
        type: CalendarInfo["type"];
    }[];
    defaultCalendarId: string;
    onClose: () => void;
    onDraftCommit: (
        title: string,
        updates?: Partial<NeoEvent>,
        calendarId?: string
    ) => void;
    onOpenFile: (id: string) => void;
    /** Ouvre une autre date de la meme serie : la vue se pose dessus et le
        panneau montre cette occurrence-la. */
    onGoToOccurrence?: (displayId: string, date: string) => void;
    onCopyFilePath?: (id: string) => Promise<void>;
    onDuplicate?: (id: string) => void;
    onDelete: (id: string) => void;
    firstDay: number;
    linkVaults?: EventLinkVault[];
    /** Fetches a page's source so a link can be named after it. */
    onFetchPage?: (url: string) => Promise<string>;
    /** Suit les redirections d'un lien de partage jusqu'à sa destination. */
    onResolveUrl?: (url: string) => Promise<string>;
    onSearchEventLinks?: (
        query: string,
        vaultPath?: string
    ) => Promise<EventLinkTarget[]>;
    linkedItems?: EventLinkedItem[];
    onAddEventLink?: (eventId: string, markdown: string) => Promise<void>;
    onRemoveEventLink?: (eventId: string, target: string) => Promise<void>;
    /** Renomme un lien : le libellé est du texte, pas une donnée du site. */
    onRenameEventLink?: (
        eventId: string,
        target: string,
        label: string,
        nextTarget?: string
    ) => Promise<void>;
    onOpenEventLink?: (item: EventLinkedItem) => Promise<void> | void;
    /** Ouvre le lieu d'un évènement dans la carte du système. */
    /** L'adresse réglée sur le lien ICS dont vient l'évènement, quand il en
     *  vient d'un : c'est elle qui mène au campus, faute de quoi le flux ne le
     *  dit nulle part. */
    linkAddress?: string;
    /** Comment on compte s'y rendre, quand la carte ouvre un itinéraire :
     *  le réglage des préférences, tel quel. */
    travelMode?: MapsTravelMode;
    onOpenLocation?: (url: string) => void;
    onCopyEventLink?: (target: string) => Promise<void>;
    onPickEventAttachment?: (eventId: string) => Promise<void>;
    /** Ce que Ctrl+V dépose : un nom et des octets, pas un fichier du disque. */
    onPasteEventAttachment?: (
        eventId: string,
        fileName: string,
        contents: Uint8Array
    ) => Promise<void>;
    /** Le contenu d'une pièce jointe en base64, pour en montrer une vignette. */
    onReadEventAttachment?: (
        eventId: string,
        target: string
    ) => Promise<string | null>;
    requireTaskDateForCompletion?: boolean;
}

interface CalendarDisplayInfo {
    name: string;
    color: string;
    editable: boolean;
    currentId: string;
}

export function resolveCalendarInfo(
    cache: EventCache,
    eventId: string | null,
    isDraft: boolean,
    defaultCalendarId: string
): CalendarDisplayInfo {
    const fallbackColor = "var(--nc-accent)";

    if (eventId) {
        // Read-only events (holiday feed, .ics) belong to a calendar just as
        // much as editable ones do, so resolve through the store rather than
        // through the editable-only path — otherwise the panel would credit
        // them to whichever calendar happened to come first.
        const details = cache.getEventDetails(eventId);
        const calendar = details
            ? cache.getCalendarById(details.calendarId)
            : undefined;
        if (calendar) {
            return {
                name: calendar.name,
                color: calendar.color || fallbackColor,
                editable: cache.isEventEditable(eventId),
                currentId: calendar.id,
            };
        }
        return {
            name: "",
            color: fallbackColor,
            editable: false,
            currentId: defaultCalendarId,
        };
    }

    if (isDraft) {
        // Prefer the user-chosen default calendar…
        for (const cal of cache.calendars.values()) {
            if (
                cal instanceof EditableCalendar &&
                cal.id === defaultCalendarId
            ) {
                return {
                    name: cal.name,
                    color: cal.color || fallbackColor,
                    editable: true,
                    currentId: cal.id,
                };
            }
        }
        // …otherwise fall back to the first editable calendar.
        for (const cal of cache.calendars.values()) {
            if (cal instanceof EditableCalendar) {
                return {
                    name: cal.name,
                    color: cal.color || fallbackColor,
                    editable: true,
                    currentId: cal.id,
                };
            }
        }
    }

    return {
        name: "",
        color: fallbackColor,
        editable: isDraft,
        currentId: defaultCalendarId,
    };
}

export default function EventPanel({
    visible,
    eventId,
    draft,
    committingDraft,
    anchorRect,
    cache,
    calendars,
    defaultCalendarId,
    onClose,
    onDraftCommit,
    onOpenFile,
    onGoToOccurrence,
    onCopyFilePath,
    onDuplicate,
    onDelete,
    firstDay,
    linkVaults = [],
    onSearchEventLinks,
    linkedItems = [],
    onAddEventLink,
    onRemoveEventLink,
    onRenameEventLink,
    onOpenEventLink,
    linkAddress,
    travelMode,
    onOpenLocation,
    onCopyEventLink,
    onPickEventAttachment,
    onPasteEventAttachment,
    onReadEventAttachment,
    requireTaskDateForCompletion = false,
}: EventPanelProps) {
    const isDraft = eventId === null && draft !== null;
    const event = eventId ? cache.getEventById(eventId) : null;

    // Keep last known event so the popup doesn't unmount during cache updates.
    // When auto-save triggers a cache refresh, getEventById can return null
    // temporarily, causing `if (!isDraft && !event) return null` to unmount
    // the popup and lose all form state (including typed spaces).
    const lastEventRef = useRef<NeoEvent | null>(null);
    if (event) lastEventRef.current = event;
    const stableEvent = event || lastEventRef.current;

    const popupRef = useRef<HTMLDivElement>(null);
    const titleInputRef = useRef<HTMLInputElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const [copyPathToast, setCopyPathToast] = useState<ToastMessage | null>(
        null
    );
    const headerRef = useRef<HTMLDivElement>(null);

    const calInfo = resolveCalendarInfo(
        cache,
        eventId,
        isDraft,
        defaultCalendarId
    );

    // Stabilize calInfo across cache refreshes. When auto-save triggers a cache
    // update, the event briefly leaves the store, which reads as editable=false
    // and makes the inputs readOnly. Keep the last editable calInfo as fallback
    // — but only for the SAME event: carrying it across a selection change once
    // credited a read-only holiday to the previously opened calendar.
    const lastCalInfoRef = useRef<{
        eventId: string | null;
        info: CalendarDisplayInfo;
    }>({ eventId, info: calInfo });
    const sameEvent = lastCalInfoRef.current.eventId === eventId;
    if (
        !sameEvent ||
        calInfo.editable ||
        !lastCalInfoRef.current.info.editable
    ) {
        lastCalInfoRef.current = { eventId, info: calInfo };
    }
    const stableCalInfo =
        calInfo.editable || !sameEvent ? calInfo : lastCalInfoRef.current.info;

    const editableCalendars = useMemo(
        () =>
            calendars.filter(
                (cal) => cal.type === "local" || cal.type === "dailynote"
            ),
        [calendars]
    );

    const form = useEventFormState({
        eventId,
        event,
        draft,
        editableCalendars,
        currentCalendarId: stableCalInfo.currentId,
        committingDraft,
        requireTaskDateForCompletion,
    });

    // NEO_ANDROID_DRAFT_LIVE_TIME_V7_2_START
    useEffect(() => {
        if (!isDraft || !draft || draft.allDay) {
            return;
        }

        const pad = (value: number) => String(value).padStart(2, "0");

        const dateValue =
            `${draft.start.getFullYear()}-` +
            `${pad(draft.start.getMonth() + 1)}-` +
            `${pad(draft.start.getDate())}`;

        const startValue =
            `${pad(draft.start.getHours())}:` +
            `${pad(draft.start.getMinutes())}`;

        const endValue =
            `${pad(draft.end.getHours())}:` + `${pad(draft.end.getMinutes())}`;

        if (form.date !== dateValue) {
            form.setDate(dateValue);
        }

        if (form.startTime !== startValue) {
            form.setStartTime(startValue);
        }

        if (form.endTime !== endValue) {
            form.setEndTime(endValue);
        }
    }, [isDraft, draft?.start.getTime(), draft?.end.getTime(), draft?.allDay]);
    // NEO_ANDROID_DRAFT_LIVE_TIME_V7_2_END

    // ── Popup behavior ────────────────────────────────────────

    // The clicked anchor's CURRENT geometry, re-read live from the DOM (the
    // event block, or the draft preview) rather than the open-time rect. When
    // the calendar re-lays-out — collapsing/expanding Obsidian's sidebar shifts
    // and resizes the day columns — recomputing from the live rect lets the
    // panel travel WITH its event, so it appears to stay put instead of being
    // stranded at its original viewport coordinates. Falls back to the open-time
    // rect when the element isn't in the DOM (e.g. scrolled out).
    // The last rect the panel was actually docked to. During the hand-over from
    // draft to saved event the draft's slot has already been removed and the
    // event's block is not drawn yet, so for those frames NOTHING is in the DOM
    // to dock to; falling back to the rect the panel opened on threw it back
    // across the grid and read as the panel reloading. Cleared whenever the
    // panel is opened somewhere else (a new anchorRect).
    const lastAnchorRectRef = useRef<DOMRect | null>(null);
    useEffect(() => {
        lastAnchorRectRef.current = null;
    }, [anchorRect]);

    const getAnchorRect = useCallback((): DOMRect | null => {
        const remember = (rect: DOMRect): DOMRect => {
            lastAnchorRectRef.current = rect;
            return rect;
        };
        if (eventId) {
            const el = document.querySelector(
                `[data-event-id="${CSS.escape(eventId)}"]`
            );
            if (el) return remember(el.getBoundingClientRect());
        }
        const draftEl = document.querySelector("[data-draft-preview]");
        if (draftEl) return remember(draftEl.getBoundingClientRect());
        return lastAnchorRectRef.current ?? anchorRect;
    }, [eventId, anchorRect]);

    // Bumped whenever the calendar surface resizes (sidebar toggle / window
    // resize), forcing `position` to recompute against the new column geometry.
    const [layoutTick, setLayoutTick] = useState(0);

    const position = useMemo(() => {
        const liveAnchor = getAnchorRect();
        // In time-grid views, read the day-column geometry so the panel can dock
        // into the adjacent column. Absent (month/list) → float beside anchor.
        const scroller = document.querySelector(".nc-main-scroller");
        const colEls = scroller?.querySelectorAll(".nc-timegrid-day");
        if (scroller && colEls && colEls.length) {
            const columns = Array.from(colEls).map((el) => {
                const r = el.getBoundingClientRect();
                return { left: r.left, right: r.right, width: r.width };
            });
            const gr = scroller.getBoundingClientRect();
            return computePopupPosition(liveAnchor, {
                columns,
                bounds: { left: gr.left, right: gr.right },
            });
        }
        return computePopupPosition(liveAnchor);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [getAnchorRect, visible, layoutTick]);

    const { dragOffset, setDragOffset, handleHeaderMouseDown } =
        usePopupDrag(position);

    useEffect(() => {
        if (!visible) return;
        setDragOffset(null);
    }, [eventId, draft, visible, setDragOffset]);

    // Keep the panel docked to its event as the calendar re-lays-out. A
    // ResizeObserver on the scroller fires when Obsidian's sidebar toggles or
    // the window resizes (both change the grid width); each fire bumps
    // layoutTick → `position` recomputes from the live column geometry, and the
    // (un-dragged) panel slides to stay beside its event.
    useEffect(() => {
        if (!visible) return;
        const scroller = document.querySelector(".nc-main-scroller");
        const bump = () => setLayoutTick((t) => t + 1);
        let ro: ResizeObserver | null = null;
        if (scroller && typeof ResizeObserver !== "undefined") {
            ro = new ResizeObserver(bump);
            ro.observe(scroller);
        }
        window.addEventListener("resize", bump);
        return () => {
            ro?.disconnect();
            window.removeEventListener("resize", bump);
        };
    }, [visible, eventId, draft]);

    // Dismissing by tapping outside leaves the same way as the X does. The
    // indirection is because the sheet hook is set up just below and owns the
    // movement — reading it through a closure keeps the order of declaration
    // from deciding how the panel behaves.
    // Every way out of the panel goes through here first. It is set below, once
    // there is something to guard: a held edit on one day of a series, which
    // has to be answered for before the panel can go anywhere.
    const guardExitRef = React.useRef<(exit: () => void) => void>((exit) =>
        exit()
    );

    const closeRef = React.useRef<() => void>(onClose);
    usePopupDismiss({
        visible,
        popupRef,
        menuRef,
        onClose: React.useCallback(() => closeRef.current(), []),
    });

    // The grab handle across the top of the sheet is only drawn on Android, so
    // that is the only place the gesture belongs.
    const onSheet = isNeoAndroidRuntime();
    const {
        requestClose,
        anchor: sheetAnchor,
        pressHandle,
    } = useSheetDrag({
        enabled: visible && onSheet,
        sheetRef: popupRef,
        handleRef: headerRef,
        // A draft stands lower at rest than an existing event: it opens over a
        // slot the person is still looking at.
        variant: isDraft ? "draft" : "sheet",
        // Swiping the sheet down is a way out like any other, and the sheet has
        // already left by the time this runs — so the guard puts it back if it
        // has a question to ask.
        onClose: () => guardExitRef.current(onClose),
    });

    /** Undoes a swipe that was stopped by the question: the sheet comes home. */
    const restoreSheet = React.useCallback(() => {
        popupRef.current?.style.removeProperty("--nc-sheet-offset");
    }, []);

    /*
     * The desktop half of leaving.
     *
     * The sheet has a gesture behind it and slides itself out; the popup has
     * none, so it is asked to play its exit animation and the calendar is only
     * told the panel is closed once that animation reports itself over — see
     * onAnimationEnd on the panel below.
     */
    const [leaving, setLeaving] = useState(false);

    /** The panel's one way out: the sheet slides, the popup fades. */
    const leave = React.useCallback(() => {
        if (isNeoAndroidRuntime()) requestClose();
        else setLeaving(true);
    }, [requestClose]);

    /* The bar across the top of the sheet, which only a sheet has. */
    const sheetHandle = React.useMemo(
        () =>
            onSheet
                ? { glyph: sheetHandleGlyph(sheetAnchor), onPress: pressHandle }
                : undefined,
        [onSheet, pressHandle, sheetAnchor]
    );

    /* A panel that has just opened is never on its way out.
       Keyed on what the panel is showing rather than on `draft`, which the
       calendar rebuilds on every render: an object here would reset the flag
       one render after it was raised, and nothing would ever leave. */
    const showing = eventId ?? (draft ? String(+draft.start) : null);
    useEffect(() => {
        setLeaving(false);
    }, [visible, showing]);

    /** What the X, the Escape key and a tap outside all call. */
    const requestCloseGuarded = React.useCallback(
        () => guardExitRef.current(leave),
        [leave]
    );
    closeRef.current = requestCloseGuarded;

    // NEO_ANDROID_NOTION_DRAFT_FOCUS_START
    useEffect(() => {
        if (!isDraft || !visible) return;

        if (isNeoAndroidRuntime()) {
            // Android opens drafts without forcing the title keyboard.
            // Never blur whichever element the user has chosen in the
            // meantime: the old delayed blanket blur could cancel a tap
            // on Description just after the sheet appeared.
            if (document.activeElement === titleInputRef.current) {
                titleInputRef.current?.blur();
            }

            window.setTimeout(() => {
                if (document.activeElement === titleInputRef.current) {
                    titleInputRef.current?.blur();
                }
            }, 80);

            return;
        }

        titleInputRef.current?.focus();
    }, [isDraft, visible]);
    // NEO_ANDROID_NOTION_DRAFT_FOCUS_END

    // Refocus title input after draft commits (draft→edit transition)
    const justCommittedDraftRef = useRef(false);
    /** The event about to arrive was written from what this form holds. */
    const committedFromThisFormRef = useRef(false);

    // NEO_ANDROID_NOTION_COMMIT_FOCUS_START
    useEffect(() => {
        if (!justCommittedDraftRef.current || !eventId || !visible) {
            return;
        }

        justCommittedDraftRef.current = false;

        if (isNeoAndroidRuntime()) {
            return;
        }

        requestAnimationFrame(() => {
            const active = document.activeElement;
            const editingElsewhere =
                active instanceof HTMLInputElement ||
                active instanceof HTMLTextAreaElement ||
                active instanceof HTMLSelectElement ||
                (active instanceof HTMLElement && active.isContentEditable);
            // A fast click into Description during draft → event handoff
            // wins over the legacy title refocus. Do not steal the caret.
            if (editingElsewhere) return;
            titleInputRef.current?.focus();
        });
    }, [eventId, visible]);
    // NEO_ANDROID_NOTION_COMMIT_FOCUS_END

    // ── Menu / delete ─────────────────────────────────────────

    const [menuOpen, setMenuOpen] = useState(false);

    useEffect(() => {
        if (!menuOpen) return;
        const onDown = (e: Event) => {
            if (
                menuRef.current &&
                !menuRef.current.contains(e.target as Node)
            ) {
                setMenuOpen(false);
            }
        };
        // Pointer events, not mouse events: the grid cancels its `pointerdown`,
        // which suppresses the compatibility mouse events, so a press on the
        // calendar never produces a `mousedown` to dismiss on.
        document.addEventListener("pointerdown", onDown);
        return () => document.removeEventListener("pointerdown", onDown);
    }, [menuOpen]);

    const handleDeleteClick = () => {
        if (!eventId) return;
        onDelete(eventId);
        // Nothing left to ask about: the note this panel was editing is gone.
        heldEditRef.current = false;
        leave();
    };

    // Track original calendar to detect moves
    const originalCalendarIdRef = useRef<string | null>(null);
    // Auto-save fires on every keystroke, so a failing write would raise one
    // notice per character. Warn once per event instead.
    const saveFailureReportedRef = useRef(false);
    useEffect(() => {
        if (eventId) {
            originalCalendarIdRef.current = stableCalInfo.currentId;
            saveFailureReportedRef.current = false;
        }
    }, [eventId]);

    /**
     * A save that fails without a word leaves the panel showing a value that
     * was never written — the user only finds out at the next reload, and reads
     * it as the plugin losing edits.
     */
    const reportSaveFailure = useCallback((e: unknown) => {
        console.error("[neo-calendar] Saving the event failed", e);
        if (saveFailureReportedRef.current) return;
        saveFailureReportedRef.current = true;
        new Notice(
            e instanceof NeoCalendarError
                ? e.message
                : "Neo Calendar: this event could not be saved."
        );
    }, []);

    /*
     * Coller une image sur un événement.
     *
     * Le geste ordinaire pour une capture d'écran, et jusqu'ici il ne menait
     * nulle part : il fallait l'enregistrer quelque part, puis la retrouver
     * dans une boîte de dialogue. L'écouteur est posé sur le panneau et non
     * sur la fenêtre, pour que coller ailleurs dans l'application reste ce que
     * c'était.
     *
     * Le texte n'est jamais intercepté : tout copier-coller en porte, et le
     * coller dans un champ doit l'écrire là où est le curseur.
     */
    useEffect(() => {
        const popup = popupRef.current;
        if (!visible || !popup || !eventId || !onPasteEventAttachment) return;

        const onPaste = (event: ClipboardEvent) => {
            const items = Array.from(event.clipboardData?.items ?? []);
            const item = items.find(
                (candidate) =>
                    candidate.kind === "file" &&
                    attachmentExtension(candidate.type)
            );
            if (!item) return;
            const file = item.getAsFile();
            if (!file) return;

            event.preventDefault();
            const name = pastedFileName(file.type, new Date(), file.name);
            void file
                .arrayBuffer()
                .then((buffer) =>
                    onPasteEventAttachment(
                        eventId,
                        name,
                        new Uint8Array(buffer)
                    )
                )
                .catch(reportSaveFailure);
        };

        popup.addEventListener("paste", onPaste);
        return () => popup.removeEventListener("paste", onPaste);
    }, [eventId, onPasteEventAttachment, reportSaveFailure, visible]);

    // ── Save ──────────────────────────────────────────────────

    const isTask = form.taskStatus !== null;

    /*
     * One day of a series is held, not written.
     *
     * Everything else in this panel saves itself as it is typed. A series
     * cannot: its note describes every occurrence at once, so writing the
     * moment a field changes would answer "all of them" to a question nobody
     * has been asked yet. The edits stay in the form until the panel is closed,
     * and the way out is where the question is put.
     */
    const scopeChoiceNeeded = needsScopeChoice({
        event: stableEvent,
        eventId,
        isDraft,
    });
    const occurrenceDate = useMemo(() => occurrenceDateOf(eventId), [eventId]);

    /* Les deux dates voisines de la serie, calculees des que le panneau ouvre
       une occurrence. Elles ne sont pas cherchees dans ce qui est affiche : la
       voisine d'une regle annuelle est a onze mois de la fenetre visible. */
    const previousOccurrence = useMemo(
        () => adjacentOccurrenceId(stableEvent, eventId, -1),
        [stableEvent, eventId]
    );
    const nextOccurrence = useMemo(
        () => adjacentOccurrenceId(stableEvent, eventId, 1),
        [stableEvent, eventId]
    );
    const stepOccurrence = useCallback(
        (direction: 1 | -1) => {
            const target = direction > 0 ? nextOccurrence : previousOccurrence;
            if (!target) return;
            onGoToOccurrence?.(target.id, target.date);
        },
        [nextOccurrence, previousOccurrence, onGoToOccurrence]
    );
    const heldEditRef = useRef(false);
    const scopeNeededRef = useRef(scopeChoiceNeeded);
    scopeNeededRef.current = scopeChoiceNeeded;
    const [scopeAsked, setScopeAsked] = useState(false);

    // An edit held for one occurrence belongs to that occurrence alone: opening
    // another entry starts from nothing held.
    useEffect(() => {
        heldEditRef.current = false;
        setScopeAsked(false);
    }, [eventId]);

    // Mutex to prevent overlapping auto-saves. When the user types rapidly,
    // multiple auto-saves can fire before the previous one finishes, causing
    // race conditions with file renames (e.g. duplicate files).
    const savingRef = useRef(false);
    // If a save is requested while one is in flight, don't DROP it (that left
    // the status pill — and any other field — out of sync with the cache on
    // rapid edits): mark that another pass is needed and re-run once the
    // current write finishes, picking up the latest form state.
    const saveAgainRef = useRef(false);

    const autoSave = useCallback(async () => {
        if (isDraft || !stableEvent || !eventId || !stableCalInfo.editable)
            return;
        // Held until the panel is closed and the question has been answered.
        if (scopeNeededRef.current) {
            heldEditRef.current = true;
            return;
        }
        if (savingRef.current) {
            saveAgainRef.current = true;
            return;
        }
        savingRef.current = true;
        try {
            const targetCalendar = editableCalendars[form.calendarIndex];
            const originalCalendarId = originalCalendarIdRef.current;
            const newCalendarId = targetCalendar?.id;

            // If the calendar changed, move the event instead of updating in place
            if (
                newCalendarId &&
                originalCalendarId &&
                newCalendarId !== originalCalendarId
            ) {
                try {
                    await cache.moveEventToCalendar(eventId, newCalendarId);
                    originalCalendarIdRef.current = newCalendarId;
                    const updated = cache.getEventById(eventId);
                    if (updated) {
                        await cache.updateEventWithId(
                            eventId,
                            mergeForSave(updated, form.buildPayload())
                        );
                    }
                } catch (e) {
                    reportSaveFailure(e);
                }
            } else {
                try {
                    await cache.updateEventWithId(
                        eventId,
                        mergeForSave(stableEvent, form.buildPayload())
                    );
                } catch (e) {
                    reportSaveFailure(e);
                }
            }
        } finally {
            savingRef.current = false;
            // A save was requested mid-flight — re-run with the latest state so
            // the persisted value always converges to what the UI shows.
            if (saveAgainRef.current) {
                saveAgainRef.current = false;
                autoSaveRef.current();
            }
        }
    }, [
        isDraft,
        stableEvent,
        eventId,
        stableCalInfo.editable,
        form.title,
        form.calendarIndex,
        form.buildPayload,
        cache,
        editableCalendars,
    ]);

    // Debounced auto-save: typing only updates local form state (cheap); the
    // vault write + cache resync (which re-renders the whole calendar) is
    // deferred until the user pauses. Without this, holding a key fired a write
    // per character → a flood of full re-renders. Blur/close flush immediately.
    const autoSaveRef = useRef(autoSave);
    autoSaveRef.current = autoSave;
    const saveTimerRef = useRef<number | null>(null);
    const debouncedAutoSave = useCallback(() => {
        if (saveTimerRef.current !== null) {
            window.clearTimeout(saveTimerRef.current);
        }
        saveTimerRef.current = window.setTimeout(() => {
            saveTimerRef.current = null;
            autoSaveRef.current();
        }, 400);
    }, []);
    const flushAutoSave = useCallback(() => {
        if (saveTimerRef.current !== null) {
            window.clearTimeout(saveTimerRef.current);
            saveTimerRef.current = null;
        }
        autoSaveRef.current();
    }, []);
    // Flush any pending save when the panel unmounts (e.g. closed right after
    // typing) so the last keystrokes aren't lost.
    useEffect(() => {
        return () => {
            if (saveTimerRef.current !== null) {
                window.clearTimeout(saveTimerRef.current);
                saveTimerRef.current = null;
                autoSaveRef.current();
            }
        };
    }, []);

    /**
     * Writes the held edit, once it is known who it was meant for.
     *
     * "All of them" is the panel's ordinary save: the series' note carries
     * every occurrence, so writing it answers for all of them at once.
     *
     * "This one" cannot be written there at all. The day is taken OUT of the
     * series — the same exception `skipDates` records when an occurrence is
     * dragged — and written beside it as an event of its own, carrying
     * everything the panel holds. The copy goes down first: an occurrence
     * showing twice for a moment beats one that was lost.
     */
    const applyScopedEdit = useCallback(
        async (scope: RecurringEditScope) => {
            if (!stableEvent || !eventId || !occurrenceDate) return;
            const payload = form.buildPayload();
            const targetCalendar = editableCalendars[form.calendarIndex];

            try {
                if (scope === "series") {
                    const originalCalendarId = originalCalendarIdRef.current;
                    const newCalendarId = targetCalendar?.id;
                    if (
                        newCalendarId &&
                        originalCalendarId &&
                        newCalendarId !== originalCalendarId
                    ) {
                        await cache.moveEventToCalendar(eventId, newCalendarId);
                        originalCalendarIdRef.current = newCalendarId;
                        const moved = cache.getEventById(eventId);
                        if (moved) {
                            await cache.updateEventWithId(
                                eventId,
                                mergeForSave(moved, payload)
                            );
                        }
                        return;
                    }
                    await cache.updateEventWithId(
                        eventId,
                        mergeForSave(stableEvent, payload)
                    );
                    return;
                }

                // The date row of a series shows where the SERIES starts, so a
                // date left alone means "the day I opened", and a date changed
                // means this occurrence is being moved to it.
                const seriesStart =
                    stableEvent.type === "recurring"
                        ? stableEvent.startRecur
                        : stableEvent.type === "rrule"
                        ? stableEvent.startDate
                        : undefined;
                const dateISO =
                    form.date && form.date !== seriesStart
                        ? form.date
                        : occurrenceDate;

                const single = detachedOccurrence({
                    payload,
                    dateISO,
                    done: occurrenceIsDone(stableEvent, occurrenceDate),
                });
                const calendarId =
                    targetCalendar?.id ?? stableCalInfo.currentId;
                await cache.addEvent(calendarId, single);
                await cache.updateEventWithId(
                    eventId,
                    seriesWithoutOccurrence(stableEvent, occurrenceDate)
                );
            } catch (e) {
                reportSaveFailure(e);
            }
        },
        [
            cache,
            editableCalendars,
            eventId,
            form,
            occurrenceDate,
            reportSaveFailure,
            stableCalInfo.currentId,
            stableEvent,
        ]
    );

    /*
     * The way out, with the question in it.
     *
     * Every exit — the X, Escape, a tap outside, the sheet swiped down — ends
     * up here. With an edit held for one day of a series, none of them leave:
     * the sheet comes back to where it was and the question is put instead.
     * Answering it leaves by the ordinary door, so the panel goes out the way
     * it always does rather than blinking off the screen.
     */
    guardExitRef.current = (exit) => {
        if (!scopeNeededRef.current || !heldEditRef.current) {
            exit();
            return;
        }
        restoreSheet();
        setScopeAsked(true);
    };

    const confirmScopedEdit = useCallback(
        (scope: RecurringEditScope) => {
            setScopeAsked(false);
            heldEditRef.current = false;
            // The write is not waited on: the panel leaves now and the grid
            // catches up when the file lands — the bargain every other save in
            // this panel already makes.
            void applyScopedEdit(scope);
            leave();
        },
        [applyScopedEdit, leave]
    );

    /** Back to the panel, with everything typed still in it. */
    const cancelScopedEdit = useCallback(() => setScopeAsked(false), []);

    const commitDraftIfNeeded = useCallback(() => {
        if (!isDraft || !draft) return;
        if (!form.date) return;
        if (!hasDraftCreationIntent(form.title)) return;
        justCommittedDraftRef.current = true;
        committedFromThisFormRef.current = true;
        const payload = form.buildPayload();
        const cal =
            editableCalendars[form.calendarIndex] || editableCalendars[0];
        onDraftCommit(form.title.trim(), payload, cal?.id);
    }, [
        isDraft,
        draft,
        form.title,
        form.date,
        form.buildPayload,
        form.calendarIndex,
        editableCalendars,
        onDraftCommit,
    ]);

    const onTitleCommit = () =>
        isDraft ? commitDraftIfNeeded() : flushAutoSave();

    // Go through autoSaveRef (not the captured `autoSave`): by the time this
    // 0ms macrotask runs, the setState that triggered it has re-rendered and
    // refreshed autoSaveRef to an autoSave closing over the NEW form state.
    // Calling the captured `autoSave` would persist the value from BEFORE the
    // toggle (stale closure) — the root cause of the status pill desync.
    const scheduleAutoSave = () => setTimeout(() => autoSaveRef.current(), 0);

    // ── Auto-save on form changes ───────────────────────────

    const prevEventIdForSaveRef = useRef<string | null>(null);
    const lastSavedPayloadRef = useRef<string>("");
    const lastSavedCalendarRef = useRef<number | null>(null);
    // True for the first populated render after switching events: that render
    // records the loaded state as the saved baseline instead of writing it.
    const openBaselineNeededRef = useRef<boolean>(false);
    const pendingSaveRef = useRef(false);

    useEffect(() => {
        if (prevEventIdForSaveRef.current !== eventId) {
            prevEventIdForSaveRef.current = eventId;
            lastSavedPayloadRef.current = "";
            lastSavedCalendarRef.current = null;
            // An event that has just been written FROM this form is not an
            // event being opened: the note was written from the title as it
            // stood when the write began, and typing does not pause for it, so
            // the panel is usually a character or two ahead of the file. Taking
            // what it holds as already-saved would strand those characters.
            // Everything on screen is written out instead — the note was made a
            // moment ago from this same form, so there is nothing to preserve
            // by not writing it.
            openBaselineNeededRef.current = !committedFromThisFormRef.current;
            committedFromThisFormRef.current = false;
            return;
        }

        if (isDraft || !stableEvent || !eventId || !stableCalInfo.editable) {
            return;
        }

        const payload = form.buildPayload();
        const { completed: _c, ...payloadRest } = payload as NeoEvent & {
            completed?: unknown;
        };
        const serialized = JSON.stringify(payloadRest);

        // First populated render after opening this event: adopt the loaded
        // state as the saved baseline and write nothing. Otherwise this effect's
        // reset-to-"" above would make the freshly-loaded payload differ from ""
        // and fire a save on open — which, for a legacy `recurring` note, would
        // silently rewrite it to `rrule` just from being viewed. A real edit
        // changes `serialized` from this baseline and triggers the save below.
        if (openBaselineNeededRef.current) {
            openBaselineNeededRef.current = false;
            lastSavedPayloadRef.current = serialized;
            lastSavedCalendarRef.current = form.calendarIndex;
            return;
        }

        const calendarChanged =
            lastSavedCalendarRef.current !== null &&
            lastSavedCalendarRef.current !== form.calendarIndex;
        if (serialized === lastSavedPayloadRef.current && !calendarChanged)
            return;
        lastSavedPayloadRef.current = serialized;
        lastSavedCalendarRef.current = form.calendarIndex;

        if (scopeNeededRef.current) {
            heldEditRef.current = true;
            return;
        }

        // If a save is already in progress, mark it as pending and return.
        // The save will be retried once the current one finishes.
        if (savingRef.current) {
            pendingSaveRef.current = true;
            return;
        }
        debouncedAutoSave();
    }, [
        form.title,
        form.date,
        form.endDate,
        form.startTime,
        form.endTime,
        form.allDay,
        form.isRecurring,
        form.recurrence,
        form.calendarIndex,
        form.taskStatus,
        form.description,
        form.location,
        isDraft,
        stableEvent,
        eventId,
        stableCalInfo.editable,
        debouncedAutoSave,
    ]);

    // Retry pending saves after the current one finishes
    useEffect(() => {
        if (!savingRef.current && pendingSaveRef.current) {
            pendingSaveRef.current = false;
            autoSave();
        }
    });

    // ── Auto-commit named grid drafts ─────────────────────────

    const draftCommittingRef = useRef(false);

    useEffect(() => {
        if (
            shouldAutoCommitDraft({
                isDraft,
                hasDraft: Boolean(draft),
                date: form.date,
                title: form.title,
                alreadyCommitting: draftCommittingRef.current,
            })
        ) {
            draftCommittingRef.current = true;
            commitDraftIfNeeded();
        }
    }, [isDraft, draft, form.date, form.title, commitDraftIfNeeded]);

    useEffect(() => {
        if (!isDraft) {
            draftCommittingRef.current = false;
        }
    }, [isDraft]);

    // ── What this entry is, and how often ─────────────────────

    /*
     * A birthday is read, not recorded.
     *
     * It is an all-day event that comes back every year on its own date — which
     * the note already says, in `allDay` and in the rule. Storing a third kind
     * beside them would say it twice, and would say it only for the ones
     * written after today; read this way, every yearly all-day event ever
     * written is one, including the ones the calendar did not create.
     */
    const isBirthday =
        !isTask &&
        form.allDay &&
        form.isRecurring &&
        form.recurrence.freq === "yearly";
    const entryKind: EntryKind = isTask
        ? "task"
        : isBirthday
        ? "birthday"
        : "event";

    const currentPreset: PresetKey = useMemo(
        () => matchPreset(form.recurrence, form.date),
        [form.recurrence, form.date]
    );

    const repeatSummary = useMemo(
        () => recurrenceSummary(form.recurrence, form.date),
        [form.recurrence, form.date]
    );

    /** True while a rule is being built by hand rather than picked. */
    const [customRepeat, setCustomRepeat] = useState(false);
    useEffect(() => {
        setCustomRepeat(false);
    }, [eventId]);

    // Birthday is a temporary presentation of an existing entry. Keep the
    // schedule it replaced so Event -> Birthday -> Event is reversible while
    // the panel stays open (including the exact timed-grid position).
    const birthdayReturnStateRef = useRef<BirthdayReturnState | null>(null);
    const birthdayReturnOwner =
        eventId ??
        (draft ? `${draft.start.getTime()}:${draft.end.getTime()}` : null);
    useEffect(() => {
        birthdayReturnStateRef.current = null;
    }, [birthdayReturnOwner]);

    const toggleAllDay = () => {
        const next = !form.allDay;
        form.setAllDay(next);
        // Un-checking all-day moves the event into the timed grid. An event
        // that was always all-day has no times, so without a default
        // buildPayload emits empty times, which the expansion resolves to
        // 00:00 — the event would stick to the top of the day. Seed noon
        // (12:00–12:30) so it drops into the middle of the day. Guard on an
        // empty startTime so a previously-timed event toggled back keeps its
        // original hours.
        if (!next && !form.startTime) {
            form.setStartTime("12:00");
            form.setEndTime("12:30");
        }
        scheduleAutoSave();
    };

    /* The page where a rule is written by hand, open or not. Closed when the
       panel opens on an event that already has one: it is shown as a summary
       on the repeat row, and reopened only by asking for it again. */
    const [customRecurrenceOpen, setCustomRecurrenceOpen] = useState(false);

    const chooseRepeat = (key: PresetKey | "once") => {
        if (key === "once") {
            setCustomRepeat(false);
            form.setIsRecurring(false);
            scheduleAutoSave();
            return;
        }
        setCustomRepeat(key === "custom");
        // Choosing "Custom…" is a request to write a rule, so the page for
        // writing it comes up rather than unfolding under the row.
        setCustomRecurrenceOpen(key === "custom");
        form.setIsRecurring(true);
        form.setRecurrence(
            key === "custom"
                ? form.isRecurring
                    ? form.recurrence
                    : defaultRecurrence(form.date)
                : presetToRecurrence(key, form.date)
        );
        // A deadline describes one day, and a series has none.
        form.setDue(null);
        scheduleAutoSave();
    };

    /**
     * Choosing what an entry is. Birthday is encoded by the existing all-day +
     * yearly shape, so explicitly leaving it must clear that yearly marker; if
     * it does not, `entryKind` is inferred as Birthday again on the next render.
     */
    const setEntryKind = (kind: EntryKind) => {
        applyEntryKindSelection({
            currentKind: entryKind,
            nextKind: kind,
            date: form.date,
            currentAllDay: form.allDay,
            currentIsRecurring: form.isRecurring,
            currentRecurrence: form.recurrence,
            currentStartTime: form.startTime,
            currentEndTime: form.endTime,
            birthdayReturnState: birthdayReturnStateRef.current,
            setBirthdayReturnState: (state) => {
                birthdayReturnStateRef.current = state;
            },
            setTaskStatus: form.setTaskStatus,
            setAllDay: form.setAllDay,
            setIsRecurring: form.setIsRecurring,
            setRecurrence: form.setRecurrence,
            setStartTime: form.setStartTime,
            setEndTime: form.setEndTime,
            setDue: form.setDue,
            setCustomRepeat,
        });
        scheduleAutoSave();
    };

    // ── Computed ──────────────────────────────────────────────

    const dateLabel = useMemo(() => formatPanelDate(form.date), [form.date]);

    // Multi-day events already own an explicit endDate. The previous UI ignored
    // it and only guessed "tomorrow" from an overnight time range, which made a
    // Fri→Mon event either look single-day or show the wrong Saturday endpoint.
    const endDateValue = useMemo(
        () =>
            panelEndDate(
                form.date,
                form.endDate,
                form.allDay,
                form.startTime,
                form.endTime
            ),
        [form.date, form.endDate, form.allDay, form.startTime, form.endTime]
    );
    const endDateLabel = useMemo(
        () => (endDateValue ? formatPanelDate(endDateValue) : ""),
        [endDateValue]
    );

    // The days the event spans, so the duration counts them. Read from the two
    // dates rather than from the times: 13:00 to 13:00 is nothing at all inside
    // one day and a full day across two.
    const dayGap = useMemo(
        () => daysBetween(form.date, endDateValue),
        [form.date, endDateValue]
    );
    const duration = useMemo(
        () => computeDuration(form.startTime, form.endTime, dayGap),
        [form.startTime, form.endTime, dayGap]
    );

    const computedLeft = dragOffset ? dragOffset.x : position.left;
    const computedTop = dragOffset ? dragOffset.y : position.top;

    if (!visible) return null;
    if (!isDraft && !stableEvent && !committingDraft) return null;

    // Portaled to <body> so its position:fixed is relative to the VIEWPORT.
    // The calendar's .workspace-leaf ancestor has `contain: strict`, which makes
    // it the containing block for fixed descendants — so a popup rendered inside
    // it would be offset by the leaf's origin (the width of Obsidian's left
    // sidebar), landing several columns off. Body-level escapes that.
    // NEO_ANDROID_PORTAL_TARGET_V3_START
    const androidDraft = isDraft && isNeoAndroidRuntime();
    const portalTarget = isNeoAndroidRuntime()
        ? document.getElementById("nc-android-overlay-root") ?? document.body
        : document.body;
    // NEO_ANDROID_PORTAL_TARGET_V3_END

    const scopeChanges =
        scopeAsked && stableEvent
            ? recurringEditChanges(stableEvent, form.buildPayload(), {
                  previousCalendarId: originalCalendarIdRef.current,
                  nextCalendarId:
                      editableCalendars[form.calendarIndex]?.id ?? null,
                  previousCalendarLabel: stableCalInfo.name,
                  nextCalendarLabel:
                      editableCalendars[form.calendarIndex]?.name ??
                      stableCalInfo.name,
              })
            : [];

    return ReactDOM.createPortal(
        <>
            {/* Blurs whatever is behind the popup, and only that — no click
                handler, so every existing way of dismissing or interacting
                with the popup (the outside-pointerdown listener, drag,
                whatever else) still sees exactly the events it always saw. */}
            <div className="nc-event-popup-backdrop" aria-hidden="true" />
            <div
                ref={popupRef}
                className={`nc-event-popup nc-placement-${position.placement}${
                isDraft ? " nc-event-popup--draft" : ""
            }${androidDraft ? " nc-event-popup--android-draft" : ""}${
                leaving ? ` ${PANEL_EXIT_CLASS}` : ""
            }`}
            // The panel is taken off the screen when its exit animation says it
            // is done, rather than after a duration copied out of the
            // stylesheet: one place decides how long leaving takes, and the
            // reduced-motion rule that shortens every animation to 1 ms is
            // obeyed for free.
            onAnimationEnd={(e) => {
                if (
                    !panelHasLeft({
                        leaving,
                        animationName: e.animationName,
                        fromPanel: e.target === e.currentTarget,
                    })
                )
                    return;
                onClose();
            }}
            role="dialog"
            aria-label={isDraft ? "New event" : "Event details"}
            style={{
                left: computedLeft,
                top: computedTop,
                width: position.width,
                // PAS de maxHeight en inline : posee ici, elle battrait la
                // regle CSS et resterait figee a la hauteur du viewport
                // d'ouverture. Le clavier virtuel d'Android ampute environ 40 %
                // de la hauteur APRES coup, sans re-render — le panneau
                // debordait alors, bas inatteignable. La borne vit donc dans
                // CalendarOverlays.css, en `dvh`, qui suit la hauteur
                // reellement visible. POPUP_MAX_HEIGHT y est repris a
                // l'identique et sert encore ici au calcul du placement.
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
                if (e.key === "Escape") {
                    requestCloseGuarded();
                }
                e.stopPropagation();
            }}
        >
            <PanelHeader
                headerRef={headerRef}
                sheetHandle={sheetHandle}
                isDraft={isDraft}
                isTask={isTask}
                kind={entryKind}
                setKind={setEntryKind}
                editable={stableCalInfo.editable}
                eventId={eventId}
                menuOpen={menuOpen}
                menuRef={menuRef}
                onHeaderMouseDown={handleHeaderMouseDown}
                onToggleMenu={() => setMenuOpen((v) => !v)}
                onOpenFile={(id) => {
                    setMenuOpen(false);
                    onOpenFile(id);
                }}
                onCopyFilePath={
                    onCopyFilePath
                        ? (id) => {
                              setMenuOpen(false);
                              void onCopyFilePath(id)
                                  .then(() =>
                                      setCopyPathToast({
                                          title: t("Path copied"),
                                          detail: t(
                                              "Paste it wherever you like"
                                          ),
                                      })
                                  )
                                  .catch(() => {
                                      // The desktop shell reports the concrete
                                      // filesystem error in its usual banner.
                                  });
                          }
                        : undefined
                }
                onDuplicate={
                    onDuplicate
                        ? (id) => {
                              // Same exit as deleting: the copy lands on the
                              // slot the panel is covering, so staying open on
                              // the original hides the thing just made.
                              setMenuOpen(false);
                              onDuplicate(id);
                              // The copy was made from the note, not from what
                              // is held here; asking about the held edit on top
                              // of it would stack two answers on one gesture.
                              heldEditRef.current = false;
                              leave();
                          }
                        : undefined
                }
                onDeleteClick={() => {
                    setMenuOpen(false);
                    handleDeleteClick();
                }}
                onClose={requestCloseGuarded}
            />

            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    if (isDraft) commitDraftIfNeeded();
                }}
                className="nc-panel-body"
            >
                <TitleRow
                    title={form.title}
                    editable={stableCalInfo.editable}
                    inputRef={titleInputRef}
                    onChange={form.setTitle}
                    onCommit={onTitleCommit}
                />

                <div className="nc-panel-section nc-panel-section-schedule">
                    <DateRow
                        date={form.date}
                        dateLabel={dateLabel}
                        endDateLabel={endDateLabel}
                        endDate={endDateValue}
                        startTime={form.startTime}
                        endTime={form.endTime}
                        duration={duration}
                        allDay={form.allDay}
                        isRecurring={form.isRecurring}
                        editable={stableCalInfo.editable}
                        firstDay={firstDay}
                        setDate={form.setDate}
                        setEndDate={form.setEndDate}
                        setStartTime={form.setStartTime}
                        setEndTime={form.setEndTime}
                        // Back to the unscheduled list. Every field that only a
                        // DATED event can carry has to go with the date, because
                        // buildPayload reads them all: a repeat left standing would
                        // send the payload down the rrule branch and write a series
                        // whose start date is the empty string, and times left
                        // standing would keep `allDay: false` — the one thing a
                        // someday can never be — leaving stale hours in the note.
                        //
                        // The same note the drag-onto-the-panel route writes, by the
                        // same reasoning: see buildUnscheduledPayload.
                        //
                        // Nothing is saved from here. The panel's change-watching
                        // effect already follows date, endDate, allDay, startTime,
                        // endTime and isRecurring, and fires once React has applied
                        // the finished state.
                        onClearDate={
                            isDraft
                                ? undefined
                                : () => {
                                      form.setDate("");
                                      form.setEndDate(undefined);
                                      form.setIsRecurring(false);
                                      form.setAllDay(true);
                                      form.setStartTime("");
                                      form.setEndTime("");
                                  }
                        }
                        onAutoSave={autoSave}
                    />

                    <DateOptionsRow
                        allDay={form.allDay}
                        editable={stableCalInfo.editable}
                        onToggleAllDay={toggleAllDay}
                        isRecurring={form.isRecurring}
                        currentPreset={currentPreset}
                        summary={repeatSummary}
                        onChooseRepeat={chooseRepeat}
                        onStepOccurrence={
                            onGoToOccurrence &&
                            (previousOccurrence || nextOccurrence)
                                ? stepOccurrence
                                : undefined
                        }
                        canStepBack={Boolean(previousOccurrence)}
                        canStepForward={Boolean(nextOccurrence)}
                    />

                    {form.isRecurring &&
                        customRepeat &&
                        customRecurrenceOpen && (
                            <CustomRecurrencePanel
                                recurrence={form.recurrence}
                                startDate={form.date}
                                firstDay={firstDay}
                                setRecurrence={form.setRecurrence}
                                onAutoSave={scheduleAutoSave}
                                onClose={() => setCustomRecurrenceOpen(false)}
                            />
                        )}
                </div>

                <div className="nc-panel-section nc-panel-section-properties">
                    <CalendarRow
                        editableCalendars={editableCalendars}
                        calendarIndex={form.calendarIndex}
                        editable={stableCalInfo.editable}
                        readOnlyCalendar={
                            stableCalInfo.editable || isDraft
                                ? null
                                : {
                                      name: stableCalInfo.name,
                                      color: stableCalInfo.color,
                                  }
                        }
                        onChange={form.setCalendarIndex}
                        onAutoSave={autoSave}
                    />

                    {/* Only for something that happens at a time: an entry
                    waiting in the unscheduled list has no moment to be early
                    for. */}
                    {(form.date || form.isRecurring) && (
                        <RemindersRow
                            reminders={form.reminders}
                            editable={stableCalInfo.editable}
                            setReminders={form.setReminders}
                            onAutoSave={scheduleAutoSave}
                        />
                    )}

                    {/* Ou l'evenement se tient, juste au-dessus de ce qu'il
                        raconte : la place que Notion Calendar lui donne, et
                        celle ou on la cherche. */}
                    <LocationRow
                        location={form.location}
                        geo={stableEvent?.geo}
                        linkAddress={linkAddress}
                        travelMode={travelMode}
                        editable={stableCalInfo.editable}
                        setLocation={form.setLocation}
                        onAutoSave={scheduleAutoSave}
                        onOpenLocation={onOpenLocation}
                    />
                </div>

                <DescriptionSection
                    description={form.description}
                    editable={stableCalInfo.editable}
                    setDescription={form.setDescription}
                    onCommit={onTitleCommit}
                    eventId={eventId}
                    vaults={linkVaults}
                    items={linkedItems}
                    onSearch={onSearchEventLinks}
                    onAddLink={onAddEventLink}
                    onRemoveLink={onRemoveEventLink}
                    onRenameLink={onRenameEventLink}
                    onOpenLink={onOpenEventLink}
                    onCopyLink={onCopyEventLink}
                    onPickAttachment={onPickEventAttachment}
                    onReadAttachment={onReadEventAttachment}
                />
            </form>

            {scopeAsked && (
                <RecurringScopeDialog
                    isTask={isTask}
                    changes={scopeChanges}
                    onCancel={cancelScopedEdit}
                    onConfirm={confirmScopedEdit}
                />
            )}

            {copyPathToast && (
                <Toast
                    message={copyPathToast}
                    onClose={() => setCopyPathToast(null)}
                />
            )}

            {/* Read-only events (holidays, .ics) are backed by no note at all,
                so the footer would open nothing. */}
            {(isDraft || stableCalInfo.editable) && (
                <div className="nc-panel-foot">
                    <button
                        type="button"
                        className="nc-panel-foot-btn"
                        disabled={isDraft || !eventId}
                        title={
                            isDraft || !eventId
                                ? t("Available once the event is created")
                                : undefined
                        }
                        onClick={() => eventId && onOpenFile(eventId)}
                    >
                        <FileTextIcon />
                        {t("View note")}
                    </button>
                </div>
            )}
        </div>
        </>,
        portalTarget
    );
}
