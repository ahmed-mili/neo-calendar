import * as React from "react";
import { DateTime } from "luxon";
import {
    OVERLAP_COL_GAP,
    EVENT_VGAP,
    allDayRowHeight,
    DAYS_SHORT,
    formatHour,
    isToday,
    isSameDay,
    eventTopHours,
    eventDurationHours,
    scaledPx,
    scaledHeightPx,
    computeOverlapGroups,
    startOfDay,
} from "./CalendarUtils";
import { draftPreviewBox, selectionBox } from "./draftPreviewBox";
import EventBlock from "./EventBlock";
import DraftPreview from "./DraftPreview";
import TimezoneColumn, {
    TimezoneColumnHeader,
    TimezoneMenuContext,
} from "./TimezoneColumn";
import { TimezonePicker } from "./TimezonePicker";
import { AllDayCollapseChevrons, XIcon } from "./Icons";
import { AllDayLanesResult } from "./useAllDayLanes";
import { SelectionState, DragPreview, PrayerLine } from "./TimeGrid.types";
import { t } from "../i18n";

type OverlapGroups = ReturnType<typeof computeOverlapGroups>;

interface ResizePreview {
    eventId: string;
    newStart: Date;
    newEnd: Date;
}

// ── Left rail (hours + secondary timezones) ─────────────────
//
// Lives outside the horizontal scroller, so buffer day columns can never
// scroll under it — that's what removes the need for any clip-path hack.
// Vertical scroll is mirrored via translateY on the .scrollable child,
// driven by the main scroller's scrollTop.

interface LeftRailProps {
    width: number;
    headerHeight: number;
    /** The all-day gutter, whose height TimeGrid writes by hand every frame the
        band moves — see the grow effect there. Deliberately NOT a style prop:
        React setting the height too would slam the band to its target on any
        re-render that happened mid-flight. */
    allDayRef: React.Ref<HTMLDivElement>;
    showAllDay: boolean;
    hours: number[];
    timeFormat24h: boolean;
    secondaryTimezones?: string[];
    onAddTimezone?: (tz: string) => void;
    onRemoveTimezone?: (tz: string) => void;
    allDayCollapsed?: boolean;
    onToggleAllDayCollapsed?: () => void;
    referenceDate: Date | undefined;
    todayInRange: boolean;
    nowTop: string;
    nowLabel: string;
    now: Date;
    /** Les horaires de prière à annoncer dans la gouttière. Elle est commune
     *  aux colonnes : une pastille par jour en aurait empilé autant que de
     *  jours visibles à la même hauteur, donc c'est ici qu'elles se posent. */
    prayerLines?: PrayerLine[];
    prayerColor?: string;
    scrollableRef: React.RefObject<HTMLDivElement>;
}

/**
 * L'heure d'une prière, telle que la mosquée l'imprime.
 *
 * Elle n'est pas convertie dans une seconde zone : la table est un calendrier
 * papier en heure locale, et c'est cette minute-là qu'on cherche à lire.
 */
function prayerClock(minutes: number, timeFormat24h: boolean): string {
    const hour = Math.floor(minutes / 60);
    const minute = String(minutes % 60).padStart(2, "0");
    if (timeFormat24h) return `${String(hour).padStart(2, "0")}:${minute}`;
    return `${hour % 12 || 12}:${minute} ${hour < 12 ? "AM" : "PM"}`;
}

export function LeftRail({
    width,
    headerHeight,
    allDayRef,
    showAllDay,
    hours,
    prayerLines,
    prayerColor,
    timeFormat24h,
    secondaryTimezones,
    onAddTimezone,
    onRemoveTimezone,
    allDayCollapsed,
    onToggleAllDayCollapsed,
    referenceDate,
    todayInRange,
    nowTop,
    nowLabel,
    now,
    scrollableRef,
}: LeftRailProps) {
    // The "now" pill belongs on the column closest to the events grid (the
    // rightmost). With secondary zones present, that's the last one; the local
    // hours column then drops its pill. Without secondaries, the local column
    // keeps it.
    const hasSecondary = !!(secondaryTimezones && secondaryTimezones.length);

    // Home column shows the chosen primary zone (undefined = system zone, the
    // default — then nothing changes). Hours/now are relabelled in that zone;
    // event positions stay system-based.
    const tzMenu = React.useContext(TimezoneMenuContext);
    const homeZone = tzMenu?.primaryTimezone;
    const homeHourLabel = (hour: number): string => {
        if (hour === 0) return "";
        if (!homeZone) return formatHour(hour, timeFormat24h);
        const dt = DateTime.fromJSDate(referenceDate ?? new Date())
            .set({ hour, minute: 0, second: 0, millisecond: 0 })
            .setZone(homeZone);
        if (dt.minute === 0) return formatHour(dt.hour, timeFormat24h);
        return timeFormat24h ? dt.toFormat("HH:mm") : dt.toFormat("h:mm a");
    };
    const homeNowLabel = homeZone
        ? (() => {
              const dt = DateTime.fromJSDate(now).setZone(homeZone);
              return timeFormat24h
                  ? dt.toFormat("HH:mm")
                  : `${dt.hour % 12 || 12}:${String(dt.minute).padStart(
                        2,
                        "0"
                    )} ${dt.hour < 12 ? "AM" : "PM"}`;
          })()
        : nowLabel;

    return (
        <div className="nc-left-rail" style={{ width }}>
            <div className="nc-left-rail-fixed">
                <div
                    className="nc-left-rail-corner"
                    style={{ height: headerHeight }}
                >
                    <div className="nc-tz-corner-cell nc-tz-corner-primary">
                        <TimezonePicker
                            referenceDate={referenceDate}
                            onAddTimezone={onAddTimezone}
                        />
                    </div>
                    {/* Secondary-zone labels live here in the fixed band, one
                        cell per column — aligned above their hours column. */}
                    {secondaryTimezones &&
                        referenceDate &&
                        secondaryTimezones.map((tz) => (
                            <TimezoneColumnHeader
                                key={tz}
                                timezone={tz}
                                referenceDate={referenceDate}
                            />
                        ))}
                </div>
                {showAllDay && (
                    <div className="nc-left-rail-allday" ref={allDayRef}>
                        <div
                            className="nc-allday-collapse-btn"
                            role="button"
                            tabIndex={0}
                            aria-label={
                                allDayCollapsed
                                    ? t("Expand all-day events")
                                    : t("Collapse all-day events")
                            }
                            data-nc-tooltip={
                                allDayCollapsed
                                    ? t("Expand all-day events")
                                    : t("Collapse all-day events")
                            }
                            onClick={onToggleAllDayCollapsed}
                            onKeyDown={(event) => {
                                if (
                                    event.key === "Enter" ||
                                    event.key === " "
                                ) {
                                    event.preventDefault();
                                    onToggleAllDayCollapsed?.();
                                }
                            }}
                        >
                            <AllDayCollapseChevrons
                                size={14}
                                collapsed={!!allDayCollapsed}
                            />
                        </div>
                    </div>
                )}
            </div>
            <div className="nc-left-rail-window">
                <div className="nc-left-rail-scrollable" ref={scrollableRef}>
                    <div className="nc-timegrid-hours">
                        {hours.map((hour) => (
                            <div
                                key={hour}
                                className="nc-timegrid-hour"
                                style={{ height: scaledPx(1) }}
                            >
                                <span className="nc-timegrid-hour-label">
                                    {homeHourLabel(hour)}
                                </span>
                            </div>
                        ))}
                        {todayInRange && !hasSecondary && (
                            <div
                                className="nc-now-label"
                                style={{ top: nowTop }}
                            >
                                {homeNowLabel}
                            </div>
                        )}
                        {/* L'heure de chaque prière, dans la gouttière, comme
                            l'heure qu'il est. Le trait dit à quelle hauteur
                            elle tombe, pas à quelle minute : sans ce chiffre
                            elle se devinait entre deux graduations. */}
                        {prayerLines?.map((line) => (
                            <div
                                key={`prayer-${line.minutes}`}
                                className="nc-prayer-label"
                                style={
                                    {
                                        top: scaledPx(line.hours),
                                        "--nc-prayer-color": prayerColor,
                                    } as React.CSSProperties
                                }
                            >
                                {prayerClock(line.minutes, timeFormat24h)}
                            </div>
                        ))}
                    </div>
                    {secondaryTimezones &&
                        referenceDate &&
                        secondaryTimezones.map((tz, i) => (
                            <TimezoneColumn
                                key={tz}
                                timezone={tz}
                                timeFormat24h={timeFormat24h}
                                referenceDate={referenceDate}
                                showNow={
                                    todayInRange &&
                                    i === secondaryTimezones.length - 1
                                }
                                nowTop={nowTop}
                                now={now}
                            />
                        ))}
                </div>
            </div>
        </div>
    );
}

// ── Day headers strip ───────────────────────────────────────

interface HeadersProps {
    extendedDates: Date[];
    scrollerWidthStyle: string;
    onSelectRange: (start: Date, end: Date, allDay: boolean) => void;
}

export const TimeGridHeaders = React.forwardRef<HTMLDivElement, HeadersProps>(
    function TimeGridHeaders(
        { extendedDates, scrollerWidthStyle, onSelectRange },
        ref
    ) {
        return (
            <div
                className="nc-headers-row"
                ref={ref}
                style={{ width: scrollerWidthStyle }}
            >
                {extendedDates.map((date) => {
                    const today = isToday(date);
                    return (
                        <div
                            key={date.toDateString()}
                            className={`nc-timegrid-header ${
                                today ? "nc-today" : ""
                            }`}
                        >
                            <span className="nc-timegrid-header-day">
                                {DAYS_SHORT[date.getDay()]}{" "}
                                <span
                                    className={`nc-timegrid-header-date ${
                                        today ? "nc-today-date" : ""
                                    }`}
                                >
                                    {date.getDate()}
                                </span>
                            </span>
                            <button
                                className="nc-timegrid-header-add"
                                aria-label={t("New event")}
                                data-nc-tooltip={t("New event")}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const start = new Date(date);
                                    start.setHours(9, 0, 0, 0);
                                    const end = new Date(
                                        start.getTime() + 30 * 60000
                                    );
                                    onSelectRange(start, end, false);
                                }}
                            >
                                +
                            </button>
                        </div>
                    );
                })}
            </div>
        );
    }
);

// ── All-day lanes + cells ───────────────────────────────────
//
// Every all-day event is a horizontal bar packed into a stacked lane (row),
// Notion-style. The section grows up to ALLDAY_MAX_ROWS rows, then scrolls.
// A per-day cell grid sits underneath for double-click-to-create + draft, with
// the lane bars overlaid on top (lanes layer is pointer-transparent except the
// bars themselves, so empty areas still receive the cell double-click).

interface AllDayProps {
    allDayLanes: AllDayLanesResult;
    extendedDates: Date[];
    /** Rows the band holds, draft included — computed once in TimeGrid so the
        height, the scroll correction and this layout can never disagree. */
    contentRows: number;
    /** Row a pending all-day draft stands on, under its day's own events. */
    draftLane?: number | null;
    collapsed?: boolean;
    /** Par index de jour (dans `extendedDates`), le nombre d'évènements que le
        repli garde hors de vue. Calculé dans TimeGrid, qui seul connaît les
        colonnes réellement peintes. */
    hiddenByDay?: Map<number, number>;
    onToggleCollapse?: () => void;
    stickyTop?: number;
    scrollerWidthStyle: string;
    /** Visible width of the main scroller (px). The all-day row is pinned to
        this width and sticky-left so its vertical scrollbar stays on-screen;
        the inner track (full content width) follows horizontal scroll. */
    mainWidth?: number;
    /** Full content width (px) — the track matches it so day cells align with
        the day columns. Falls back to the calc string until measured. */
    trackWidth?: number;
    trackRef?: React.Ref<HTMLDivElement>;
    timeFormat24h: boolean;
    onEventClick: (id: string) => void;
    onContextMenu: (id: string, e: MouseEvent) => void;
    onToggleTask: (id: string, done: boolean) => Promise<boolean>;
    onSelectRange: (start: Date, end: Date, allDay: boolean) => void;
    /** A single tap on the band, on the phone. Absent on the desktop, where a
        double click is the gesture. */
    onAllDayPointerDown?: (event: React.PointerEvent, date: Date) => void;
    draftSlot?: { start: Date; end: Date; allDay: boolean } | null;
    draftColor?: string;
    dragPreview?: DragPreview | null;
    dragPreviews?: DragPreview[];
}

export const TimeGridAllDay = React.forwardRef<HTMLDivElement, AllDayProps>(
    function TimeGridAllDay(
        {
            allDayLanes,
            extendedDates,
            contentRows,
            draftLane,
            collapsed,
            hiddenByDay,
            onToggleCollapse,
            stickyTop,
            scrollerWidthStyle,
            mainWidth,
            trackWidth,
            trackRef,
            timeFormat24h,
            onEventClick,
            onContextMenu,
            onToggleTask,
            onSelectRange,
            onAllDayPointerDown,
            draftSlot,
            draftColor,
            dragPreview,
            dragPreviews,
        },
        ref
    ) {
        const len = extendedDates.length || 1;

        // One landing frame per all-day event being moved (the dragged one + the
        // rest of the multi-selection), shifted to its projected start day. A
        // timed event dragged into the band has no existing bar, so it falls back
        // to lane 0 / span 1. Computed once here so BOTH the collapsed and the
        // expanded layouts can show the drop preview (Notion shows it in both).
        const allDayPreviews = (dragPreviews ?? []).flatMap((p) => {
            if (!p.event.allDay) return [];
            const bar = allDayLanes.bars.find((b) => b.event.id === p.event.id);
            const idx = extendedDates.findIndex((d) =>
                isSameDay(d, p.newStart)
            );
            if (idx === -1) return [];
            return [
                {
                    id: p.event.id,
                    lane: bar?.lane ?? 0,
                    span: bar?.span ?? 1,
                    idx,
                    color: p.event.color,
                },
            ];
        });

        // NO separate collapsed layout, and that is the point.
        //
        // There used to be one: each day drew its lone event as a bar inset in
        // its own cell, and a day with several drew a count. Which meant an
        // event MOVED and CHANGED SIZE on collapse — a cell-wide box with 2px
        // insets instead of the lane bar it had been, spanning one day instead
        // of its real span. Folding the band is a change to the BAND, and it
        // should leave what is inside it exactly where it was.
        //
        // Collapsing now only shortens the row: same track, same lanes, same
        // geometry, and the rows past the first are simply out of view. The
        // height is decided in TimeGrid (allDayVisibleRows).
        //
        // Replié, le scroll interne est coupé : y accéder sans le dire ne
        // valait rien tant qu'aucun signe ne montrait qu'il y avait plus à
        // voir. Le badge N-événements (ci-dessous) est maintenant ce signe,
        // et son clic déplie franchement la bande plutôt que de la faire
        // défiler en douce.

        return (
            <div
                className={`nc-allday-row${
                    collapsed ? " nc-allday-row--collapsed" : ""
                }`}
                ref={ref}
                style={{
                    ...(stickyTop !== undefined ? { top: stickyTop } : {}),
                    width: mainWidth || scrollerWidthStyle,
                }}
            >
                <div
                    className="nc-allday-track"
                    ref={trackRef}
                    style={{
                        width: trackWidth || scrollerWidthStyle,
                        height: contentRows * allDayRowHeight(),
                    }}
                >
                    {/* Per-day background grid (double-click target + draft) */}
                    <div className="nc-allday-cells">
                        {extendedDates.map((date) => (
                            <div
                                key={date.toDateString()}
                                className="nc-allday-cell"
                                onDoubleClick={() =>
                                    onSelectRange(date, date, true)
                                }
                                onPointerDown={(event) =>
                                    onAllDayPointerDown?.(event, date)
                                }
                            >
                                <DraftPreview>{draftSlot &&
                                    draftSlot.allDay &&
                                    isSameDay(draftSlot.start, date) && (
                                        <div
                                            className="nc-selection-mirror nc-allday-draft"
                                            data-draft-preview="true"
                                            style={{
                                                // On the row it will keep once
                                                // named: under whatever the day
                                                // already holds, never over it.
                                                top:
                                                    (draftLane ?? 0) *
                                                        allDayRowHeight() +
                                                    EVENT_VGAP / 2,
                                                height:
                                                    allDayRowHeight() -
                                                    EVENT_VGAP,
                                                backgroundColor: draftColor
                                                    ? draftColor + "25"
                                                    : undefined,
                                            }}
                                        />
                                    )}</DraftPreview>
                            </div>
                        ))}
                    </div>

                    {/* Stacked lane bars */}
                    <div className="nc-allday-lanes">
                        {allDayLanes.bars.map((bar) => {
                            // Un badge « N évènements » couvre ce jour : la
                            // barre garde sa géométrie (lane, span) mais ne
                            // se peint plus, sinon son nom se lirait derrière
                            // le texte du badge, transparent par-dessus elle
                            // (repère Notion : la case ne montre plus aucune
                            // couleur d'évènement une fois le compte affiché).
                            const overlapsHiddenDay =
                                collapsed &&
                                hiddenByDay &&
                                Array.from(
                                    { length: bar.span },
                                    (_, i) => bar.startIdx + i
                                ).some((idx) => hiddenByDay.has(idx));
                            return (
                                <EventBlock
                                    key={bar.event.id}
                                    event={bar.event}
                                    compact
                                    timeFormat24h={timeFormat24h}
                                    onEventClick={onEventClick}
                                    onContextMenu={onContextMenu}
                                    onToggleTask={onToggleTask}
                                    style={{
                                        position: "absolute",
                                        top:
                                            bar.lane * allDayRowHeight() +
                                            EVENT_VGAP / 2,
                                        height:
                                            allDayRowHeight() - EVENT_VGAP,
                                        left: `${(bar.startIdx / len) * 100}%`,
                                        width: `calc(${
                                            (bar.span / len) * 100
                                        }% - ${OVERLAP_COL_GAP}px)`,
                                        ...(overlapsHiddenDay
                                            ? {
                                                  visibility: "hidden",
                                                  pointerEvents: "none",
                                              }
                                            : {}),
                                    }}
                                />
                            );
                        })}
                        {allDayPreviews.map((p) => (
                            <div
                                key={p.id}
                                className="nc-drop-preview nc-allday-draft"
                                style={{
                                    top:
                                        p.lane * allDayRowHeight() +
                                        EVENT_VGAP / 2,
                                    height: allDayRowHeight() - EVENT_VGAP,
                                    left: `${(p.idx / len) * 100}%`,
                                    width: `calc(${
                                        (p.span / len) * 100
                                    }% - ${OVERLAP_COL_GAP}px)`,
                                    color: p.color,
                                }}
                            />
                        ))}
                        {/* Ce que le repli garde hors de vue, annoncé dans la
                            colonne du jour concerné — à droite de la rangée
                            visible, par-dessus la barre qui occupe déjà toute
                            la largeur du jour. Un élément EN PLUS : aucune
                            barre ne change de place, de taille ni de lane.

                            Le compte est le TOTAL du jour, pas seulement ce
                            qui est caché : la barre visible fait déjà partie
                            du compte, sinon « 1 événement » à côté d'elle
                            laisserait croire qu'il n'y en a qu'un, quand il y
                            en a deux. `hiddenBarCountByDay` ne renvoie donc
                            jamais moins de 2 ici — le singulier `t("1 event")`
                            reste géré pour rester correct si la formule change
                            un jour. */}
                        {collapsed &&
                            hiddenByDay &&
                            [...hiddenByDay].map(([idx, count]) => (
                                <button
                                    key={`nc-allday-hidden-${idx}`}
                                    type="button"
                                    className="nc-allday-hidden-count"
                                    // Même geste que le chevron : la bande n'a
                                    // qu'un seul état déplié, jour par jour ou
                                    // globalement — ce badge n'est qu'une
                                    // deuxième cible pour l'atteindre, sur le
                                    // jour où il manque justement quelque
                                    // chose à voir (repère Notion : cliquer
                                    // « N events » déplie toute la bande, pas
                                    // seulement cette colonne).
                                    //
                                    // Il couvre toute la CASE du jour — sans
                                    // le renfoncement des barres, qui laissent
                                    // OVERLAP_COL_GAP entre deux évènements
                                    // côte à côte — et l'efface complètement à
                                    // l'œil — même repère que Notion : un jour
                                    // à plusieurs évènements montre CE compte,
                                    // pas le nom du premier, les deux se
                                    // disputant sinon le même espace dans une
                                    // colonne étroite. La barre garde sa
                                    // géométrie exacte en dessous (lane, span
                                    // inchangés) : seul ce qui se peint
                                    // par-dessus change.
                                    onClick={onToggleCollapse}
                                    style={{
                                        top: 0,
                                        height: allDayRowHeight(),
                                        left: `${(idx / len) * 100}%`,
                                        width: `${(1 / len) * 100}%`,
                                    }}
                                >
                                    {count === 1
                                        ? t("1 event")
                                        : t("{n} events").replace(
                                              "{n}",
                                              String(count)
                                          )}
                                </button>
                            ))}
                    </div>
                </div>
            </div>
        );
    }
);

// ── Single day column ──────────────────────────────────────

interface DayColumnProps {
    date: Date;
    dateIdx: number;
    groups: OverlapGroups;
    timeFormat24h: boolean;
    hours: number[];
    resizePreview: ResizePreview | null;
    dragPreview: DragPreview | null;
    dragPreviews?: DragPreview[];
    draftSlot?: { start: Date; end: Date; allDay: boolean } | null;
    draftColor?: string;
    selection: SelectionState | null;
    nowTop?: string;
    onEventClick: (id: string) => void;
    onContextMenu: (id: string, e: MouseEvent) => void;
    onToggleTask: (id: string, done: boolean) => Promise<boolean>;
    handleResizeStart: (
        eventId: string,
        startY: number,
        edge: "top" | "bottom"
    ) => void;
    handleDraftResizeStart: (
        e: React.PointerEvent,
        edge: "top" | "bottom"
    ) => void;
    handleMouseDown: (
        e: React.PointerEvent,
        date: Date,
        dayIndex: number
    ) => void;
    handleDoubleClick: (e: React.MouseEvent, date: Date) => void;
    handleEmptyContext: (e: React.MouseEvent, date: Date) => void;
    /** Les traits de prière de CE jour, déjà triés par le parent. */
    prayerLines?: PrayerLine[];
    prayerColor?: string;
}

function DayColumn({
    date,
    dateIdx,
    groups,
    timeFormat24h,
    hours,
    resizePreview,
    dragPreview,
    dragPreviews,
    draftSlot,
    draftColor,
    selection,
    nowTop,
    onEventClick,
    onContextMenu,
    onToggleTask,
    handleResizeStart,
    handleDraftResizeStart,
    handleMouseDown,
    handleDoubleClick,
    handleEmptyContext,
    prayerLines,
    prayerColor,
}: DayColumnProps) {
    const dayKey = date.toDateString();
    const dayStart = startOfDay(date);
    const today = isToday(date);
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;

    // The slice of a [a, b] time range that falls on THIS column's day. Lets a
    // cross-day selection/draft render as: start day from its time to midnight,
    // whole middle days, end day from midnight to its time (Notion-style).
    // `hasEnd` marks the column that holds the range's actual end (for the
    // draft's resize handle).
    const dayPortion = (aMs: number, bMs: number) => {
        const s = Math.min(aMs, bMs);
        const e = Math.max(aMs, bMs);
        const dayStartMs = dayStart.getTime();
        const dayEndMs = new Date(
            date.getFullYear(),
            date.getMonth(),
            date.getDate() + 1
        ).getTime();
        const ps = Math.max(s, dayStartMs);
        const pe = Math.min(e, dayEndMs);
        if (pe <= ps) return null;
        return {
            topHours: eventTopHours(new Date(ps), dayStart),
            durationHours: (pe - ps) / 3600000,
            hasStart: s >= dayStartMs && s < dayEndMs,
            hasEnd: e > dayStartMs && e <= dayEndMs,
        };
    };
    const selPortion = selection
        ? dayPortion(selection.startDate.getTime(), selection.endDate.getTime())
        : null;
    const draftPortion =
        draftSlot && !draftSlot.allDay
            ? dayPortion(draftSlot.start.getTime(), draftSlot.end.getTime())
            : null;

    return (
        <div
            className={`nc-timegrid-day ${today ? "nc-today" : ""} ${
                isWeekend ? "nc-weekend" : ""
            }`}
            data-day-index={dateIdx}
            data-date={date.toISOString()}
            onPointerDown={(e) => handleMouseDown(e, date, dateIdx)}
            onDoubleClick={(e) => handleDoubleClick(e, date)}
            onContextMenu={(e) => handleEmptyContext(e, date)}
        >
            {hours.map((hour) => (
                <div key={hour} className="nc-timegrid-slot">
                    <div className="nc-timegrid-slot-line" />
                </div>
            ))}

            {groups.flatMap((group) =>
                group.events.map(({ event, column, totalColumns }) => {
                    const isResizing = resizePreview?.eventId === event.id;
                    const previewStart = isResizing
                        ? resizePreview!.newStart
                        : undefined;
                    const previewEnd = isResizing
                        ? resizePreview!.newEnd
                        : undefined;
                    const effStart = previewStart ?? event.start;
                    const effEnd = previewEnd ?? event.end;
                    const top = scaledPx(
                        eventTopHours(effStart, dayStart),
                        EVENT_VGAP / 2
                    );
                    const height = scaledHeightPx(
                        eventDurationHours(effStart, effEnd),
                        -EVENT_VGAP
                    );
                    const colWidthCalc = `calc(100% / ${totalColumns} - ${OVERLAP_COL_GAP}px)`;
                    const leftCalc = `calc(${column} * 100% / ${totalColumns})`;

                    return (
                        <EventBlock
                            key={event.id}
                            event={event}
                            timeFormat24h={timeFormat24h}
                            onEventClick={onEventClick}
                            onContextMenu={onContextMenu}
                            onToggleTask={onToggleTask}
                            onResizeStart={handleResizeStart}
                            isResizing={isResizing}
                            previewStart={previewStart}
                            previewEnd={previewEnd}
                            style={{
                                position: "absolute",
                                top,
                                height,
                                left: leftCalc,
                                width: colWidthCalc,
                            }}
                        />
                    );
                })
            )}

            {/* One landing frame per timed event being moved (dragged + the
                rest of the multi-selection) whose projected day is this column. */}
            {(dragPreviews ?? []).map((p) =>
                p.dayKey === dayKey && !p.event.allDay ? (
                    <div
                        key={p.event.id}
                        className="nc-drop-preview"
                        style={{
                            top: scaledPx(eventTopHours(p.newStart, dayStart)),
                            height: scaledHeightPx(
                                eventDurationHours(p.newStart, p.newEnd)
                            ),
                            color: p.event.color,
                        }}
                    />
                ) : null
            )}

            <DraftPreview>{draftPortion && (
                <div
                    className="nc-selection-mirror"
                    data-draft-preview="true"
                    style={{
                        ...draftPreviewBox(draftPortion),
                        backgroundColor: draftColor
                            ? draftColor + "25"
                            : undefined,
                    }}
                >
                    {draftPortion.hasStart && (
                        <div
                            className="nc-draft-preview-resize nc-draft-preview-resize-top"
                            data-neo-resize-edge="top"
                            onPointerDown={(event) =>
                                handleDraftResizeStart(event, "top")
                            }
                        />
                    )}
                    {draftPortion.hasEnd && (
                        <div
                            className="nc-draft-preview-resize nc-draft-preview-resize-bottom"
                            data-neo-resize-edge="bottom"
                            onPointerDown={(event) =>
                                handleDraftResizeStart(event, "bottom")
                            }
                        />
                    )}
                </div>
            )}</DraftPreview>

            {selPortion && (
                <div
                    className="nc-selection-mirror"
                    style={{
                        ...selectionBox(selPortion),
                        backgroundColor: draftColor
                            ? draftColor + "25"
                            : undefined,
                    }}
                />
            )}

            {today && nowTop !== undefined && (
                <>
                    <div
                        className="nc-now-today-line"
                        style={{ top: nowTop }}
                    />
                    <div className="nc-now-tick" style={{ top: nowTop }} />
                </>
            )}

            {/* Les horaires de prière. Un trait, rien d'autre : l'heure se lit
                à sa hauteur, et le nom de la prière se déduit de l'heure. Ils
                portent la couleur de leur calendrier, donc ils s'éteignent
                avec lui sans que rien ici ait à le savoir. */}
            {prayerLines?.map((line) => (
                <div
                    key={`${line.hours}-${line.next}`}
                    className="nc-prayer-line"
                    style={
                        {
                            top: scaledPx(line.hours),
                            "--nc-prayer-color": prayerColor,
                        } as React.CSSProperties
                    }
                />
            ))}
        </div>
    );
}

// ── Day columns area ───────────────────────────────────────

interface DaysAreaProps {
    hours: number[];
    extendedDates: Date[];
    overlapByDate: Map<string, OverlapGroups>;
    scrollerWidthStyle: string;
    timeFormat24h: boolean;
    todayInRange: boolean;
    nowTop: string;
    resizePreview: ResizePreview | null;
    dragPreview: DragPreview | null;
    dragPreviews?: DragPreview[];
    draftSlot?: { start: Date; end: Date; allDay: boolean } | null;
    draftColor?: string;
    selection: SelectionState | null;
    onEventClick: (id: string) => void;
    onContextMenu: (id: string, e: MouseEvent) => void;
    onToggleTask: (id: string, done: boolean) => Promise<boolean>;
    handleResizeStart: (
        eventId: string,
        startY: number,
        edge: "top" | "bottom"
    ) => void;
    handleDraftResizeStart: (
        e: React.PointerEvent,
        edge: "top" | "bottom"
    ) => void;
    handleMouseDown: (
        e: React.PointerEvent,
        date: Date,
        dayIndex: number
    ) => void;
    handleDoubleClick: (e: React.MouseEvent, date: Date) => void;
    handleEmptyContext: (e: React.MouseEvent, date: Date) => void;
    contextLine?: { date: Date; top: number } | null;
    prayerLines?: PrayerLine[];
    prayerColor?: string;
}

export function TimeGridDays({
    hours,
    extendedDates,
    overlapByDate,
    scrollerWidthStyle,
    timeFormat24h,
    todayInRange,
    nowTop,
    resizePreview,
    dragPreview,
    dragPreviews,
    draftSlot,
    draftColor,
    selection,
    onEventClick,
    onContextMenu,
    onToggleTask,
    handleResizeStart,
    handleDraftResizeStart,
    handleMouseDown,
    handleDoubleClick,
    handleEmptyContext,
    contextLine,
    prayerLines,
    prayerColor,
}: DaysAreaProps) {
    const contextLineIdx = contextLine
        ? extendedDates.findIndex(
              (d) => d.toDateString() === contextLine.date.toDateString()
          )
        : -1;

    /* Un trait de prière appartient à un jour, et la grille rend aussi des
       colonnes tampon hors écran : les grouper par jour une fois vaut mieux que
       filtrer la liste dans chacune des colonnes. */
    const prayersByDay = React.useMemo(() => {
        const byDay = new Map<string, PrayerLine[]>();
        for (const line of prayerLines ?? []) {
            const key = line.date.toDateString();
            byDay.set(key, [...(byDay.get(key) ?? []), line]);
        }
        return byDay;
    }, [prayerLines]);

    return (
        <div className="nc-days-row" style={{ width: scrollerWidthStyle }}>
            {extendedDates.map((date, dateIdx) => (
                <DayColumn
                    key={date.toDateString()}
                    date={date}
                    dateIdx={dateIdx}
                    groups={overlapByDate.get(date.toDateString()) || []}
                    timeFormat24h={timeFormat24h}
                    hours={hours}
                    resizePreview={resizePreview}
                    dragPreview={dragPreview}
                    dragPreviews={dragPreviews}
                    draftSlot={draftSlot}
                    draftColor={draftColor}
                    selection={selection}
                    nowTop={nowTop}
                    onEventClick={onEventClick}
                    onContextMenu={onContextMenu}
                    onToggleTask={onToggleTask}
                    handleResizeStart={handleResizeStart}
                    handleDraftResizeStart={handleDraftResizeStart}
                    handleMouseDown={handleMouseDown}
                    handleDoubleClick={handleDoubleClick}
                    handleEmptyContext={handleEmptyContext}
                    prayerLines={prayersByDay.get(date.toDateString())}
                    prayerColor={prayerColor}
                />
            ))}
            {contextLine && contextLineIdx >= 0 && (
                <div
                    className="nc-context-line"
                    style={{
                        top: contextLine.top,
                        left: `${
                            (contextLineIdx * 100) / extendedDates.length
                        }%`,
                        width: `${100 / extendedDates.length}%`,
                    }}
                />
            )}
            {/* L'heure qu'il est traverse la semaine entiere, en filet.
                Elle avait ete retiree en 1.5.5 au motif qu'elle « dit quelque
                chose de faux au-dessus de demain » — mais 13 h 40 est la meme
                hauteur dans toutes les colonnes, et sans elle le segment vif
                d'aujourd'hui flotte seul au milieu de la grille, ce qui est
                precisement ce qui a ete signale comme bizarre. Le filet situe,
                le segment vif designe. Il reste sous le segment (z-index 5
                contre 6) et dans le conteneur des colonnes, donc il ne mord
                pas sur la gouttiere des heures a gauche. */}
            {todayInRange && (
                <div className="nc-now-line" style={{ top: nowTop }} />
            )}
            {/* Le meme filet pour chaque horaire de priere : il vaut lui aussi
                pour toutes les colonnes, et c'est lui qui situe le segment de
                la colonne du jour au lieu de le laisser flotter. Pose ici, une
                fois pour la grille, et non dans chaque colonne. */}
            {prayerLines?.map((line) => (
                <div
                    key={`prayer-filet-${line.minutes}`}
                    className="nc-prayer-line-full"
                    style={
                        {
                            top: scaledPx(line.hours),
                            "--nc-prayer-color": prayerColor,
                        } as React.CSSProperties
                    }
                />
            ))}
        </div>
    );
}
