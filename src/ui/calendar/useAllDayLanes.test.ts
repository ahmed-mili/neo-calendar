import { packAllDayLanes } from "./useAllDayLanes";
import { DisplayEvent } from "../types";

const DAY = 24 * 60 * 60 * 1000;
const dates = Array.from({ length: 5 }, (_, i) => new Date(2026, 7, 10 + i));

/** An all-day event over `days` days from `dates[startIdx]` (end is exclusive). */
function allDay(id: string, startIdx: number, days = 1): DisplayEvent {
    const start = dates[startIdx];
    return {
        id,
        title: id,
        start,
        end: new Date(start.getTime() + days * DAY),
        allDay: true,
        color: "#888",
    } as DisplayEvent;
}

/** Ranks events in the order given, the way the band remembers them. */
function arrivedInOrder(...ids: string[]) {
    return (event: DisplayEvent) => {
        const rank = ids.indexOf(event.id);
        return rank === -1 ? ids.length : rank;
    };
}

const laneOf = (result: ReturnType<typeof packAllDayLanes>, id: string) =>
    result.bars.find((bar) => bar.event.id === id)?.lane;

describe("packAllDayLanes", () => {
    it("puts an event added to a day underneath the ones already on it", () => {
        const before = [allDay("first", 1)];
        const after = [...before, allDay("second", 1)];

        const result = packAllDayLanes(
            after,
            dates,
            arrivedInOrder("first", "second")
        );

        expect(laneOf(result, "first")).toBe(0);
        expect(laneOf(result, "second")).toBe(1);
        expect(result.laneCount).toBe(2);
    });

    it("leaves the bars already on screen exactly where they were", () => {
        const order = arrivedInOrder("first", "second", "third");
        const first = packAllDayLanes([allDay("first", 1)], dates, order);
        const grown = packAllDayLanes(
            [allDay("first", 1), allDay("second", 1), allDay("third", 1)],
            dates,
            order
        );

        expect(laneOf(first, "first")).toBe(laneOf(grown, "first"));
        expect(laneOf(grown, "second")).toBe(1);
        expect(laneOf(grown, "third")).toBe(2);
    });

    // An id that sorts before an existing one used to win lane 0 and push the
    // event that was already there down a row: the new bar appeared ABOVE.
    it("does not let a name decide which event came first", () => {
        const result = packAllDayLanes(
            [allDay("b-was-here", 1), allDay("a-is-new", 1)],
            dates,
            arrivedInOrder("b-was-here", "a-is-new")
        );

        expect(laneOf(result, "b-was-here")).toBe(0);
        expect(laneOf(result, "a-is-new")).toBe(1);
    });

    it("keeps the top row for a day that has nothing on it yet", () => {
        const result = packAllDayLanes(
            [allDay("monday", 0), allDay("wednesday", 2)],
            dates,
            arrivedInOrder("monday", "wednesday")
        );

        expect(laneOf(result, "wednesday")).toBe(0);
        expect(result.laneCount).toBe(1);
    });

    // Walking the events out of date order is only safe if a lane remembers
    // every stretch it holds, not just the last one.
    it("never drops a late arrival on top of an earlier day's bar", () => {
        const result = packAllDayLanes(
            [allDay("later", 3), allDay("earlier", 0)],
            dates,
            arrivedInOrder("later", "earlier")
        );

        expect(laneOf(result, "later")).toBe(0);
        expect(laneOf(result, "earlier")).toBe(0);

        const overlapping = packAllDayLanes(
            [allDay("later", 3), allDay("spanning", 0, 5)],
            dates,
            arrivedInOrder("later", "spanning")
        );

        expect(laneOf(overlapping, "later")).toBe(0);
        expect(laneOf(overlapping, "spanning")).toBe(1);
    });

    it("has no lanes when there is nothing to lay out", () => {
        expect(packAllDayLanes([], dates, () => 0)).toEqual({
            bars: [],
            laneCount: 0,
        });
        expect(packAllDayLanes(undefined, dates, () => 0).laneCount).toBe(0);
        expect(packAllDayLanes([allDay("x", 0)], [], () => 0).laneCount).toBe(
            0
        );
    });
});
