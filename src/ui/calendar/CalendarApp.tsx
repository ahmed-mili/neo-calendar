import * as React from "react";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Notice } from "obsidian";
import {
    CalendarAppProps,
    DisplayEvent,
    CalendarSource,
    ViewType,
} from "../types";
import { NeoEvent } from "../../types";
import { EditableCalendar } from "../../calendars/EditableCalendar";
import { getTaskStatus, isTask } from "../tasks";
import { collectTasks, todayISO } from "../tasks/taskList";
import {
    ScissorsIcon,
    CopyIcon,
    DuplicateIcon,
    FileTextIcon,
    TrashIcon,
} from "./Icons";
import {
    getWeekStart,
    addDays,
    isToday,
    neoEventToDisplayEvents,
    eventSourceToCalendarSource,
    startOfDay,
    endOfDay,
    getEventTop,
} from "./CalendarUtils";
import CalendarLayout from "./CalendarLayout";
import { TimezoneMenuContext, TimezoneMenuActions } from "./TimezoneColumn";
import { openTimezonePicker, openTimezoneRename } from "./timezoneModals";
import { TimezoneChangePrompt } from "./TimezoneChangePrompt";
import { TimezoneUpdate, useTimezoneDrift } from "./useTimezoneDrift";
import useKeyboardShortcuts from "./useKeyboardShortcuts";
import CommandPalette from "./CommandPalette";
import EventPanel from "./EventPanel";
import ContextMenu, { ContextMenuItem } from "./ContextMenu";
import { ClipboardProvider, useClipboard } from "./ClipboardContext";
import { useClipboardActions } from "./useClipboardActions";
import { useCalendarNavigation } from "./useCalendarNavigation";
import { useCalendarVisibility } from "./useCalendarVisibility";
import { pickDefaultCalendarAfterHide } from "./defaultCalendar";
import { buildTargetMap } from "./autoTargets";
import { useEventPanel } from "./useEventPanel";
import { useDraftEvent } from "./useDraftEvent";
import { useEventDragResize } from "./useEventDragResize";
import { useCalendarManagement } from "./useCalendarManagement";
import {
    createUnscheduledPanelEvent,
    getDisplayTitle,
} from "./CalendarEventsPanel.helpers";
import { DragPreview } from "./TimeGrid.types";
import { PanelDropTarget } from "./usePanelDrag";
import { t } from "../i18n";

/**
 * La disposition est-elle contrainte au point que la barre laterale doive
 * sortir du flux ? Deux cas : un ecran ETROIT, et un telephone en PAYSAGE —
 * large mais bas, que le seul critere de largeur classait avec les tablettes.
 * Doit rester le miroir exact de la media query de CalendarPanel.css : c'est
 * elle qui decide de la mise en page, ceci n'en decide que l'etat initial.
 */
function isCompactLayout(): boolean {
    if (window.innerWidth <= 768) return true;
    return (
        window.innerHeight <= 500 &&
        window.matchMedia("(pointer: coarse)").matches
    );
}

function CalendarAppInner(props: CalendarAppProps) {
    const { cache, settings } = props;

    // ── Extracted hooks ────────────────────────────────────

    const initialView: ViewType =
        window.innerWidth < 500
            ? (settings.initialView.mobile as ViewType) || "3days"
            : (settings.initialView.desktop as ViewType) || "week";

    const {
        currentDate,
        setCurrentDate,
        viewType,
        setViewType,
        goToDateInView,
        dayCount,
        setDaysCount,
        goToday,
        alignToday,
        goPrev,
        goNext,
        shiftDays,
        shiftMonths,
    } = useCalendarNavigation(initialView, settings.firstDay);

    const {
        hiddenCalendars,
        setHiddenCalendars,
        handleToggleCalendar,
        soloCalendarId,
        handleShowOnly,
        calendarVisibilityTransitions,
        finishCalendarVisibilityTransition,
    } = useCalendarVisibility(settings, props.plugin);

    const {
        panelEventId,
        setPanelEventId,
        panelAnchor,
        setPanelAnchor,
        handleEventClick,
    } = useEventPanel();

    const { handleEventDrag, handleEventResize, handleEventUnschedule } =
        useEventDragResize(cache);

    // ── Drag depuis le panneau d'evenements (Task 5/6) ──────
    // Cadre d'atterrissage du drag venu du panneau. Vit ici parce que la source
    // (le panneau) et la cible (la vue) sont deux freres du layout.
    const [panelPreview, setPanelPreview] = useState<DragPreview | null>(null);

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
            // Un pointermove par pixel, mais le cadre ne change que de creneau
            // en creneau : garder l'objet precedent quand rien n'a bouge evite de
            // re-rendre CalendarApp, CalendarLayout et tout l'arbre de la vue a
            // chaque pixel. Meme comparaison que setDragPreview dans
            // useTimeGridDrag.
            setPanelPreview((prev) =>
                prev &&
                prev.event.id === next.event.id &&
                prev.event.allDay === next.event.allDay &&
                prev.newStart.getTime() === next.newStart.getTime() &&
                prev.newEnd.getTime() === next.newEnd.getTime()
                    ? prev
                    : next
            );
        },
        []
    );

    const handlePanelDrop = useCallback(
        (event: DisplayEvent, start: Date, end: Date, allDay: boolean) => {
            setPanelPreview(null);
            void handleEventDrag(event.id, start, end, allDay);
        },
        [handleEventDrag]
    );

    // ── Multi-selection (Ctrl/Cmd+click) ───────────────────
    // A set of event ids selected together. Empty = single-selection mode (the
    // panel drives selection via panelEventId). Ctrl/Cmd+click toggles ids in
    // here instead of opening the panel, so group actions (delete, duplicate…)
    // can act on the whole set.
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const clearMultiSelection = useCallback(() => {
        setSelectedIds((prev) => (prev.size ? new Set() : prev));
    }, []);

    // ── Calendar events panel (click a calendar in the sidebar) ─────
    // Which calendar's event list is open on the right, or null. Clicking the
    // same calendar again toggles it closed (Notion behaviour).
    const [selectedCalendarId, setSelectedCalendarId] = useState<string | null>(
        null
    );
    const handleCalendarClick = useCallback((calendarId: string) => {
        setSelectedCalendarId((prev) =>
            prev === calendarId ? null : calendarId
        );
    }, []);

    const handleEventSelect = useCallback(
        (eventId: string, additive?: boolean) => {
            if (additive) {
                // Fold the currently panel-selected event into the multi-
                // selection so "click A, then Ctrl+click B" selects BOTH, not
                // just B. Without this, A (held only in panelEventId, and
                // cleared just below) is dropped from every target set, so a
                // group delete would spare it — leaving one event behind.
                const panelId = panelEventId;
                setPanelEventId(null);
                setPanelAnchor(null);
                setSelectedIds((prev) => {
                    const next = new Set(prev);
                    if (panelId && panelId !== eventId) next.add(panelId);
                    if (next.has(eventId)) next.delete(eventId);
                    else next.add(eventId);
                    return next;
                });
                return;
            }
            // Plain click: back to single-selection.
            clearMultiSelection();
            handleEventClick(eventId);
        },
        [
            handleEventClick,
            panelEventId,
            setPanelEventId,
            setPanelAnchor,
            clearMultiSelection,
        ]
    );

    // ── Draft event ────────────────────────────────────────

    const {
        draftSlot,
        handleSelectRange,
        commitDraft,
        resizeDraft,
        discardDraft,
    } = useDraftEvent({
        cache,
        settings,
        clearPanelEventId: () => setPanelEventId(null),
        setDraftAnchor: () => {
            const el = document.querySelector(
                `[data-draft-preview="true"]`
            ) as HTMLElement | null;
            setPanelAnchor(el ? el.getBoundingClientRect() : null);
        },
        fallbackSelectRange: props.onSelectRange,
        // Un getter et non la valeur : `defaultCalendarId` est declare plus bas
        // dans ce composant (il a besoin de calendarSources), et le getter n'est
        // appele qu'au moment ou l'utilisateur commence une selection, donc bien
        // apres le premier rendu. C'est ce qui evite de reordonner le corps du
        // composant pour hisser la declaration.
        getDefaultCalendarId: () => defaultCalendarId,
    });

    // Track when a draft commit is in progress so we can hide the
    // draft preview from the calendar immediately (prevents the ghost
    // event flicker where both draft preview and committed event appear).
    const [committingDraft, setCommittingDraft] = useState(false);

    const handleDraftCommit = useCallback(
        async (
            title: string,
            updates?: Partial<NeoEvent>,
            calendarId?: string
        ) => {
            setCommittingDraft(true);
            // Hide the draft preview immediately to prevent visual overlap
            // with the committed event that will appear on the calendar.
            discardDraft();
            const id = await commitDraft(title, updates, calendarId);
            if (id) {
                setPanelEventId(id);
            }
            setCommittingDraft(false);
        },
        [commitDraft, setPanelEventId, discardDraft]
    );

    // ── State ──────────────────────────────────────────────

    const [sidebarVisible, setSidebarVisible] = useState(
        // Doit refleter le MEME critere que la media query qui sort la barre du
        // flux (CalendarPanel.css) : ecran etroit, OU telephone en paysage —
        // large mais bas. Sinon, en paysage, la barre demarre depliee et son
        // tiroir recouvre la grille des l'ouverture.
        !isCompactLayout()
    );
    const [commandPaletteVisible, setCommandPaletteVisible] = useState(false);
    // View setting: show the ISO week-numbers column in the mini calendar.
    // In-memory (a view toggle shouldn't trigger a settings save / cache rebuild).
    const [showWeekNumbers, setShowWeekNumbers] = useState(false);
    const [cacheVersion, setCacheVersion] = useState(0);
    const containerRef = React.useRef<HTMLDivElement>(null);

    // Shift-held hint pill + drag-to-select-multiple (marquee), Notion-style.
    // While Shift is held a hint pill shows at the bottom-center of the grid;
    // Shift+drag draws a rectangle that selects every event it touches.
    const [shiftHeld, setShiftHeld] = useState(false);
    const [marquee, setMarquee] = useState<{
        x0: number;
        y0: number;
        x1: number;
        y1: number;
    } | null>(null);

    // Multi-selection interactions: a plain empty click clears it; Shift shows
    // the hint pill and Shift+drag runs a marquee that selects every event it
    // touches (Notion-style); Escape clears.
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const isInteractive = (t: HTMLElement) =>
            !!(
                t.closest(".nc-event-block") ||
                t.closest(".nc-event-panel") ||
                t.closest(".menu") ||
                // Our own React context menu renders INSIDE this container, so a
                // left-click on it bubbles here. Without this guard the mousedown
                // is treated as an empty-space click and clears the multi-
                // selection BEFORE the menu's onClick runs — so "Delete N events"
                // then sees an empty selection and falls back to deleting only the
                // single right-clicked event. (`.menu` is Obsidian's native menu,
                // a different class — it does not cover ours.)
                t.closest(".nc-context-menu") ||
                t.closest(".nc-allday-collapse-btn") ||
                t.closest(".nc-tz-corner-btn")
            );

        // Select every event whose rendered rect intersects the marquee box.
        // A multi-day/all-day event renders several segments sharing one id; the
        // Set dedups them.
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
            el.querySelectorAll<HTMLElement>(
                ".nc-event-block[data-event-id]"
            ).forEach((node) => {
                const r = node.getBoundingClientRect();
                if (
                    r.left < right &&
                    r.right > left &&
                    r.top < bottom &&
                    r.bottom > top
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
        const onPress = (e: PointerEvent) => {
            if (e.button !== 0 || e.ctrlKey || e.metaKey) return;
            const t = e.target as HTMLElement;
            if (isInteractive(t)) return;

            if (e.shiftKey) {
                e.preventDefault();
                setPanelEventId(null);
                setPanelAnchor(null);
                // Hit-test in VIEWPORT coords (vx/vy), but store CONTAINER-LOCAL
                // coords for the box so its corner sits exactly at the pointer
                // tip: the box renders position:absolute inside this container,
                // and an Obsidian ancestor — not the viewport — is the actual
                // positioning origin, so raw clientX/Y would offset the box.
                const cb = el.getBoundingClientRect();
                const vx0 = e.clientX;
                const vy0 = e.clientY;
                const lx0 = vx0 - cb.left;
                const ly0 = vy0 - cb.top;
                setMarquee({ x0: lx0, y0: ly0, x1: lx0, y1: ly0 });
                selectInBox(vx0, vy0, vx0, vy0);
                const onMove = (ev: PointerEvent) => {
                    setMarquee({
                        x0: lx0,
                        y0: ly0,
                        x1: ev.clientX - cb.left,
                        y1: ev.clientY - cb.top,
                    });
                    selectInBox(vx0, vy0, ev.clientX, ev.clientY);
                };
                const onUp = () => {
                    window.removeEventListener("pointermove", onMove, true);
                    window.removeEventListener("pointerup", onUp, true);
                    setMarquee(null);
                };
                window.addEventListener("pointermove", onMove, true);
                window.addEventListener("pointerup", onUp, true);
                return;
            }
            clearMultiSelection();
        };

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Shift") setShiftHeld(true);
            if (e.key === "Escape") clearMultiSelection();
        };
        const onKeyUp = (e: KeyboardEvent) => {
            if (e.key === "Shift") setShiftHeld(false);
        };
        const onBlur = () => setShiftHeld(false);

        el.addEventListener("pointerdown", onPress);
        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("keyup", onKeyUp);
        window.addEventListener("blur", onBlur);
        return () => {
            el.removeEventListener("pointerdown", onPress);
            window.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("keyup", onKeyUp);
            window.removeEventListener("blur", onBlur);
        };
    }, [clearMultiSelection]);

    // ── Responsive layout ──────────────────────────────────
    useEffect(() => {
        if (!containerRef.current) return;
        let prevWidth = containerRef.current.getBoundingClientRect().width;
        const observer = new ResizeObserver((entries) => {
            const width = entries[0].contentRect.width;
            // Chromium fires ResizeObserver with 0×0 when the element is hidden
            // — e.g. when this calendar tab is moved to the background. Width 0
            // is not a real "narrowed to mobile" resize; acting on it would
            // force the mobile initial view and clobber the user's current view
            // when they switch back to the tab. Ignore it (and don't record it
            // as prevWidth, so the return-to-foreground callback still compares
            // against the last real width).
            if (width === 0) return;
            if (width < 500 && prevWidth >= 500) {
                setViewType(
                    (settings.initialView.mobile as ViewType) || "3days"
                );
            }
            // Only flip the sidebar when crossing the 768px breakpoint, not on
            // every resize. Otherwise subpixel width fluctuations from
            // horizontal scroll / scrollbar visibility re-open the sidebar
            // after the user manually closed it.
            if (prevWidth >= 768 && width < 768) {
                setSidebarVisible(false);
            } else if (prevWidth < 768 && width >= 768) {
                setSidebarVisible(true);
            }
            prevWidth = width;
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, [settings.initialView]);

    // ── Calendar management (add, rename, delete, color) ────

    const {
        handleAddCalendar,
        handleRenameCalendar,
        handleEditCalendarLink,
        handleDeleteCalendar,
        handleColorChange,
        handleReorderCalendars,
        handleOpenCalendarFolder,
        handleOpenRootFolder,
    } = useCalendarManagement({
        settings,
        plugin: props.plugin,
        cache,
        setHiddenCalendars,
        invalidateCache: () => setCacheVersion((v) => v + 1),
    });

    // ── Subscribe to cache updates ─────────────────────────

    useEffect(() => {
        const callback = () => setCacheVersion((v) => v + 1);
        cache.on("update", callback);
        return () => {
            cache.off("update", callback);
        };
    }, [cache]);

    // ── Convert cache data to display format ────────────────

    // Fenetre d'expansion des evenements : le mois courant, deux mois avant,
    // trois apres. Elle ne depend donc QUE du mois — d'ou la cle, qui la garde
    // identique d'un jour a l'autre. Sans elle, le memo ci-dessous dependait de
    // `currentDate` et re-expansait toutes les recurrences de tous les
    // calendriers a chaque pas d'un jour, pour exactement le meme resultat.
    const rangeKey = `${currentDate.getFullYear()}-${currentDate.getMonth()}`;
    const [rangeStart, rangeEnd] = useMemo(
        () => [
            new Date(currentDate.getFullYear(), currentDate.getMonth() - 2, 1),
            new Date(currentDate.getFullYear(), currentDate.getMonth() + 3, 0),
        ],
        // currentDate est volontairement absent : seule sa composante mois
        // compte, et elle est portee par rangeKey.
        [rangeKey] // eslint-disable-line react-hooks/exhaustive-deps
    );

    const { displayEvents, somedayEvents, calendarSources } = useMemo(() => {
        const sources = cache.getAllEvents();
        const allEvents: DisplayEvent[] = [];
        const someday: DisplayEvent[] = [];

        // An auto calendar can file its events under another calendar; when it
        // does, its events borrow that calendar's id, colour and name.
        const targets = buildTargetMap(settings.calendarSources);
        const byId = new Map(sources.map((s) => [s.id, s]));
        const hostOf = (id: string) => {
            const targetId = targets.get(id);
            return targetId ? byId.get(targetId) : undefined;
        };

        for (const source of sources) {
            const host = hostOf(source.id);
            const shownId = host?.id ?? source.id;
            const shownColor = host?.color ?? source.color;
            const calName = cache.getCalendarById(shownId)?.name || shownId;
            for (const { event, id } of source.events) {
                if (event.type === "someday") {
                    someday.push({
                        id,
                        title: getDisplayTitle(event.title),
                        start: new Date(),
                        end: new Date(),
                        allDay: true,
                        color: shownColor,
                        editable: source.editable,
                        calendarId: shownId,
                        calendarName: calName,
                        isTask:
                            event.completed !== undefined &&
                            event.completed !== null,
                        taskCompleted: event.completed ?? false,
                        taskStatus: getTaskStatus(
                            event
                        ) as import("../tasks").TaskStatus,
                        isRecurring: false,
                        isMultiDay: false,
                        isSomeday: true,
                        description: event.description,
                    });
                    continue;
                }
                const displays = neoEventToDisplayEvents(
                    event,
                    id,
                    shownId,
                    calName,
                    shownColor,
                    source.editable,
                    rangeStart,
                    rangeEnd
                );
                allEvents.push(...displays);
            }
        }

        // A calendar that files into another one gets no row of its own.
        const calSources = sources
            .filter((s) => !targets.has(s.id))
            .map((s) => eventSourceToCalendarSource(s, cache.calendars as any));
        return {
            displayEvents: allEvents,
            somedayEvents: someday,
            calendarSources: calSources,
        };
    }, [cache, rangeStart, rangeEnd, cacheVersion]);

    // ── Events of the calendar open in the right-hand panel ─────────
    // Pulled straight from the cache (not the ~5-month windowed displayEvents)
    // so the panel shows ALL of a calendar's events, including past ones far
    // outside the current view. Recurring series are expanded over a wide but
    // bounded window. Dateless entries stay in the panel but never enter the
    // calendar grid. Unscheduled first, then scheduled newest first.
    const panelEvents = useMemo(() => {
        if (!selectedCalendarId) return [];
        const source = cache
            .getAllEvents()
            .find((s: any) => s.id === selectedCalendarId);
        if (!source) return [];
        const calName = cache.getCalendarById(source.id)?.name || source.id;
        const now = new Date();
        const wideStart = new Date(now.getFullYear() - 2, 0, 1);
        const wideEnd = new Date(now.getFullYear() + 2, 11, 31);
        const out: DisplayEvent[] = somedayEvents.filter(
            (event) => event.calendarId === selectedCalendarId
        );
        for (const { event, id } of source.events) {
            if (event.type === "someday") continue;
            out.push(
                ...neoEventToDisplayEvents(
                    event,
                    id,
                    source.id,
                    calName,
                    source.color,
                    source.editable,
                    wideStart,
                    wideEnd
                )
            );
        }
        out.sort((a, b) => {
            if (a.isSomeday !== b.isSomeday) return a.isSomeday ? -1 : 1;
            return b.start.getTime() - a.start.getTime();
        });
        return out;
    }, [selectedCalendarId, cache, cacheVersion, somedayEvents]);

    // ── Tasks, for the sidebar panel ────────────────────────────────
    // Read straight from the cache rather than from the windowed
    // `displayEvents`: an overdue task is precisely one whose date sits
    // outside the months currently on screen, so a window would hide exactly
    // what the panel exists to show.
    // A hidden calendar stays hidden here too — hiding it means "not now".
    const tasks = useMemo(
        () =>
            collectTasks(
                cache
                    .getAllEvents()
                    .filter((source: any) => !hiddenCalendars.has(source.id))
                    .map((source: any) => ({
                        id: source.id,
                        name:
                            cache.getCalendarById(source.id)?.name || source.id,
                        color: source.color,
                        editable: source.editable,
                        events: source.events,
                    }))
            ),
        [cache, cacheVersion, hiddenCalendars]
    );
    const today = todayISO();

    const selectedCalendar = selectedCalendarId
        ? calendarSources.find((s) => s.id === selectedCalendarId) || null
        : null;

    // ── Default calendar (where new events are created) ────
    const [defaultCalIdx, setDefaultCalIdx] = useState<number>(
        settings.defaultCalendar ?? 0
    );
    const defaultCalendarId = (() => {
        const byIdx = calendarSources[defaultCalIdx];
        if (byIdx && byIdx.editable) return byIdx.id;
        return calendarSources.find((s) => s.editable)?.id ?? "";
    })();
    const handleSetDefaultCalendar = useCallback(
        (calendarId: string) => {
            const idx = calendarSources.findIndex((s) => s.id === calendarId);
            if (idx >= 0) {
                settings.defaultCalendar = idx;
                props.plugin.saveData(props.plugin.settings);
                setDefaultCalIdx(idx);
            }
        },
        [calendarSources, settings, props.plugin]
    );
    // ── All-day section collapse (persisted in data.json) ──
    const [allDayCollapsed, setAllDayCollapsed] = useState<boolean>(
        settings.allDayCollapsed ?? false
    );
    const handleToggleAllDayCollapsed = useCallback(() => {
        setAllDayCollapsed((prev) => {
            const next = !prev;
            settings.allDayCollapsed = next;
            props.plugin.saveData(props.plugin.settings);
            return next;
        });
    }, [settings, props.plugin]);

    // ── Secondary timezones (mirrored in state so inline "+" re-renders) ──
    const [secondaryTimezones, setSecondaryTimezones] = useState<string[]>(
        settings.secondaryTimezones ?? []
    );

    // Recently-used zones (most-recent first, capped) — shown at the top of the
    // picker so regularly-used zones are easy to find (Notion-style).
    const [recentTimezones, setRecentTimezones] = useState<string[]>(
        settings.recentTimezones ?? []
    );
    const addRecentTimezone = useCallback(
        (tz: string) => {
            if (!tz) return;
            setRecentTimezones((prev) => {
                const next = [tz, ...prev.filter((t) => t !== tz)].slice(0, 6);
                settings.recentTimezones = next;
                props.plugin.saveData(props.plugin.settings);
                return next;
            });
        },
        [settings, props.plugin]
    );
    const handleRemoveRecent = useCallback(
        (tz: string) => {
            setRecentTimezones((prev) => {
                const next = prev.filter((t) => t !== tz);
                settings.recentTimezones = next;
                props.plugin.saveData(props.plugin.settings);
                return next;
            });
        },
        [settings, props.plugin]
    );

    const handleAddTimezone = useCallback(
        (tz: string) => {
            addRecentTimezone(tz);
            setSecondaryTimezones((prev) => {
                if (!tz || prev.includes(tz)) return prev;
                const next = [...prev, tz];
                settings.secondaryTimezones = next;
                props.plugin.saveData(props.plugin.settings);
                return next;
            });
        },
        [settings, props.plugin, addRecentTimezone]
    );
    const handleRemoveTimezone = useCallback(
        (tz: string) => {
            setSecondaryTimezones((prev) => {
                const next = prev.filter((t) => t !== tz);
                settings.secondaryTimezones = next;
                props.plugin.saveData(props.plugin.settings);
                return next;
            });
        },
        [settings, props.plugin]
    );

    // ── Timezone context menu (Change / Rename / Make primary / Remove) ──
    const [timezoneLabels, setTimezoneLabels] = useState<
        Record<string, string>
    >(settings.timezoneLabels ?? {});

    // Home/primary timezone for the main column (undefined = system zone). The
    // default is the system zone, so nothing changes unless explicitly set.
    const [primaryTimezone, setPrimaryTimezone] = useState<string | undefined>(
        settings.primaryTimezone
    );

    const handleChangeHomeTimezone = useCallback(() => {
        openTimezonePicker(new Date(), recentTimezones, (tz) => {
            addRecentTimezone(tz);
            settings.primaryTimezone = tz;
            props.plugin.saveData(props.plugin.settings);
            setPrimaryTimezone(tz);
        });
    }, [settings, props.plugin, addRecentTimezone, recentTimezones]);

    // ── Le système change de fuseau (on descend d'avion) ─────────
    const handleTimezoneResolved = useCallback(
        (update: TimezoneUpdate) => {
            settings.lastSeenSystemTimezone = update.lastSeenSystemTimezone;

            if (update.primaryTimezone !== undefined) {
                settings.primaryTimezone = update.primaryTimezone;
                setPrimaryTimezone(update.primaryTimezone);
            }

            props.plugin.saveData(props.plugin.settings);
        },
        [settings, props.plugin]
    );

    const {
        pendingSystemZone,
        accept: acceptSystemTimezone,
        decline: declineSystemTimezone,
    } = useTimezoneDrift({
        primaryTimezone,
        lastSeenSystemTimezone: settings.lastSeenSystemTimezone,
        onResolve: handleTimezoneResolved,
    });

    const handleChangeTimezone = useCallback(
        (oldTz: string) => {
            openTimezonePicker(new Date(), recentTimezones, (newTz) => {
                addRecentTimezone(newTz);
                setSecondaryTimezones((prev) => {
                    if (!newTz || newTz === oldTz) return prev;
                    // Replace in place; drop a duplicate if the new zone is
                    // already shown elsewhere.
                    const next = prev
                        .map((t) => (t === oldTz ? newTz : t))
                        .filter((t, i, a) => a.indexOf(t) === i);
                    settings.secondaryTimezones = next;
                    props.plugin.saveData(props.plugin.settings);
                    return next;
                });
            });
        },
        [settings, props.plugin, addRecentTimezone, recentTimezones]
    );

    const handleRenameTimezone = useCallback(
        (tz: string) => {
            openTimezoneRename(settings.timezoneLabels?.[tz] ?? "", (label) => {
                setTimezoneLabels((prev) => {
                    const next = { ...prev };
                    if (label) next[tz] = label;
                    else delete next[tz];
                    settings.timezoneLabels = next;
                    props.plugin.saveData(props.plugin.settings);
                    return next;
                });
            });
        },
        [settings, props.plugin]
    );

    const handleMakeTimezonePrimary = useCallback(
        (tz: string) => {
            // "Primary" = closest to the events grid = rightmost column = last
            // in the array. Move it to the end.
            setSecondaryTimezones((prev) => {
                if (!prev.includes(tz)) return prev;
                const next = [...prev.filter((t) => t !== tz), tz];
                settings.secondaryTimezones = next;
                props.plugin.saveData(props.plugin.settings);
                return next;
            });
        },
        [settings, props.plugin]
    );

    const tzMenu: TimezoneMenuActions = useMemo(
        () => ({
            labels: timezoneLabels,
            primaryTimezone,
            recentTimezones,
            onRemoveRecent: handleRemoveRecent,
            onChange: handleChangeTimezone,
            onRename: handleRenameTimezone,
            onMakePrimary: handleMakeTimezonePrimary,
            onRemove: handleRemoveTimezone,
            onChangeHome: handleChangeHomeTimezone,
        }),
        [
            timezoneLabels,
            primaryTimezone,
            recentTimezones,
            handleRemoveRecent,
            handleChangeTimezone,
            handleRenameTimezone,
            handleMakeTimezonePrimary,
            handleRemoveTimezone,
            handleChangeHomeTimezone,
        ]
    );

    // Hiding the calendar that new events land in would send them somewhere the
    // user can't see, so the default moves to the topmost visible editable
    // calendar. The switch is persisted and final: showing the calendar again
    // does not hand it back its default status.
    const reassignDefaultIfHidden = useCallback(
        (nextHidden: Set<string>) => {
            const next = pickDefaultCalendarAfterHide(
                calendarSources,
                nextHidden,
                defaultCalendarId
            );
            if (next) handleSetDefaultCalendar(next);
        },
        [calendarSources, defaultCalendarId, handleSetDefaultCalendar]
    );

    const handleToggleCalendarVisibility = useCallback(
        (calendarId: string) => {
            handleToggleCalendar(calendarId);
            if (!hiddenCalendars.has(calendarId)) {
                reassignDefaultIfHidden(
                    new Set([...hiddenCalendars, calendarId])
                );
            }
        },
        [handleToggleCalendar, hiddenCalendars, reassignDefaultIfHidden]
    );

    const handleShowOnlyCalendar = useCallback(
        (calendarId: string) => {
            const allIds = calendarSources.map((s) => s.id);
            handleShowOnly(calendarId, allIds);
            // Leaving solo mode restores the previous visibility instead of
            // hiding anything, so only entering it can strand the default.
            if (soloCalendarId !== calendarId) {
                reassignDefaultIfHidden(
                    new Set(allIds.filter((id) => id !== calendarId))
                );
            }
        },
        [
            handleShowOnly,
            calendarSources,
            soloCalendarId,
            reassignDefaultIfHidden,
        ]
    );

    // ── Event Callbacks ────────────────────────────────────

    // ── Context menu state ────────────────────────────────

    const [contextMenuState, setContextMenuState] = useState<{
        type: "empty" | "event";
        x: number;
        y: number;
        date?: Date;
        eventId?: string;
    } | null>(null);

    const [contextLine, setContextLine] = useState<{
        date: Date;
        top: number;
    } | null>(null);

    const dismissContextMenu = useCallback(() => {
        setContextMenuState(null);
        setContextLine(null);
    }, []);

    const handleContextMenu = useCallback(
        (eventId: string, mouseEvent: MouseEvent) => {
            mouseEvent.preventDefault();
            setContextMenuState({
                type: "event",
                x: mouseEvent.clientX,
                y: mouseEvent.clientY,
                eventId,
            });
            setContextLine(null);
        },
        []
    );

    const handleToggleTask = useCallback(
        async (eventId: string, isDone: boolean) => {
            return props.onToggleTask(eventId, isDone);
        },
        [props]
    );

    // ── Visible date range ─────────────────────────────────

    const visibleDates = useMemo(() => {
        switch (viewType) {
            case "day":
                return [currentDate];
            case "3days":
                return [0, 1, 2].map((i) => addDays(currentDate, i));
            case "days":
                return Array.from({ length: dayCount }, (_, i) =>
                    addDays(currentDate, i)
                );
            case "week":
            case "list":
                return Array.from({ length: 7 }, (_, i) =>
                    addDays(currentDate, i)
                );
            case "month": {
                const year = currentDate.getFullYear();
                const month = currentDate.getMonth();
                const firstDay = new Date(year, month, 1);
                const start = getWeekStart(firstDay, settings.firstDay);
                return Array.from({ length: 42 }, (_, i) => addDays(start, i));
            }
            default:
                return Array.from({ length: 7 }, (_, i) =>
                    addDays(currentDate, i)
                );
        }
    }, [viewType, currentDate, settings.firstDay, dayCount]);

    // ── Filter events by visible date range (include buffer days for smooth scroll) ──

    const visibleEvents = useMemo(() => {
        const filtered = displayEvents
            .filter(
                (event) =>
                    !hiddenCalendars.has(event.calendarId) ||
                    calendarVisibilityTransitions.get(event.calendarId) ===
                        "exiting"
            )
            .map((event) => {
                const visibilityState = calendarVisibilityTransitions.get(
                    event.calendarId
                );
                return visibilityState ? { ...event, visibilityState } : event;
            });
        if (viewType === "month" || viewType === "list") {
            return filtered;
        }
        // Match the BUFFER_DAYS used in TimeGrid so events exist in buffer columns
        const BUFFER_DAYS = 3;
        const rangeStart = startOfDay(addDays(visibleDates[0], -BUFFER_DAYS));
        const rangeEnd = endOfDay(
            addDays(visibleDates[visibleDates.length - 1], BUFFER_DAYS)
        );
        return filtered.filter(
            (e) =>
                // All-day events bypass the buffer-range filter so the all-day
                // section's height stays stable across day-by-day horizontal
                // shifts. Without this, multi-day events enter/leave the buffer
                // as the user scrolls, changing stableCount and teleporting the
                // time grid vertically.
                e.allDay ||
                (e.start.getTime() <= rangeEnd.getTime() &&
                    e.end.getTime() >= rangeStart.getTime())
        );
    }, [
        displayEvents,
        visibleDates,
        viewType,
        hiddenCalendars,
        calendarVisibilityTransitions,
    ]);

    // Flag the event currently open in the panel so its block can render in its
    // full ribbon color. Only the (de)selected objects change identity.
    const eventsWithSelection = useMemo(() => {
        if (!panelEventId && selectedIds.size === 0) return visibleEvents;
        return visibleEvents.map((e) =>
            e.id === panelEventId || selectedIds.has(e.id)
                ? { ...e, selected: true }
                : e
        );
    }, [visibleEvents, panelEventId, selectedIds]);

    const handleCalendarVisibilityAnimationEnd = useCallback(
        (event: React.AnimationEvent<HTMLDivElement>) => {
            if (
                event.animationName !== "nc-calendar-event-enter" &&
                event.animationName !== "nc-calendar-event-exit"
            ) {
                return;
            }
            const target = event.target as HTMLElement;
            const calendarId = target.dataset.calendarId;
            const state = target.dataset.visibilityState as
                | "entering"
                | "exiting"
                | undefined;
            if (calendarId && state) {
                finishCalendarVisibilityTransition(calendarId, state);
            }
        },
        [finishCalendarVisibilityTransition]
    );

    // A hidden calendar may have no event in the current DOM. In that case
    // there is nothing to animate and therefore no animationend signal; remove
    // the transition state on the next frame so invisible events cannot reserve
    // layout space when the user later navigates to another date/view.
    useEffect(() => {
        if (calendarVisibilityTransitions.size === 0) return;
        const frame = requestAnimationFrame(() => {
            const root = containerRef.current;
            if (!root) return;
            calendarVisibilityTransitions.forEach((state, calendarId) => {
                const selector = `[data-calendar-id="${CSS.escape(
                    calendarId
                )}"][data-visibility-state="${state}"]`;
                if (!root.querySelector(selector)) {
                    finishCalendarVisibilityTransition(calendarId, state);
                }
            });
        });
        return () => cancelAnimationFrame(frame);
    }, [
        calendarVisibilityTransitions,
        finishCalendarVisibilityTransition,
        currentDate,
        viewType,
    ]);

    const handleNewEvent = useCallback(() => {
        handleSelectRange(new Date(), new Date(Date.now() + 30 * 60000), false);
    }, [handleSelectRange]);

    const handleAddPanelEvent = useCallback(
        async (calendarId: string) => {
            const calendar = calendarSources.find(
                (source) => source.id === calendarId && source.editable
            );
            if (!calendar) return;
            try {
                const id = await cache.addEvent(
                    calendarId,
                    // Always a task, whatever the global default: a dateless
                    // entry you mean to get to is a task by nature — it has no
                    // slot to occupy, only a done/not-done state — and this
                    // panel draws a checkbox for exactly that. The event panel
                    // opens right after, so the Type row can still switch it.
                    createUnscheduledPanelEvent(true)
                );
                if (id) {
                    setPanelAnchor(null);
                    setPanelEventId(id);
                }
            } catch {}
        },
        [calendarSources, cache, setPanelEventId]
    );

    // The tasks panel has no calendar of its own to add to, so new tasks land
    // in the default calendar — which already falls back to the first editable
    // one, so this cannot aim at a read-only calendar.
    const handleAddTask = useCallback(() => {
        if (defaultCalendarId) handleAddPanelEvent(defaultCalendarId);
    }, [defaultCalendarId, handleAddPanelEvent]);

    const handleEmptyContextMenu = useCallback(
        (date: Date, mouseEvent: MouseEvent) => {
            mouseEvent.preventDefault();
            const top = getEventTop(date, startOfDay(date));
            setContextMenuState({
                type: "empty",
                x: mouseEvent.clientX,
                y: mouseEvent.clientY,
                date,
            });
            setContextLine({ date, top });
        },
        []
    );

    // ── Clipboard actions ─────────────────────────────────

    const { copyEvent, cutEvent, pasteEvent, duplicateEvent, canPaste } =
        useClipboardActions(cache);

    // ── Group actions (multi-selection aware) ───────────────
    // Ids to act on: the multi-selection if any, else the panel's single event.
    const actionTargetIds = useCallback((): string[] => {
        if (selectedIds.size > 0) return [...selectedIds];
        if (panelEventId) return [panelEventId];
        return [];
    }, [selectedIds, panelEventId]);

    const hasActionTarget = selectedIds.size > 0 || panelEventId !== null;

    const handleGroupDelete = useCallback(async () => {
        const ids = actionTargetIds();
        if (ids.length === 0) return;
        // Single undoable batch + one notice when available; else fall back to
        // per-event delete.
        if (props.onDeleteEvents) {
            await props.onDeleteEvents(ids);
        } else {
            for (const id of ids) await props.onDeleteEvent(id);
        }
        clearMultiSelection();
        setPanelEventId(null);
    }, [actionTargetIds, props, clearMultiSelection, setPanelEventId]);

    const handleGroupDuplicate = useCallback(async () => {
        const ids = actionTargetIds();
        for (const id of ids) await duplicateEvent(id);
    }, [actionTargetIds, duplicateEvent]);

    // ── Context menu items ─────────────────────────────────

    const contextMenuItems = useMemo((): ContextMenuItem[] => {
        if (!contextMenuState) return [];

        if (contextMenuState.type === "empty") {
            const date = contextMenuState.date!;
            const baseItems: ContextMenuItem[] = [
                {
                    label: t("Create event"),
                    shortcut: "C",
                    onClick: () => {
                        const start = new Date(date);
                        const end = new Date(date.getTime() + 30 * 60000);
                        handleSelectRange(start, end, false);
                    },
                },
                {
                    label: "Paste event",
                    shortcut: "Ctrl+V",
                    disabled: !canPaste,
                    onClick: () => pasteEvent(date),
                },
            ];

            // Right-clicking empty space while a multi-selection is live must
            // act on that selection (Notion/Windows behaviour). Without this,
            // the empty-area menu ignores selectedIds entirely and the group
            // delete/duplicate is only reachable by aiming precisely at a
            // selected event — which is exactly the gap being reported.
            if (selectedIds.size > 0) {
                const n = selectedIds.size;
                const evWord = n > 1 ? `${n} events` : "event";
                return [
                    {
                        label: `Duplicate ${evWord}`,
                        icon: <DuplicateIcon />,
                        onClick: () => handleGroupDuplicate(),
                    },
                    { separator: true, label: "", onClick: () => {} },
                    {
                        label: `Delete ${evWord}`,
                        shortcut: "delete",
                        danger: true,
                        icon: <TrashIcon />,
                        onClick: () => handleGroupDelete(),
                    },
                    { separator: true, label: "", onClick: () => {} },
                    ...baseItems,
                ];
            }

            return baseItems;
        }

        const eventId = contextMenuState.eventId!;
        const event = cache.getEventById(eventId);
        if (!event) return [];
        const editable = cache.isEventEditable(eventId);

        const items: ContextMenuItem[] = [];

        if (editable) {
            items.push(
                {
                    label: "Cut",
                    shortcut: "Ctrl X",
                    icon: <ScissorsIcon />,
                    onClick: () => cutEvent(eventId),
                },
                {
                    label: t("Copy"),
                    shortcut: "Ctrl C",
                    icon: <CopyIcon />,
                    onClick: () => copyEvent(eventId),
                },
                {
                    label: t("Duplicate"),
                    shortcut: "Ctrl D",
                    icon: <DuplicateIcon />,
                    onClick: () => duplicateEvent(eventId),
                },
                { separator: true, label: "", onClick: () => {} }
            );
        }

        items.push({
            label: t("Go to note"),
            icon: <FileTextIcon />,
            onClick: () => props.onOpenFile(eventId),
        });

        if (editable) {
            items.push(
                { separator: true, label: "", onClick: () => {} },
                {
                    // If the right-clicked event is part of a multi-selection,
                    // delete the whole group; otherwise just this event.
                    label:
                        selectedIds.has(eventId) && selectedIds.size > 1
                            ? `Delete ${selectedIds.size} events`
                            : "Delete",
                    shortcut: "delete",
                    danger: true,
                    icon: <TrashIcon />,
                    onClick: async () => {
                        if (selectedIds.has(eventId) && selectedIds.size > 1) {
                            await handleGroupDelete();
                        } else {
                            await props.onDeleteEvent(eventId);
                        }
                    },
                }
            );
        }

        return items;
    }, [
        contextMenuState,
        cache,
        canPaste,
        copyEvent,
        cutEvent,
        pasteEvent,
        duplicateEvent,
        handleSelectRange,
        props,
        selectedIds,
        handleGroupDelete,
        handleGroupDuplicate,
    ]);

    // ── Keyboard Shortcuts ──────────────────────────────────

    useKeyboardShortcuts({
        app: props.plugin.app,
        isActive: () => {
            const t =
                props.plugin.app.workspace.activeLeaf?.view?.getViewType();
            return (
                t === "neo-calendar-view" || t === "neo-calendar-sidebar-view"
            );
        },
        onAlignToday: alignToday,
        onGoToday: goToday,
        onGoPrev: goPrev,
        onGoNext: goNext,
        onViewChange: setViewType,
        onCreateEvent: handleNewEvent,
        onToggleSidebar: () => setSidebarVisible((v) => !v),
        onOpenCommandPalette: () => setCommandPaletteVisible(true),
        onCopyEvent: panelEventId ? () => copyEvent(panelEventId) : undefined,
        onCutEvent: panelEventId ? () => cutEvent(panelEventId) : undefined,
        onPasteEvent: canPaste
            ? () =>
                  pasteEvent(
                      contextMenuState?.type === "empty" &&
                          contextMenuState.date
                          ? contextMenuState.date
                          : new Date()
                  )
            : undefined,
        onDuplicateEvent: hasActionTarget ? handleGroupDuplicate : undefined,
        onDeleteEvent: hasActionTarget ? handleGroupDelete : undefined,
        onUndo: () => props.plugin.undoLastDeletion(),
    });

    // ── Plugin event listeners (Obsidian commands) ─────────────

    useEffect(() => {
        const cleanups = [
            props.plugin.onCalendarEvent("go-today", () => goToday()),
            props.plugin.onCalendarEvent("align-today", () => alignToday()),
            props.plugin.onCalendarEvent("go-prev", () => goPrev()),
            props.plugin.onCalendarEvent("go-next", () => goNext()),
            props.plugin.onCalendarEvent("view-change", (view: string) =>
                setViewType(view as ViewType)
            ),
            props.plugin.onCalendarEvent("toggle-sidebar", () =>
                setSidebarVisible((v: boolean) => !v)
            ),
        ];
        return () => cleanups.forEach((c) => c());
    }, [goToday, alignToday, goPrev, goNext]);

    // ── Render ─────────────────────────────────────────────

    return (
        <TimezoneMenuContext.Provider value={tzMenu}>
            <div
                ref={containerRef}
                style={{ position: "relative", height: "100%" }}
                onAnimationEndCapture={handleCalendarVisibilityAnimationEnd}
            >
                <CalendarLayout
                    currentDate={currentDate}
                    viewType={viewType}
                    onViewTypeChange={setViewType}
                    dayCount={dayCount}
                    onSetDayCount={setDaysCount}
                    showWeekNumbers={showWeekNumbers}
                    onToggleWeekNumbers={() => setShowWeekNumbers((v) => !v)}
                    onGoPrev={goPrev}
                    onGoNext={goNext}
                    onGoToday={goToday}
                    onOpenSettings={() => {
                        const setting = (props.plugin.app as any).setting;
                        setting.open();
                        setting.openTabById("neo-calendar");
                    }}
                    onShiftDays={shiftDays}
                    onShiftMonths={shiftMonths}
                    onNewEvent={handleNewEvent}
                    events={eventsWithSelection}
                    calendarSources={calendarSources}
                    visibleDates={visibleDates}
                    firstDay={settings.firstDay}
                    timeFormat24h={settings.timeFormat24h}
                    freeScroll={settings.freeScroll}
                    sidebarVisible={sidebarVisible}
                    onToggleSidebar={() => setSidebarVisible((v) => !v)}
                    onEventClick={handleEventSelect}
                    onEventDrag={handleEventDrag}
                    onEventResize={handleEventResize}
                    onSelectRange={(start, end, allDay) => {
                        // Starting a new range selection clears any multi-select.
                        clearMultiSelection();
                        handleSelectRange(start, end, allDay);
                    }}
                    onMonthDayClick={(date) => {
                        clearMultiSelection();
                        // The setting says what a click on a month day does.
                        // It used to say nothing at all: the cell always opened
                        // a new event, so switching it off changed nothing.
                        if (props.settings.clickToCreateEventFromMonthView) {
                            handleSelectRange(date, date, true);
                        } else {
                            goToDateInView(date, "day");
                        }
                    }}
                    onContextMenu={handleContextMenu}
                    onToggleTask={handleToggleTask}
                    onEmptyContextMenu={handleEmptyContextMenu}
                    contextLine={contextLine}
                    onDateSelect={(date) => setCurrentDate(date)}
                    hiddenCalendars={hiddenCalendars}
                    onToggleCalendar={handleToggleCalendarVisibility}
                    defaultCalendarId={defaultCalendarId}
                    soloCalendarId={soloCalendarId}
                    onSetDefaultCalendar={handleSetDefaultCalendar}
                    onShowOnly={handleShowOnlyCalendar}
                    tasks={tasks}
                    today={today}
                    onAddTask={handleAddTask}
                    onAddCalendar={handleAddCalendar}
                    onRenameCalendar={handleRenameCalendar}
                    onEditCalendarLink={handleEditCalendarLink}
                    // No `onManageIcsFeeds`: the Obsidian plugin doesn't carry
                    // the desktop/Android app's ICS feed preferences store, so
                    // CalendarSidebar leaves the "Liens ICS" menu item out
                    // entirely here rather than showing an inert click.
                    onDeleteCalendar={handleDeleteCalendar}
                    onColorChange={handleColorChange}
                    onReorderCalendars={handleReorderCalendars}
                    onOpenCalendarFolder={handleOpenCalendarFolder}
                    onOpenRootFolder={handleOpenRootFolder}
                    onCalendarClick={handleCalendarClick}
                    selectedCalendar={selectedCalendar}
                    panelEvents={panelEvents}
                    onAddPanelEvent={handleAddPanelEvent}
                    onCloseEventsPanel={() => setSelectedCalendarId(null)}
                    onPanelEventClick={handleEventClick}
                    onQuickAdd={async (partialEvent: Partial<NeoEvent>) => {
                        const dateStr =
                            (partialEvent as any).date ||
                            new Date().toISOString().split("T")[0];
                        const allDay = partialEvent.allDay || false;

                        if (partialEvent.title && dateStr) {
                            try {
                                const editableCalendars = Array.from(
                                    cache["calendars"].values()
                                ).filter(
                                    (cal): cal is EditableCalendar =>
                                        cal instanceof EditableCalendar
                                );
                                if (editableCalendars.length > 0) {
                                    const calendarId = editableCalendars[0].id;
                                    const newEvent: any = {
                                        title: partialEvent.title,
                                        date: dateStr,
                                        type: "single",
                                        allDay,
                                    };
                                    if (
                                        !allDay &&
                                        (partialEvent as any).startTime
                                    ) {
                                        newEvent.startTime = (
                                            partialEvent as any
                                        ).startTime;
                                        newEvent.endTime =
                                            (partialEvent as any).endTime ||
                                            null;
                                    }
                                    if (
                                        allDay &&
                                        (partialEvent as any).endDate
                                    ) {
                                        newEvent.endDate = (
                                            partialEvent as any
                                        ).endDate;
                                    }
                                    if (settings.defaultEventsAsTasks) {
                                        newEvent.completed = false;
                                    }
                                    await cache.addEvent(calendarId, newEvent);
                                    new Notice("Event created");
                                    return;
                                }
                            } catch (e) {
                                // Fall back to modal if direct creation fails
                            }
                        }
                        const start = new Date(dateStr + "T00:00:00");
                        const end = new Date(
                            dateStr + (allDay ? "T23:59:59" : "T01:00:00")
                        );
                        props.onSelectRange(start, end, allDay);
                    }}
                    onOpenSearch={() => setCommandPaletteVisible(true)}
                    secondaryTimezones={secondaryTimezones}
                    onAddTimezone={handleAddTimezone}
                    onRemoveTimezone={handleRemoveTimezone}
                    allDayCollapsed={allDayCollapsed}
                    onToggleAllDayCollapsed={handleToggleAllDayCollapsed}
                    draftSlot={
                        draftSlot && !committingDraft
                            ? {
                                  start: draftSlot.start,
                                  end: draftSlot.end,
                                  allDay: draftSlot.allDay,
                              }
                            : null
                    }
                    draftColor={
                        (draftSlot
                            ? calendarSources.find(
                                  (s) => s.id === draftSlot.calendarId
                              )?.color
                            : undefined) ??
                        calendarSources.find((s) => s.id === defaultCalendarId)
                            ?.color ??
                        "var(--nc-accent)"
                    }
                    onResizeDraft={resizeDraft}
                    panelPreview={panelPreview}
                    onPanelDragTarget={handlePanelDragTarget}
                    onPanelDrop={handlePanelDrop}
                    onEventUnschedule={handleEventUnschedule}
                />
                {pendingSystemZone && (
                    <TimezoneChangePrompt
                        systemZone={pendingSystemZone}
                        onAccept={acceptSystemTimezone}
                        onDecline={declineSystemTimezone}
                    />
                )}
                <CommandPalette
                    visible={commandPaletteVisible}
                    onDismiss={() => setCommandPaletteVisible(false)}
                    events={[...displayEvents, ...somedayEvents]}
                    onEventSelect={handleEventClick}
                    onViewChange={setViewType}
                    onGoToday={goToday}
                    onCreateEvent={handleNewEvent}
                    onToggleSidebar={() => setSidebarVisible((v) => !v)}
                    timeFormat24h={settings.timeFormat24h}
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
                                  defaultAsTask: settings.defaultEventsAsTasks,
                              }
                            : null
                    }
                    committingDraft={committingDraft}
                    anchorRect={panelAnchor}
                    cache={cache}
                    timeFormat24h={settings.timeFormat24h}
                    calendars={calendarSources.map((s) => ({
                        id: s.id,
                        name: s.name,
                        color: s.color,
                        type: s.type as import("../../types").CalendarInfo["type"],
                    }))}
                    defaultCalendarId={defaultCalendarId}
                    onClose={() => {
                        setPanelEventId(null);
                        setPanelAnchor(null);
                        if (draftSlot) discardDraft();
                    }}
                    onDraftCommit={handleDraftCommit}
                    onOpenFile={(id) => props.onOpenFile(id)}
                    /* La vue suit la fiche : ouvrir la date voisine d'une serie
                       sans deplacer le calendrier laisserait le panneau parler
                       d'un jour qui n'est pas a l'ecran. */
                    onGoToOccurrence={(displayId, date) => {
                        const target = new Date(`${date}T00:00:00`);
                        if (!Number.isNaN(target.getTime())) {
                            setCurrentDate(target);
                        }
                        setPanelEventId(displayId);
                    }}
                    onDuplicate={(id) => void duplicateEvent(id)}
                    onDelete={async (id) => {
                        await props.onDeleteEvent(id);
                    }}
                    firstDay={settings.firstDay}
                />
                <ContextMenu
                    visible={contextMenuState !== null}
                    x={contextMenuState?.x ?? 0}
                    y={contextMenuState?.y ?? 0}
                    items={contextMenuItems}
                    onDismiss={dismissContextMenu}
                />
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
                {shiftHeld && (
                    <div className="nc-shift-hint">
                        Drag to select multiple events
                    </div>
                )}
            </div>
        </TimezoneMenuContext.Provider>
    );
}

export default function CalendarApp(props: CalendarAppProps) {
    return (
        <ClipboardProvider>
            <CalendarAppInner {...props} />
        </ClipboardProvider>
    );
}
