import { useMemo } from "react";
import { DisplayEvent } from "../types";
import { isSameDay, startOfDay } from "./CalendarUtils";

export interface AllDayLaneBar {
    event: DisplayEvent;
    startIdx: number; // first visible column index (in extendedDates)
    span: number; // number of day columns the bar covers
    lane: number; // stacked row index (0-based)
}

export interface AllDayLanesResult {
    bars: AllDayLaneBar[];
    laneCount: number; // number of lanes needed for the visible range
}

/**
 * Lays out every all-day event as a horizontal bar and packs them into stacked
 * lanes (rows), like Notion. Events that don't overlap by day share a lane;
 * events on the same day stack into separate lanes. Single-day events span one
 * column; multi-day all-day events span their visible range.
 *
 * All-day events use an EXCLUSIVE end (start + 1 day for a single day, see
 * eventExpansion.ts), so the inclusive last day is `end - 1 day`.
 */
export function useAllDayLanes(
    allDayEvents: DisplayEvent[] | undefined,
    extendedDates: Date[]
): AllDayLanesResult {
    return useMemo(() => {
        if (
            !allDayEvents ||
            allDayEvents.length === 0 ||
            !extendedDates.length
        ) {
            return { bars: [], laneCount: 0 };
        }

        // 1. Place each event on the visible date axis (startIdx + span).
        type Placed = {
            event: DisplayEvent;
            startIdx: number;
            endIdx: number;
            span: number;
        };
        const placed: Placed[] = [];

        for (const event of allDayEvents) {
            // Inclusive last day. end − 1ms then truncate to the day: works for
            // all-day events (end is exclusive midnight) AND multi-day timed
            // events (end is the real end time on the last day).
            const lastDay = startOfDay(new Date(event.end.getTime() - 1));

            let startIdx = extendedDates.findIndex((d) =>
                isSameDay(d, event.start)
            );
            if (startIdx === -1) {
                // Starts before the visible range — clip to first visible day.
                startIdx = extendedDates.findIndex(
                    (d) => event.start <= d && d <= lastDay
                );
                if (startIdx === -1) continue; // entirely outside the range
            }

            let span = 1;
            for (let i = startIdx + 1; i < extendedDates.length; i++) {
                if (
                    extendedDates[i] > lastDay &&
                    !isSameDay(extendedDates[i], lastDay)
                )
                    break;
                span++;
            }

            placed.push({
                event,
                startIdx,
                endIdx: startIdx + span - 1,
                span,
            });
        }

        // 2. Greedy lane assignment (interval partitioning): each event goes in
        //    the first lane whose last bar ends before this event starts.
        //    The tiebreaker (start time, then id) must be STABLE and independent
        //    of the input array order: selecting an event re-creates its object
        //    and can reorder allDayEvents (cache re-expansion on panel open), and
        //    without a stable key that reorder would move the bar to a different
        //    lane — making a selected event visibly jump to the bottom.
        placed.sort(
            (a, b) =>
                a.startIdx - b.startIdx ||
                b.span - a.span ||
                a.event.start.getTime() - b.event.start.getTime() ||
                a.event.id.localeCompare(b.event.id)
        );
        const laneEnds: number[] = []; // last occupied column index per lane
        const bars: AllDayLaneBar[] = [];
        for (const p of placed) {
            let lane = laneEnds.findIndex((end) => end < p.startIdx);
            if (lane === -1) {
                lane = laneEnds.length;
                laneEnds.push(p.endIdx);
            } else {
                laneEnds[lane] = p.endIdx;
            }
            bars.push({
                event: p.event,
                startIdx: p.startIdx,
                span: p.span,
                lane,
            });
        }

        return { bars, laneCount: laneEnds.length };
    }, [allDayEvents, extendedDates]);
}
