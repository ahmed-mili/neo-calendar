import {
    allDayBandRows,
    hiddenBarCountByDay,
    packAllDayLanes,
    visibleLaneCount,
} from "./useAllDayLanes";
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

describe("visibleLaneCount", () => {
    // Sept jours visibles encadrés par trois jours tampons, comme TimeGrid.
    const BUFFER = 3;
    const extended = Array.from(
        { length: BUFFER * 2 + 7 },
        (_, i) => new Date(2026, 8, 4 + i)
    );
    const FIRST = BUFFER;
    const LAST = BUFFER + 6;

    /** Évènement d'un jour posé à l'index donné DANS extended. */
    function atIdx(id: string, idx: number, days = 1): DisplayEvent {
        const start = extended[idx];
        return {
            id,
            title: id,
            start,
            end: new Date(start.getTime() + days * DAY),
            allDay: true,
            color: "#888",
        } as DisplayEvent;
    }

    it("ignore une barre qui n'est que dans le tampon", () => {
        const ghost = atIdx("fantome", 0); // jour tampon de gauche
        const seen = atIdx("visible", 0, 5); // tampon → premier jour visible
        const result = packAllDayLanes(
            [ghost, seen],
            extended,
            arrivedInOrder("fantome", "visible")
        );

        // Le packing reste inchangé : chaque barre garde sa lane.
        expect(laneOf(result, "fantome")).toBe(0);
        expect(laneOf(result, "visible")).toBe(1);
        expect(result.laneCount).toBe(2);

        // Mais la hauteur ne compte que ce qui touche la fenêtre visible.
        expect(visibleLaneCount(result.bars, FIRST, LAST)).toBe(2);
        // …et la barre fantôme seule ne fait grandir la bande de personne.
        const alone = packAllDayLanes([ghost], extended, () => 0);
        expect(alone.laneCount).toBe(1);
        expect(visibleLaneCount(alone.bars, FIRST, LAST)).toBe(0);
    });

    it("n'ajoute pas de rangée pour un empilement hors écran", () => {
        const bars = [
            atIdx("tampon-a", 1),
            atIdx("tampon-b", 1),
            atIdx("ecran", FIRST + 2),
        ];
        const result = packAllDayLanes(
            bars,
            extended,
            arrivedInOrder("tampon-a", "tampon-b", "ecran")
        );

        expect(result.laneCount).toBe(2);
        expect(laneOf(result, "ecran")).toBe(0);
        expect(visibleLaneCount(result.bars, FIRST, LAST)).toBe(1);
    });

    // Une barre laissée en lane 1 alors que la lane 0 est vide à l'écran est
    // dessinée sur la deuxième rangée : elle doit exister.
    it("garde les rangées sous une barre visible restée en lane haute", () => {
        const result = packAllDayLanes(
            [atIdx("tampon", 0, 4), atIdx("decale", FIRST, 1)],
            extended,
            arrivedInOrder("tampon", "decale")
        );

        expect(laneOf(result, "decale")).toBe(1);
        expect(visibleLaneCount(result.bars, FIRST, LAST)).toBe(2);
    });

    it("ne compte rien quand la bande est vide", () => {
        expect(visibleLaneCount([], FIRST, LAST)).toBe(0);
    });
});

describe("allDayBandRows", () => {
    const rows = (
        laneCount: number,
        draftLane: number | null = null,
        collapsed = false
    ) => allDayBandRows({ laneCount, draftLane, collapsed, maxRows: 4 });

    // The day that already held three events was the one day nothing could be
    // added to: the band was exactly as tall as its bars, so there was no empty
    // background left to tap.
    it("keeps one empty row under the events", () => {
        expect(rows(3)).toEqual({ contentRows: 4, visibleRows: 4 });
        expect(rows(1)).toEqual({ contentRows: 2, visibleRows: 2 });
    });

    it("still shows a single row when the band holds nothing", () => {
        expect(rows(0)).toEqual({ contentRows: 1, visibleRows: 1 });
    });

    // Naming an event must not take away the way another one is added.
    it("keeps the empty row while a draft is being named", () => {
        expect(rows(1, 1).contentRows).toBe(3);
        // A draft on an empty day still leaves a row under it.
        expect(rows(0, 0).contentRows).toBe(2);
    });

    it("stops growing at the cap and scrolls instead", () => {
        expect(rows(5)).toEqual({ contentRows: 6, visibleRows: 4 });
    });

    it("shows one row collapsed, whatever it holds", () => {
        expect(rows(3, null, true)).toEqual({ contentRows: 4, visibleRows: 1 });
    });
});

describe("hiddenBarCountByDay", () => {
    const pack = (events: DisplayEvent[], ...order: string[]) =>
        packAllDayLanes(events, dates, arrivedInOrder(...order)).bars;

    it("ne compte rien quand tout tient dans la rangée visible", () => {
        const bars = pack([allDay("a", 1), allDay("b", 3)], "a", "b");
        expect(hiddenBarCountByDay(bars, 0, 4, 1).size).toBe(0);
    });

    // Le compte est le TOTAL du jour, pas seulement ce qui est caché : "1
    // évènement" à côté d'une barre déjà visible laisserait croire qu'il n'y
    // en a qu'un, quand il y en a deux.
    it("compte le total du jour, pas seulement l'évènement caché", () => {
        const bars = pack([allDay("a", 1), allDay("b", 1)], "a", "b");
        expect([...hiddenBarCountByDay(bars, 0, 4, 1)]).toEqual([[1, 2]]);
    });

    it("compte tous les évènements du jour au-delà de la rangée visible", () => {
        const bars = pack(
            [allDay("a", 2), allDay("b", 2), allDay("c", 2), allDay("d", 2)],
            "a",
            "b",
            "c",
            "d"
        );
        expect(hiddenBarCountByDay(bars, 0, 4, 1).get(2)).toBe(4);
    });

    // Une barre pluri-jours cachée manque dans chacune des colonnes qu'elle
    // traverse, pas seulement dans celle où elle commence.
    it("compte une barre pluri-jours sur chacun de ses jours", () => {
        const bars = pack(
            [allDay("socle", 1, 4), allDay("longue", 1, 3)],
            "socle",
            "longue"
        );
        const counts = hiddenBarCountByDay(bars, 0, 4, 1);
        expect([...counts].sort()).toEqual([
            [1, 2],
            [2, 2],
            [3, 2],
        ]);
    });

    // Les jours tampons ne sont pas à l'écran : une pastille posée sur eux
    // annoncerait une colonne que personne ne voit.
    it("ignore les jours hors de la fenêtre visible", () => {
        const bars = pack([allDay("a", 0), allDay("b", 0)], "a", "b");
        expect(hiddenBarCountByDay(bars, 1, 4, 1).size).toBe(0);
    });

    it("suit le nombre de rangées visibles quand il est plus grand", () => {
        const bars = pack(
            [allDay("a", 1), allDay("b", 1), allDay("c", 1)],
            "a",
            "b",
            "c"
        );
        expect(hiddenBarCountByDay(bars, 0, 4, 2).get(1)).toBe(3);
    });
});
