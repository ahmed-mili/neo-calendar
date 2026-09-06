import { useMemo, useRef } from "react";
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
 * lanes (rows), like Notion. Events that don't share a day share a lane; events
 * on the same day stack into separate lanes. Single-day events span one column;
 * multi-day all-day events span their visible range.
 *
 * The order events are considered in is the order they ARRIVED (see
 * `arrivalOf`), and that is the whole of how the band behaves when something is
 * added: the bars already on screen were placed first, so they keep the lanes
 * they have, and the new one takes the first lane still free on its own days —
 * which, on a day that already holds events, is the row under them. A new event
 * therefore appears below what was there, never above it, and the band grows
 * downwards by exactly the row it needed.
 *
 * The alternative — ordering by date, or by id — is what made a new event land
 * on top of an existing one and push it down: the packing is deterministic, but
 * "first" was decided by something that has nothing to do with when the event
 * was created.
 *
 * All-day events use an EXCLUSIVE end (start + 1 day for a single day, see
 * eventExpansion.ts), so the inclusive last day is `end - 1 day`.
 */
export function packAllDayLanes(
    allDayEvents: DisplayEvent[] | undefined,
    extendedDates: Date[],
    arrivalOf: (event: DisplayEvent) => number
): AllDayLanesResult {
    if (!allDayEvents || allDayEvents.length === 0 || !extendedDates.length) {
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

    // 2. Oldest first, so nothing that is already on screen is ever moved by
    //    something arriving after it. The remaining comparisons only decide
    //    between events the ranking cannot tell apart, and exist so the layout
    //    is the same every time it is rebuilt — a selected event re-creates its
    //    object and can reorder the input array, and an unstable order would
    //    make its bar jump to another lane just for being clicked.
    placed.sort(
        (a, b) =>
            arrivalOf(a.event) - arrivalOf(b.event) ||
            a.startIdx - b.startIdx ||
            b.span - a.span ||
            a.event.start.getTime() - b.event.start.getTime() ||
            a.event.id.localeCompare(b.event.id)
    );

    // 3. Each event goes in the first lane with room for it on its own days.
    //    The occupied stretches are kept per lane rather than just the last one:
    //    the events are no longer walked in date order, so "ends before this one
    //    starts" is not enough to know a lane is free.
    const laneSpans: Array<Array<[number, number]>> = [];
    const bars: AllDayLaneBar[] = [];
    for (const p of placed) {
        let lane = laneSpans.findIndex((spans) =>
            spans.every(([from, to]) => p.endIdx < from || p.startIdx > to)
        );
        if (lane === -1) {
            lane = laneSpans.length;
            laneSpans.push([]);
        }
        laneSpans[lane].push([p.startIdx, p.endIdx]);
        bars.push({
            event: p.event,
            startIdx: p.startIdx,
            span: p.span,
            lane,
        });
    }

    return { bars, laneCount: laneSpans.length };
}

/**
 * Combien de rangées la bande doit vraiment montrer, pour les seuls jours à
 * l'écran.
 *
 * Le packing se fait sur les dates étendues (jours tampons compris), sinon une
 * barre changerait de lane en entrant dans l'écran pendant un défilement
 * horizontal. Mais une barre posée uniquement dans le tampon peut pousser une
 * autre barre d'une lane vers le bas : `laneCount` compte alors une rangée que
 * rien de visible n'occupe, et la bande garde une ligne vide en trop — la même
 * paire d'évènements donnait une bande correcte ou trop haute selon la fenêtre
 * de sept jours affichée.
 *
 * C'est le plus haut lane VISIBLE + 1, et non le nombre de lanes distinctes :
 * une barre laissée en lane 1 alors que la lane 0 est vide à l'écran est
 * dessinée sur la deuxième rangée, qui doit donc exister.
 */
export function visibleLaneCount(
    bars: AllDayLaneBar[],
    firstVisibleIdx: number,
    lastVisibleIdx: number
): number {
    let highest = -1;
    for (const bar of bars) {
        const endIdx = bar.startIdx + bar.span - 1;
        if (endIdx < firstVisibleIdx || bar.startIdx > lastVisibleIdx) continue;
        if (bar.lane > highest) highest = bar.lane;
    }
    return highest + 1;
}

/**
 * Combien d'évènements chaque jour à l'écran porte AU TOTAL, une fois la
 * bande réduite à `visibleRows` rangées — pas seulement ceux qui sortent du
 * cadre.
 *
 * Replier la bande ne déplace rien (voir le commentaire de `TimeGridAllDay`) :
 * les barres des lanes suivantes sortent simplement du cadre, sans que rien ne
 * le dise. La pastille le dit, jour par jour — mais en comptant CE JOUR-LÀ, pas
 * ce qui est caché : "1 évènement" à côté d'une barre visible laisserait
 * croire qu'il n'y en a qu'un, quand il y en a deux. Une barre pluri-jours
 * compte pour chacun des jours qu'elle traverse.
 *
 * Les jours tampons sont exclus : ils ne sont pas à l'écran, et une pastille
 * posée sur eux serait comptée pour une colonne que personne ne voit.
 *
 * Renvoie un index de `extendedDates` vers un compte, et seulement les jours
 * qui cachent au moins un évènement (ceux qui n'en cachent aucun n'ont pas
 * besoin de pastille : la barre visible suffit à se comprendre).
 */
export function hiddenBarCountByDay(
    bars: AllDayLaneBar[],
    firstVisibleIdx: number,
    lastVisibleIdx: number,
    visibleRows: number
): Map<number, number> {
    const totals = new Map<number, number>();
    const hasHidden = new Set<number>();
    for (const bar of bars) {
        const from = Math.max(bar.startIdx, firstVisibleIdx);
        const to = Math.min(bar.startIdx + bar.span - 1, lastVisibleIdx);
        for (let idx = from; idx <= to; idx++) {
            totals.set(idx, (totals.get(idx) ?? 0) + 1);
            if (bar.lane >= visibleRows) hasHidden.add(idx);
        }
    }
    const counts = new Map<number, number>();
    for (const idx of hasHidden) counts.set(idx, totals.get(idx) ?? 0);
    return counts;
}

/**
 * How many rows the band holds, and how many of them are on screen.
 *
 * There is always ONE row more than the events need, and it is always empty.
 * That row is the only way to add an all-day event with a finger: a tap lands
 * on the day's empty background, and a band sized exactly to its bars leaves no
 * background to tap — the day that already had three events was the one day
 * nothing could be added to, while a quieter day beside it still had room by
 * accident. The row is kept while a draft is being named too, so the band does
 * not lose its way in as soon as it is used.
 *
 * Beyond `maxRows` the band stops growing and scrolls, spare row included.
 * Collapsed, it shows a single row, whatever it holds.
 */
export function allDayBandRows({
    laneCount,
    draftLane,
    collapsed,
    maxRows,
}: {
    laneCount: number;
    /** Row a pending all-day draft stands on, or null when none is pending. */
    draftLane: number | null;
    collapsed?: boolean;
    maxRows: number;
}): { contentRows: number; visibleRows: number } {
    const taken = Math.max(laneCount, draftLane === null ? 0 : draftLane + 1);
    const contentRows = taken + 1;
    return {
        contentRows,
        visibleRows: collapsed ? 1 : Math.min(contentRows, maxRows),
    };
}

/**
 * The lanes, plus the memory of what was already there.
 *
 * An event's rank is fixed the first time it is seen and never changes again,
 * which is what makes "the new one goes underneath" mean anything: the ids the
 * band already knows keep their places, and only the unseen one is new.
 */
export function useAllDayLanes(
    allDayEvents: DisplayEvent[] | undefined,
    extendedDates: Date[]
): AllDayLanesResult {
    const arrivals = useRef(new Map<string, number>());
    const nextArrival = useRef(0);

    return useMemo(() => {
        // A whole batch turning up at once — the first load, a calendar
        // switched back on, a week scrolled into range — has no order of its
        // own worth respecting, so it is ranked by date and the band reads
        // top to bottom in time. Only what appears afterwards is genuinely
        // newer, and that is the event just created.
        const unseen = (allDayEvents ?? []).filter(
            (event) => !arrivals.current.has(event.id)
        );
        unseen.sort(
            (a, b) =>
                a.start.getTime() - b.start.getTime() ||
                a.id.localeCompare(b.id)
        );
        for (const event of unseen) {
            arrivals.current.set(event.id, nextArrival.current++);
        }

        return packAllDayLanes(
            allDayEvents,
            extendedDates,
            (event) => arrivals.current.get(event.id) ?? 0
        );
    }, [allDayEvents, extendedDates]);
}
