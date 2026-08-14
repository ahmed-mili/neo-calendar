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
import EventBlock from "./EventBlock";
import TimezoneColumn, {
    TimezoneColumnHeader,
    TimezoneMenuContext,
} from "./TimezoneColumn";
import { TimezonePicker } from "./TimezonePicker";
import { AllDayCollapseChevrons, XIcon } from "./Icons";
import { AllDayLanesResult } from "./useAllDayLanes";
import { SelectionState, DragPreview } from "./TimeGrid.types";
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
    scrollableRef: React.RefObject<HTMLDivElement>;
}

export function LeftRail({
    width,
    headerHeight,
    allDayRef,
    showAllDay,
    hours,
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
                            title={
                                allDayCollapsed
                                    ? "Expand all-day events"
                                    : "Collapse all-day events"
                            }
                            onClick={onToggleAllDayCollapsed}
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
                                title={t("New event")}
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
        // height is decided in TimeGrid (allDayVisibleRows) and the row scrolls
        // internally, so they can still be reached without unfolding.

        return (
            <div
                className="nc-allday-row"
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
                                {draftSlot &&
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
                                    )}
                            </div>
                        ))}
                    </div>

                    {/* Stacked lane bars */}
                    <div className="nc-allday-lanes">
                        {allDayLanes.bars.map((bar) => (
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
                                    height: allDayRowHeight() - EVENT_VGAP,
                                    left: `${(bar.startIdx / len) * 100}%`,
                                    width: `calc(${
                                        (bar.span / len) * 100
                                    }% - ${OVERLAP_COL_GAP}px)`,
                                }}
                            />
                        ))}
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
            top: scaledPx(eventTopHours(new Date(ps), dayStart)),
            height: scaledPx((pe - ps) / 3600000),
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

            {draftPortion && (
                <div
                    className="nc-selection-mirror"
                    data-draft-preview="true"
                    style={{
                        top: draftPortion.top,
                        height: draftPortion.height,
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
            )}

            {selPortion && (
                <div
                    className="nc-selection-mirror"
                    style={{
                        top: selPortion.top,
                        height: selPortion.height,
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
}: DaysAreaProps) {
    const contextLineIdx = contextLine
        ? extendedDates.findIndex(
              (d) => d.toDateString() === contextLine.date.toDateString()
          )
        : -1;

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
        </div>
    );
}
