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
    computeDuration,
    computePopupPosition,
    hasDraftCreationIntent,
    shouldAutoCommitDraft,
} from "./EventPanel.helpers";
import { usePopupDismiss } from "./usePopupDismiss";
import { usePopupDrag } from "./usePopupDrag";
import { useEventFormState } from "./useEventFormState";
import {
    PanelHeader,
    TitleRow,
    DateRow,
    RecurrenceRow,
    CalendarRow,
    StatusRow,
    LinksAttachmentsRow,
    DescriptionRow,
} from "./EventPanelRows";
import { FileTextIcon } from "./EventPanelIcons";
import { defaultRecurrence } from "./recurrence";
import { mergeForSave } from "./eventScheduling";

/* NEO_ANDROID_RUNTIME_HELPER_V3_START */
function isNeoAndroidRuntime(): boolean {
    return (
        Boolean(
            (window as Window & { NeoAndroid?: unknown }).NeoAndroid
        ) ||
        document.documentElement.classList.contains(
            "nc-platform-android"
        ) ||
        document.body.classList.contains(
            "nc-platform-android"
        ) ||
        document.documentElement.dataset.neoCalendarPlatform ===
            "android"
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
    onDelete: (id: string) => void;
    firstDay: number;
    linkVaults?: EventLinkVault[];
    onSearchEventLinks?: (
        query: string,
        vaultPath?: string
    ) => Promise<EventLinkTarget[]>;
    linkedItems?: EventLinkedItem[];
    onAddEventLink?: (eventId: string, markdown: string) => Promise<void>;
    onRemoveEventLink?: (eventId: string, target: string) => Promise<void>;
    onOpenEventLink?: (item: EventLinkedItem) => Promise<void> | void;
    onPickEventAttachment?: (eventId: string) => Promise<void>;
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
    onDelete,
    firstDay,
    linkVaults = [],
    onSearchEventLinks,
    linkedItems = [],
    onAddEventLink,
    onRemoveEventLink,
    onOpenEventLink,
    onPickEventAttachment,
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
    });

    // NEO_ANDROID_DRAFT_LIVE_TIME_V7_2_START
    useEffect(() => {
        if (
            !isDraft ||
            !draft ||
            draft.allDay
        ) {
            return;
        }

        const pad = (value: number) =>
            String(value).padStart(2, "0");

        const dateValue =
            `${draft.start.getFullYear()}-` +
            `${pad(draft.start.getMonth() + 1)}-` +
            `${pad(draft.start.getDate())}`;

        const startValue =
            `${pad(draft.start.getHours())}:` +
            `${pad(draft.start.getMinutes())}`;

        const endValue =
            `${pad(draft.end.getHours())}:` +
            `${pad(draft.end.getMinutes())}`;

        if (form.date !== dateValue) {
            form.setDate(dateValue);
        }

        if (
            form.startTime !==
            startValue
        ) {
            form.setStartTime(
                startValue
            );
        }

        if (
            form.endTime !==
            endValue
        ) {
            form.setEndTime(
                endValue
            );
        }
    }, [
        isDraft,
        draft?.start.getTime(),
        draft?.end.getTime(),
        draft?.allDay,
    ]);
    // NEO_ANDROID_DRAFT_LIVE_TIME_V7_2_END

    // ── Popup behavior ────────────────────────────────────────

    // The clicked anchor's CURRENT geometry, re-read live from the DOM (the
    // event block, or the draft preview) rather than the open-time rect. When
    // the calendar re-lays-out — collapsing/expanding Obsidian's sidebar shifts
    // and resizes the day columns — recomputing from the live rect lets the
    // panel travel WITH its event, so it appears to stay put instead of being
    // stranded at its original viewport coordinates. Falls back to the open-time
    // rect when the element isn't in the DOM (e.g. scrolled out).
    const getAnchorRect = useCallback((): DOMRect | null => {
        if (eventId) {
            const el = document.querySelector(
                `[data-event-id="${CSS.escape(eventId)}"]`
            );
            if (el) return el.getBoundingClientRect();
        }
        const draftEl = document.querySelector("[data-draft-preview]");
        if (draftEl) return draftEl.getBoundingClientRect();
        return anchorRect;
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

    usePopupDismiss({ visible, popupRef, menuRef, onClose });

// NEO_ANDROID_NOTION_DRAFT_FOCUS_START
    useEffect(() => {
        if (!isDraft || !visible) return;

        if (isNeoAndroidRuntime()) {
            const active = document.activeElement;

            if (active instanceof HTMLElement) {
                active.blur();
            }

            titleInputRef.current?.blur();

            window.setTimeout(() => {
                const current = document.activeElement;

                if (current instanceof HTMLElement) {
                    current.blur();
                }

                titleInputRef.current?.blur();
            }, 80);

            return;
        }

        titleInputRef.current?.focus();
    }, [isDraft, visible]);
    // NEO_ANDROID_NOTION_DRAFT_FOCUS_END

    // Refocus title input after draft commits (draft→edit transition)
    const justCommittedDraftRef = useRef(false);

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
            titleInputRef.current?.focus();
        });
    }, [eventId, visible]);
    // NEO_ANDROID_NOTION_COMMIT_FOCUS_END

    // ── Menu / delete ─────────────────────────────────────────

    const [menuOpen, setMenuOpen] = useState(false);

    useEffect(() => {
        if (!menuOpen) return;
        const onDown = (e: MouseEvent) => {
            if (
                menuRef.current &&
                !menuRef.current.contains(e.target as Node)
            ) {
                setMenuOpen(false);
            }
        };
        document.addEventListener("mousedown", onDown);
        return () => document.removeEventListener("mousedown", onDown);
    }, [menuOpen]);

    const handleDeleteClick = () => {
        if (!eventId) return;
        onDelete(eventId);
        onClose();
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

    // ── Save ──────────────────────────────────────────────────

    const isTask = form.taskStatus !== null;

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

    const commitDraftIfNeeded = useCallback(() => {
        if (!isDraft || !draft) return;
        if (!form.date) return;
        if (!hasDraftCreationIntent(form.title)) return;
        justCommittedDraftRef.current = true;
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
            openBaselineNeededRef.current = true;
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
        form.startTime,
        form.endTime,
        form.allDay,
        form.isRecurring,
        form.recurrence,
        form.calendarIndex,
        form.taskStatus,
        form.description,
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

    // ── Computed ──────────────────────────────────────────────

    const duration = useMemo(
        () => computeDuration(form.startTime, form.endTime),
        [form.startTime, form.endTime]
    );
    const dateLabel = useMemo(() => formatDateLong(form.date), [form.date]);
    // End date, shown only when the event crosses midnight (endTime < startTime
    // means it ends the next day) — Notion shows both start and end dates.
    const endDateLabel = useMemo(() => {
        if (form.allDay || !form.startTime || !form.endTime) return "";
        if (form.endTime >= form.startTime) return "";
        const d = new Date(form.date + "T00:00:00");
        if (Number.isNaN(d.getTime())) return "";
        d.setDate(d.getDate() + 1);
        return formatDateParts(d);
    }, [form.allDay, form.startTime, form.endTime, form.date]);

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
        ? document.getElementById("nc-android-overlay-root") ??
          document.body
        : document.body;
    // NEO_ANDROID_PORTAL_TARGET_V3_END

    return ReactDOM.createPortal(
        <div
            ref={popupRef}
            className={`nc-event-popup nc-placement-${position.placement}${isDraft ? " nc-event-popup--draft" : ""}${androidDraft ? " nc-event-popup--android-draft" : ""}`}
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
                    onClose();
                }
                e.stopPropagation();
            }}
        >
            <PanelHeader
                isDraft={isDraft}
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
                onDeleteClick={() => {
                    setMenuOpen(false);
                    handleDeleteClick();
                }}
                onClose={onClose}
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

                <DateRow
                    date={form.date}
                    dateLabel={dateLabel}
                    endDateLabel={endDateLabel}
                    startTime={form.startTime}
                    endTime={form.endTime}
                    duration={duration}
                    allDay={form.allDay}
                    isRecurring={form.isRecurring}
                    editable={stableCalInfo.editable}
                    firstDay={firstDay}
                    setDate={form.setDate}
                    setStartTime={form.setStartTime}
                    setEndTime={form.setEndTime}
                    toggleAllDay={() => {
                        const next = !form.allDay;
                        form.setAllDay(next);
                        // Un-checking all-day moves the event into the timed
                        // grid. An event that was always all-day has no times,
                        // so without a default buildPayload emits empty times,
                        // which the expansion resolves to 00:00 — the event
                        // would stick to the top of the day. Seed noon
                        // (12:00–12:30) so it drops into the middle of the day.
                        // Guard on an empty startTime so a previously-timed
                        // event toggled back keeps its original hours.
                        if (!next && !form.startTime) {
                            form.setStartTime("12:00");
                            form.setEndTime("12:30");
                        }
                        scheduleAutoSave();
                    }}
                    toggleRecurring={() => {
                        const next = !form.isRecurring;
                        form.setIsRecurring(next);
                        if (next)
                            form.setRecurrence(defaultRecurrence(form.date));
                        scheduleAutoSave();
                    }}
                    onAutoSave={autoSave}
                />

                {form.isRecurring && (
                    <RecurrenceRow
                        recurrence={form.recurrence}
                        startDate={form.date}
                        firstDay={firstDay}
                        setRecurrence={form.setRecurrence}
                        onAutoSave={scheduleAutoSave}
                    />
                )}

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

                {isTask && (
                    <StatusRow
                        taskStatus={form.taskStatus}
                        editable={stableCalInfo.editable}
                        setStatus={(s) => {
                            form.setTaskStatus(s);
                            scheduleAutoSave();
                        }}
                    />
                )}

                {(isDraft || stableCalInfo.editable) && (
                    <LinksAttachmentsRow
                        eventId={eventId}
                        disabled={isDraft || !eventId}
                        vaults={linkVaults}
                        items={linkedItems}
                        onOpenNote={() => eventId && onOpenFile(eventId)}
                        onSearch={onSearchEventLinks}
                        onAddLink={onAddEventLink}
                        onRemoveLink={onRemoveEventLink}
                        onOpenLink={onOpenEventLink}
                        onPickAttachment={onPickEventAttachment}
                    />
                )}

                <DescriptionRow
                    description={form.description}
                    editable={stableCalInfo.editable}
                    setDescription={form.setDescription}
                    onCommit={onTitleCommit}
                />
            </form>

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
                                ? "Available once the event is created"
                                : undefined
                        }
                        onClick={() => eventId && onOpenFile(eventId)}
                    >
                        <FileTextIcon />
                        View note
                    </button>
                </div>
            )}
        </div>,
        portalTarget
    );
}
