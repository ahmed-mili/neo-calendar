import * as React from "react";
import * as ReactDOM from "react-dom";
import { useRef, useLayoutEffect, useMemo, useState } from "react";
import { DndContext, DragOverlay, closestCenter } from "@dnd-kit/core";
import {
    currentHourHeight,
    allDayRowHeight,
    ALLDAY_MAX_ROWS,
    ALLDAY_GROW_MS,
    addDays,
    startOfDay,
    computeOverlapGroups,
    formatTime,
    getEventHeight,
    isToday,
    isSameDay,
    isMultiDayTimed,
    isAndroidRuntime as onAndroid,
} from "./CalendarUtils";
import { withAlpha } from "../../utils/color";
import { DisplayEvent } from "../types";
import { useInfiniteScroll } from "./useInfiniteScroll";
import { TimeGridProps } from "./TimeGrid.types";
import { useTimeGridDrag } from "./useTimeGridDrag";
import { useTimeGridResize } from "./useTimeGridResize";
import { useTimeGridSelection } from "./useTimeGridSelection";
import { allDayBandRows, useAllDayLanes } from "./useAllDayLanes";
import { useAxisLock, easeOutCubic } from "./useAxisLock";
import { GRID_LINE_DEBUG } from "./debugFlags";
import { enableGridLineDebug } from "./gridDebug";
import { useNowPosition } from "./NowIndicator";
import {
    LeftRail,
    TimeGridHeaders,
    TimeGridAllDay,
    TimeGridDays,
} from "./TimeGridSections";

const HOURS = Array.from({ length: 24 }, (_, i) => i);

// Days of buffer rendered on each side of the visible range for continuous scroll.
// Larger buffer = more scroll headroom before a shift is needed = smoother feel.
const BUFFER_DAYS = 3;
const STICKY_COL_PX = 64;

function groupEventsByDate(
    events: DisplayEvent[],
    filter: (e: DisplayEvent) => boolean
): Map<string, DisplayEvent[]> {
    const map = new Map<string, DisplayEvent[]>();
    const push = (key: string, e: DisplayEvent) => {
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(e);
    };
    for (const event of events) {
        if (!filter(event)) continue;
        // The event lives on its start day (its block is clipped at midnight by
        // the day column's overflow:hidden).
        push(event.start.toDateString(), event);
        // If it crosses midnight, add a read-only continuation on each
        // subsequent day it touches, starting at 00:00, keeping the original
        // start time as the label (Notion-style).
        let dayStart = startOfDay(addDays(event.start, 1));
        while (dayStart.getTime() < event.end.getTime()) {
            push(dayStart.toDateString(), {
                ...event,
                start: new Date(dayStart),
                editable: false,
                isContinuation: true,
                labelStart: event.start,
            });
            dayStart = addDays(dayStart, 1);
        }
    }
    return map;
}

/** scrollTop bounded to the real scroll range.
 *
 *  The value drives the grid's top clip. Android's elastic overscroll and
 *  momentum flings can report a scrollTop past either end for a frame; feeding
 *  that straight into clip-path cuts away a visible slice of the grid, which is
 *  what made an earlier attempt at a transparent header band look broken. */
/** Can the pinned panels follow the scroll on their own, off the main thread?
 *
 *  Where they can, CalendarGrid.css owns their transforms and the grid's top
 *  clip, and the JS mirror below must keep its hands off all three. */
const PANELS_RIDE_SCROLL =
    typeof CSS !== "undefined" &&
    typeof CSS.supports === "function" &&
    CSS.supports("animation-timeline: --nc-grid-scroll");

/** How far the pinned panels travel end to end: the scroller's scroll ranges.
 *
 *  The timelines hand their animations a 0→1 progress, so these are what turn it
 *  back into pixels. They only change when the layout does — never per frame.
 *  Published on the wrapper because the hours rail is the scroller's SIBLING and
 *  would never inherit them from the scroller itself. */
function publishScrollTravel(
    scroller: HTMLElement,
    host: HTMLElement | null
): void {
    if (!host) return;
    const down = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    const across = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
    host.style.setProperty("--nc-rail-travel", `${down}px`);
    host.style.setProperty("--nc-allday-travel", `${across}px`);
}

/** Whether the machine has been told to keep movement to a minimum. */
function prefersReducedMotion(): boolean {
    return (
        typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
}

function clampScrollTop(scroller: HTMLElement): number {
    const maximum = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    return Math.min(Math.max(scroller.scrollTop, 0), maximum);
}

export default function TimeGrid(props: TimeGridProps) {
    const {
        dates,
        events,
        timeFormat24h,
        secondaryTimezones,
        onAddTimezone,
        onRemoveTimezone,
        allDayCollapsed = false,
        onToggleAllDayCollapsed,
        onEventClick,
        onEventDrag,
        onEventResize,
        onSelectRange,
        onContextMenu,
        onToggleTask,
        allDayEvents,
        onEmptyContextMenu,
        draftSlot,
        draftColor,
        onResizeDraft,
        onShiftDays,
        contextLine,
        externalPreview,
        onEventUnschedule,
        freeScroll = false,
        prayerLines,
        prayerColor,
    } = props;

    const gridRef = useRef<HTMLDivElement>(null);
    const scrollRootRef = useRef<HTMLDivElement>(null);
    const headersRowRef = useRef<HTMLDivElement>(null);
    const allDayRowRef = useRef<HTMLDivElement>(null);
    const allDayGutterRef = useRef<HTMLDivElement>(null);
    const allDayTrackRef = useRef<HTMLDivElement>(null);
    const leftScrollableRef = useRef<HTMLDivElement>(null);
    const [headerHeight, setHeaderHeight] = useState(0);
    // Visible width of the main scroller — the all-day row is pinned to this
    // (sticky-left) so its vertical scrollbar stays on-screen.
    const [mainWidth, setMainWidth] = useState(0);
    // Full content width (= headers/days row). The all-day track must match it
    // exactly so its day cells line up with the day columns. A `calc(100% * …)`
    // string would resolve against the (narrower) pinned row and misalign.
    const [contentWidth, setContentWidth] = useState(0);

    // Continuous horizontal scroll: render dates with ±BUFFER_DAYS buffer
    const extendedDates = useMemo(() => {
        if (dates.length === 0) return dates;
        const prefix: Date[] = [];
        for (let i = BUFFER_DAYS; i >= 1; i--) {
            prefix.push(addDays(dates[0], -i));
        }
        const suffix: Date[] = [];
        const last = dates[dates.length - 1];
        for (let i = 1; i <= BUFFER_DAYS; i++) {
            suffix.push(addDays(last, i));
        }
        return [...prefix, ...dates, ...suffix];
    }, [dates]);

    // One direction at a time, and pinch to zoom. Only on the phone: a mouse
    // wheel and a trackpad already scroll one axis at a time, and holding the
    // other would fight them.
    // The variable goes on the wrapper, not on the body: the hours rail is a
    // sibling of the scroller, so both have to be able to read it, and nothing
    // outside the grid has any business being re-styled by a pinch.
    const republishScrollTravel = React.useCallback(() => {
        const main = scrollRootRef.current;
        if (main) publishScrollTravel(main, gridRef.current);
    }, []);

    /** Put the panels that are pinned outside the scroller back where the
     *  scroll says they belong: the hours rail's translateY, the grid's top
     *  clip, and the all-day band's pair of counter-translations.
     *
     *  Nothing to do where the scroll timelines drive all three (see
     *  PANELS_RIDE_SCROLL) — CSS runs them on the render cycle, and a JS write
     *  here would only fight the cascade. */
    const mirrorPinnedPanels = React.useCallback(() => {
        const main = scrollRootRef.current;
        if (!main || PANELS_RIDE_SCROLL) return;
        const x = main.scrollLeft;
        const scrollable = leftScrollableRef.current;
        main.style.setProperty("--nc-scroll-y", `${clampScrollTop(main)}px`);
        if (scrollable) {
            scrollable.style.transform = `translateY(${-main.scrollTop}px)`;
        }
        if (allDayRowRef.current) {
            allDayRowRef.current.style.transform = `translateX(${x}px)`;
        }
        if (allDayTrackRef.current) {
            allDayTrackRef.current.style.transform = `translateX(${-x}px)`;
        }
    }, []);

    /* Ce que le pincement a changé sans passer par React.
       La grille suit la variable CSS toute seule ; la bande des journées
       entières, elle, est posée en pixels au rendu, et personne ne la
       redessinait quand l'heure changeait de taille. Un compteur qui avance à
       la fin du geste rend un rendu — un seul, pas un par image — et tout ce
       qui se mesure en heures retombe d'accord. */
    const [, setScaleSettled] = useState(0);

    useAxisLock(scrollRootRef, gridRef, onAndroid(), {
        daysPerView: dates.length,
        freeScroll,
        onScaleChange: republishScrollTravel,
        onScaleSettled: React.useCallback(
            () => setScaleSettled((count) => count + 1),
            []
        ),
    });

    useInfiniteScroll({
        scrollRef: scrollRootRef,
        daysPerView: dates.length,
        dateKey: dates[0]?.toDateString() ?? "",
        bufferDays: BUFFER_DAYS,
        onShiftDays: (steps) => onShiftDays?.(steps),
        enabled: !!onShiftDays && dates.length > 0,
    });

    // Width of the left rail = hours column + secondary timezone columns.
    const leftRailWidth =
        STICKY_COL_PX * (1 + (secondaryTimezones?.length ?? 0));

    // The main scroller's content width must accommodate (visible + buffer)
    // days, where each day = (scroller_viewport_width / daysPerView).
    const scrollerWidthStyle =
        dates.length > 0
            ? `calc(100% * ${(dates.length + BUFFER_DAYS * 2) / dates.length})`
            : "100%";

    // Measure the header row so the left rail can mirror the sticky-top region
    // exactly (corner placeholder above the all-day gutter).
    //
    // The all-day band's height is NOT measured: it is animated (see
    // ALLDAY_GROW_MS), and reading it back would re-render the whole grid on
    // every frame of that animation, only to hand the rail a height a frame
    // behind the band's. Both are given the same computed target instead, and
    // the same transition takes them there together.
    useLayoutEffect(() => {
        const headerEl = headersRowRef.current;
        const measure = () => {
            setHeaderHeight(headerEl ? headerEl.offsetHeight : 0);
            setContentWidth(headerEl ? headerEl.offsetWidth : 0);
        };
        measure();
        const ro = new ResizeObserver(measure);
        if (headerEl) ro.observe(headerEl);
        return () => ro.disconnect();
    }, [extendedDates, allDayEvents]);

    // A build made to look at the grid's left edge; nothing in the one people
    // install (see debugFlags).
    useLayoutEffect(() => {
        if (!GRID_LINE_DEBUG) return;
        return enableGridLineDebug(gridRef.current);
    }, []);

    // Track the main scroller's visible width so the all-day row can be pinned
    // to it (sticky-left), keeping its vertical scrollbar on-screen.
    useLayoutEffect(() => {
        const el = scrollRootRef.current;
        if (!el) return;
        const measure = () => {
            setMainWidth(el.clientWidth);
            // A shorter viewport (the keyboard, a rotation) lengthens the scroll
            // range, and the panels' travels are those ranges.
            publishScrollTravel(el, gridRef.current);
        };
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // ── Behavior hooks ────────────────────────────────────────

    const {
        activeEvent,
        dragPreview,
        dragPreviews,
        dragWidth,
        sensors,
        handleDragStart,
        handleDragMove,
        handleDragEnd,
        handleDragCancel,
    } = useTimeGridDrag(
        onEventDrag,
        gridRef,
        () => [...events, ...(allDayEvents ?? [])].filter((e) => e.selected),
        onEventUnschedule
    );

    const { resizePreview, handleResizeStart, handleDraftResizeStart } =
        useTimeGridResize(events, onEventResize, draftSlot, onResizeDraft);

    const {
        selection,
        handleMouseDown,
        handleDoubleClick,
        handleAllDayPointerDown,
        handleEmptyContext,
    } = useTimeGridSelection({
        gridRef,
        onSelectRange,
        onEmptyContextMenu,
    });

    // ── Derived event maps ────────────────────────────────────

    const eventsByDate = useMemo(
        () => groupEventsByDate(events, (e) => !e.allDay),
        [events]
    );

    const allDayLanes = useAllDayLanes(allDayEvents, extendedDates);

    // The row a pending all-day draft stands on: under everything its day
    // already holds, which is where the event itself will land once it is
    // named (see useAllDayLanes). The band therefore grows the moment the slot
    // is drawn, rather than jumping a row later when the event appears.
    const allDayDraftLane = useMemo(() => {
        if (!draftSlot || !draftSlot.allDay) return null;
        const idx = extendedDates.findIndex((d) =>
            isSameDay(d, draftSlot.start)
        );
        if (idx === -1) return null;
        const occupied = allDayLanes.bars
            .filter((b) => b.startIdx <= idx && idx <= b.startIdx + b.span - 1)
            .map((b) => b.lane);
        return occupied.length ? Math.max(...occupied) + 1 : 0;
    }, [draftSlot, extendedDates, allDayLanes]);

    // Every row the band has to hold, draft included, plus the empty one it
    // always keeps underneath so an all-day event can be added by tapping the
    // day (see allDayBandRows).
    //
    // The visible count is capped: it is the value that pushes the days grid
    // down, and it is read below to keep the grid from teleporting vertically
    // when the lane count changes during a horizontal shift.
    const { contentRows: allDayContentRows, visibleRows: allDayVisibleRows } =
        allDayBandRows({
            laneCount: allDayLanes.laneCount,
            draftLane: allDayDraftLane,
            collapsed: allDayCollapsed,
            maxRows: ALLDAY_MAX_ROWS,
        });
    const allDayHeight = allDayVisibleRows * allDayRowHeight();

    const overlapByDate = useMemo(() => {
        const map = new Map<string, ReturnType<typeof computeOverlapGroups>>();
        for (const [dateKey, dayEvents] of eventsByDate) {
            map.set(dateKey, computeOverlapGroups(dayEvents));
        }
        return map;
    }, [eventsByDate]);

    // Shared "now" indicator state — used both by the left rail (badge) and
    // by the day columns (line + tick). One source of truth, one timer.
    const { top: nowTop, label: nowLabel, now } = useNowPosition(timeFormat24h);
    const todayInRange = useMemo(
        () => extendedDates.some(isToday),
        [extendedDates]
    );

    const showAllDay = true;
    // NEO_ANDROID_INITIAL_SCROLL_V7_4_START
    // On Android, keep several hours of context above the current time.
    // At 23:59 this shows roughly 18:00-00:00 instead of opening at 23:00.
    useLayoutEffect(() => {
        const element = scrollRootRef.current;

        if (!element) {
            return;
        }

        let firstFrame = 0;
        let secondFrame = 0;
        let settleTimer = 0;

        const isAndroidRuntime = () => {
            const androidWindow = window as Window & {
                NeoAndroid?: unknown;
            };

            return (
                Boolean(androidWindow.NeoAndroid) ||
                document.documentElement.classList.contains(
                    "nc-platform-android"
                ) ||
                document.body?.classList.contains("nc-platform-android") ===
                    true
            );
        };

        const applyInitialScroll = () => {
            const current = new Date();

            const currentHour =
                current.getHours() +
                current.getMinutes() / 60 +
                current.getSeconds() / 3600;

            const viewportHours =
                element.clientHeight > 0
                    ? element.clientHeight / currentHourHeight()
                    : 8;

            const hoursAboveCurrent = isAndroidRuntime()
                ? Math.min(6, Math.max(3.5, viewportHours * 0.68))
                : 1;

            const requestedScroll = Math.max(
                0,
                (currentHour - hoursAboveCurrent) * currentHourHeight()
            );

            const maximumScroll = Math.max(
                0,
                element.scrollHeight - element.clientHeight
            );

            element.scrollTop = Math.min(requestedScroll, maximumScroll);
        };

        applyInitialScroll();

        firstFrame = window.requestAnimationFrame(() => {
            applyInitialScroll();

            secondFrame = window.requestAnimationFrame(applyInitialScroll);
        });

        settleTimer = window.setTimeout(applyInitialScroll, 220);

        return () => {
            window.cancelAnimationFrame(firstFrame);

            window.cancelAnimationFrame(secondFrame);

            window.clearTimeout(settleTimer);
        };
    }, []);
    // NEO_ANDROID_INITIAL_SCROLL_V7_4_END

    // The all-day band takes ALLDAY_GROW_MS to gain a row or give one back,
    // rather than doing it between two frames: everything below it moves by
    // 24px, and done at once that reads as the whole grid jumping. Four things
    // have to move together for that to look like one gesture —
    //
    //   · the band itself, on both sides of the seam (the row in the scroller
    //     and the gutter in the left rail);
    //   · the scroller's scrollTop, by exactly as much as the band grew, so the
    //     hours underneath stay where the eye left them;
    //   · --nc-rail-travel, the scroll range the pinned panels ride on, which
    //     grows with the band;
    //   · and, where the scroll timelines are missing, the mirrored transforms.
    //
    // They are all written HERE, in one rAF, off one clock. The band used to
    // grow on a CSS `transition: height` while only the scroll correction ran on
    // rAF, and two clocks was the whole problem: a transition starts at the
    // frame's style recalc, this effect starts at React's commit — up to a frame
    // earlier. So the range published each frame described a band height the
    // paint had not reached yet, and the grid's top clip (progress x range,
    // sampled by the render cycle) landed a few pixels off the band's bottom
    // edge on every frame the band moved. The band glided; the seam under it
    // shimmered, and the hours slid and snapped back at the end.
    //
    // Because JS owns the height, React must not also set it: an unrelated
    // re-render mid-flight (the now-line ticking, a drag) would slam the band to
    // its target for a frame. Neither .nc-allday-row nor .nc-left-rail-allday
    // carries a height in its inline style — see TimeGridSections.tsx.
    const allDayGrowFrameRef = useRef(0);
    /** What the band is actually showing. Not what was last asked for: a run cut
        short by a second row arriving leaves the band mid-way, and the next run
        has to start from there — from what the eye sees — or it would jump back
        to a height that was never reached and re-travel the distance. */
    const allDayShownHeightRef = useRef<number | null>(null);
    /** The band's height, on both sides of the seam, in one write. Two elements
        because the gutter under the chevron is in the left rail and the band is
        in the scroller; one write because the line that closes them is read as
        a single line, and a rail that arrives a frame late breaks it. */
    const paintAllDayBand = React.useCallback((height: number) => {
        allDayShownHeightRef.current = height;
        if (allDayRowRef.current) {
            allDayRowRef.current.style.height = `${height}px`;
        }
        if (allDayGutterRef.current) {
            allDayGutterRef.current.style.height = `${height}px`;
        }
    }, []);
    useLayoutEffect(() => {
        const el = scrollRootRef.current;
        if (!el) return;
        const from = allDayShownHeightRef.current;
        const running = allDayGrowFrameRef.current !== 0;
        if (from === allDayHeight && !running) return;

        cancelAnimationFrame(allDayGrowFrameRef.current);
        allDayGrowFrameRef.current = 0;
        // A run in flight passing through exactly the height now being asked
        // for: stop it there. Checked before the early return above, or the
        // band would carry on to a target nobody wants any more.
        if (from === allDayHeight) return;

        // The first paint has nothing to travel from, and someone who has asked
        // for less movement gets no travel at all: the band is simply there, and
        // the correction arrives in the same single step, or it would be the
        // only thing still moving.
        if (from === null || prefersReducedMotion()) {
            paintAllDayBand(allDayHeight);
            if (from !== null) el.scrollTop += allDayHeight - from;
            publishScrollTravel(el, gridRef.current);
            mirrorPinnedPanels();
            return;
        }

        const distance = allDayHeight - from;
        let startedAt: number | null = null;
        let moved = 0;
        const step = (now: number) => {
            // The clock starts on the first frame, not at React's commit:
            // progress is 0 on the frame the band is first painted, which is
            // where a CSS transition would have started counting too.
            if (startedAt === null) startedAt = now;
            const progress = Math.min(1, (now - startedAt) / ALLDAY_GROW_MS);

            // Whole pixels: a fractional height makes the scroller's own
            // scrollHeight — an integer, and the scroll range the clip is
            // computed from — round somewhere the band did not, which is a
            // pixel of shimmer at the seam. The last frame lands on the target
            // exactly, so the band comes to rest where the lanes are.
            const height = Math.round(from + distance * easeOutCubic(progress));
            paintAllDayBand(height);

            // The correction is the band's OWN growth, not a second easing of
            // the same distance: whatever the band did this frame, the scroll
            // does, so the hours cannot drift out from under it at any point.
            // Relative, never absolute — the person may be scrolling while the
            // band grows, and their scroll has to survive the correction. And
            // counted by what the screen DID rather than by what was asked: an
            // offset lands on whole device pixels, so a frame's share of the
            // last pixel can round away, and treating it as spent would leave
            // the hours a pixel off where the band left them.
            const before = el.scrollTop;
            el.scrollTop += height - from - moved;
            moved += el.scrollTop - before;

            // Read AFTER both, so the range describes the layout this frame is
            // about to paint rather than the one before it.
            publishScrollTravel(el, gridRef.current);
            mirrorPinnedPanels();

            if (progress < 1) {
                allDayGrowFrameRef.current = requestAnimationFrame(step);
            } else {
                allDayGrowFrameRef.current = 0;
            }
        };
        allDayGrowFrameRef.current = requestAnimationFrame(step);
        return () => cancelAnimationFrame(allDayGrowFrameRef.current);
    }, [allDayHeight, mirrorPinnedPanels, paintAllDayBand]);

    // The fallback path for everything the scroll timelines drive: the hours
    // rail's translateY, the grid's top clip, and the all-day band's pair of
    // counter-translations (the band by +scrollLeft to stay pinned at the
    // viewport's left edge — sticky-left is unreliable for a flex-column child
    // here — and its inner track by -scrollLeft so day cells realign with their
    // columns).
    //
    // Mirroring a scroll position through a listener costs a main-thread round
    // trip the scroll itself never waits for, which the finger reads as the
    // panels sliding against the grid. Where the timelines exist, CSS does all
    // of this on the render cycle instead and none of the code below runs.
    useLayoutEffect(() => {
        const main = scrollRootRef.current;
        const scrollable = leftScrollableRef.current;
        if (!main || !scrollable) return;
        if (PANELS_RIDE_SCROLL) return;
        let frame = 0;
        // Drives, among the rest, the vertical clip on .nc-days-row: clipping
        // its top by scrollTop keeps the grid from painting behind the
        // transparent sticky header/all-day band. See mirrorPinnedPanels, and
        // .nc-days-row in CalendarGrid.css.
        const update = () => {
            frame = 0;
            mirrorPinnedPanels();
        };
        const onScroll = () => {
            if (frame) return;
            frame = requestAnimationFrame(update);
        };
        update();
        main.addEventListener("scroll", onScroll, { passive: true });
        return () => {
            main.removeEventListener("scroll", onScroll);
            if (frame) cancelAnimationFrame(frame);
        };
    }, [mirrorPinnedPanels]);

    // Keep the all-day track's horizontal offset correct even when its node is
    // recreated by a re-render (collapse toggle, data/width change). The scroll
    // listener only fires on real scroll, so a fresh node would otherwise sit
    // at translateX(0) and reveal the wrong (buffer) slice — making the visible
    // days (and their collapsed counts) look empty. Same reasoning for the
    // grid's clip offset: a resize can clamp scrollTop with no scroll event, so
    // re-mirror --nc-scroll-y here too to keep the clip aligned.
    useLayoutEffect(() => {
        const main = scrollRootRef.current;
        if (!main) return;
        // And for the same reason, the band's height: it is written by hand, not
        // by React, so a recreated node would come back at its content height.
        // Re-asserting what the band is CURRENTLY showing — never the target —
        // leaves a run in flight untouched; the next frame carries on from here.
        if (allDayShownHeightRef.current !== null) {
            paintAllDayBand(allDayShownHeightRef.current);
        }
        // The content's own size changes without the scroller resizing — a
        // taller all-day band, another view, a different hour height, a day
        // added to the range. The travels are the timelines' only input, so they
        // are republished on every render whichever path is in use.
        publishScrollTravel(main, gridRef.current);
        mirrorPinnedPanels();
    });

    // Le cadre du drag venu du panneau passe par le meme rendu que ceux du drag
    // interne : meme composant, meme CSS, donc aucun risque de deux styles.
    const allPreviews = externalPreview
        ? [...dragPreviews, externalPreview]
        : dragPreviews;

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            // Disable dnd-kit's auto-scroll: grabbing an event near the top/
            // bottom edge made the grid scroll on its own, and because the drag
            // delta then accumulates the scrolled distance, the event landed far
            // from the pointer (e.g. dropped at 00:00) with no usable preview.
            //
            // Toujours coupé, et pour une deuxième raison depuis : les jours de
            // cette grille se tournent au lieu de couler (useAxisLock), et un
            // défilement continu la laisserait à cheval sur deux d'entre eux.
            // Le glissement au bord tourne donc des pages entières, d'où
            // `edgeTurnDirection` ; la projection, elle, ne se fie plus au delta
            // pour trouver le jour visé mais aux colonnes elles-mêmes, qui
            // portent leur date (voir `dayPositionUnderPointer`).
            autoScroll={false}
            onDragStart={handleDragStart}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
        >
            <div
                className="nc-timegrid-wrapper"
                ref={gridRef}
                style={
                    {
                        // Largeur REELLEMENT visible de la grille, publiee pour
                        // que le CSS puisse en deduire la largeur mini d'une
                        // colonne (voir --nc-day-min-width). Une formule basee
                        // sur 100vw se tromperait : le rail des heures grandit
                        // de 64 px par fuseau secondaire, et la barre laterale
                        // ou le panneau prennent aussi de la place. Mesure a
                        // 412 px avec deux fuseaux : 198 px visibles, pas 348.
                        "--nc-visible-grid-width": `${mainWidth}px`,
                        // Combien de temps la bande all-day met a grandir ou a
                        // rendre une ligne. Publiee ici pour que la transition
                        // CSS et la correction de defilement qui la suit soient
                        // le meme geste, d'une seule duree (ALLDAY_GROW_MS).
                        "--nc-allday-grow": `${ALLDAY_GROW_MS}ms`,
                    } as React.CSSProperties
                }
            >
                <LeftRail
                    width={leftRailWidth}
                    headerHeight={headerHeight}
                    allDayRef={allDayGutterRef}
                    showAllDay={showAllDay}
                    hours={HOURS}
                    timeFormat24h={timeFormat24h}
                    secondaryTimezones={secondaryTimezones}
                    onAddTimezone={onAddTimezone}
                    onRemoveTimezone={onRemoveTimezone}
                    allDayCollapsed={allDayCollapsed}
                    onToggleAllDayCollapsed={onToggleAllDayCollapsed}
                    referenceDate={dates[0]}
                    todayInRange={todayInRange}
                    nowTop={nowTop}
                    nowLabel={nowLabel}
                    now={now}
                    scrollableRef={leftScrollableRef}
                />
                <div className="nc-main-scroller" ref={scrollRootRef}>
                    <div className="nc-main-content">
                        <TimeGridHeaders
                            extendedDates={extendedDates}
                            scrollerWidthStyle={scrollerWidthStyle}
                            onSelectRange={onSelectRange}
                            ref={headersRowRef}
                        />

                        <TimeGridAllDay
                            allDayLanes={allDayLanes}
                            extendedDates={extendedDates}
                            contentRows={allDayContentRows}
                            draftLane={allDayDraftLane}
                            collapsed={allDayCollapsed}
                            onToggleCollapse={onToggleAllDayCollapsed}
                            stickyTop={headerHeight}
                            scrollerWidthStyle={scrollerWidthStyle}
                            mainWidth={mainWidth}
                            trackWidth={contentWidth}
                            trackRef={allDayTrackRef}
                            timeFormat24h={timeFormat24h}
                            onEventClick={onEventClick}
                            onContextMenu={onContextMenu}
                            onToggleTask={onToggleTask}
                            onSelectRange={onSelectRange}
                            onAllDayPointerDown={handleAllDayPointerDown}
                            draftSlot={draftSlot}
                            draftColor={draftColor}
                            dragPreview={dragPreview}
                            dragPreviews={allPreviews}
                            ref={allDayRowRef}
                        />

                        <TimeGridDays
                            hours={HOURS}
                            extendedDates={extendedDates}
                            overlapByDate={overlapByDate}
                            scrollerWidthStyle={scrollerWidthStyle}
                            timeFormat24h={timeFormat24h}
                            todayInRange={todayInRange}
                            nowTop={nowTop}
                            resizePreview={resizePreview}
                            dragPreview={dragPreview}
                            dragPreviews={allPreviews}
                            draftSlot={draftSlot}
                            draftColor={draftColor}
                            selection={selection}
                            onEventClick={onEventClick}
                            onContextMenu={onContextMenu}
                            onToggleTask={onToggleTask}
                            handleResizeStart={handleResizeStart}
                            handleDraftResizeStart={handleDraftResizeStart}
                            handleMouseDown={handleMouseDown}
                            handleDoubleClick={handleDoubleClick}
                            handleEmptyContext={handleEmptyContext}
                            contextLine={contextLine}
                            prayerLines={prayerLines}
                            prayerColor={prayerColor}
                        />
                    </div>
                </div>
            </div>

            {/* Block that follows the cursor while dragging. The .nc-drop-preview
                outline (rendered in the day column) marks the snapped landing
                slot; this ghost moves freely with the pointer and shows the live
                projected time (Notion-style).

                Portaled to document.body: Obsidian sets `contain: strict` on
                `.workspace-leaf`, which makes it the containing block for
                position:fixed descendants. dnd-kit positions the overlay in
                viewport coordinates, so left inside the leaf it would render
                offset by the leaf's viewport position. The portal escapes that
                ancestor; React context (DndContext) still reaches it through the
                React tree. */}
            {ReactDOM.createPortal(
                <DragOverlay dropAnimation={null}>
                    {activeEvent ? (
                        <div
                            className="nc-drag-ghost"
                            style={{
                                // A band-sourced event (all-day OR multi-day
                                // timed) collapses to a 30-min event on drop, so
                                // its ghost is a 30-min block — NOT the full-day /
                                // multi-day height getEventHeight would give (that
                                // rendered a full-column wall following the cursor).
                                height:
                                    activeEvent.allDay ||
                                    isMultiDayTimed(activeEvent)
                                        ? getEventHeight(
                                              activeEvent.start,
                                              new Date(
                                                  activeEvent.start.getTime() +
                                                      30 * 60 * 1000
                                              )
                                          )
                                        : getEventHeight(
                                              activeEvent.start,
                                              activeEvent.end
                                          ),
                                width: dragWidth || undefined,
                                borderLeftColor: activeEvent.color,
                                backgroundColor: withAlpha(
                                    activeEvent.color,
                                    0.6
                                ),
                            }}
                        >
                            <span className="nc-drag-ghost-title">
                                {activeEvent.title}
                            </span>
                            {!activeEvent.allDay && dragPreview && (
                                <span className="nc-drag-ghost-time">
                                    {formatTime(
                                        dragPreview.newStart,
                                        timeFormat24h
                                    )}{" "}
                                    –{" "}
                                    {formatTime(
                                        dragPreview.newEnd,
                                        timeFormat24h
                                    )}
                                </span>
                            )}
                        </div>
                    ) : null}
                </DragOverlay>,
                document.body
            )}
        </DndContext>
    );
}
