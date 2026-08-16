import {
    clearOccurrenceDescription,
    isDescriptionSynced,
    occurrenceDateOf,
    occurrenceDescription,
    readOccurrenceDescriptions,
    setOccurrenceDescription,
} from "./occurrenceDescription";
import { NeoEvent } from "../../types";

const series = (occurrenceDescriptions?: string[]): NeoEvent =>
    ({
        title: "Standup",
        type: "recurring",
        allDay: false,
        daysOfWeek: ["W"],
        startTime: "08:00",
        endTime: "08:30",
        skipDates: [],
        description: "Tour de table",
        occurrenceDescriptions,
    } as unknown as NeoEvent);

describe("occurrenceDateOf", () => {
    it("reads the day an occurrence was opened on", () => {
        expect(occurrenceDateOf("42_2026-08-16")).toBe("2026-08-16");
        expect(occurrenceDateOf("path:Perso/(Every W) Standup.md")).toBeNull();
        expect(occurrenceDateOf(null)).toBeNull();
    });
});

describe("readOccurrenceDescriptions", () => {
    it("splits a line into its day and its text", () => {
        const read = readOccurrenceDescriptions([
            "2026-08-16 Apporter les clés",
            "2026-08-23 Deux lignes\nla seconde",
        ]);

        expect(read.get("2026-08-16")).toBe("Apporter les clés");
        expect(read.get("2026-08-23")).toBe("Deux lignes\nla seconde");
    });

    // A day with nothing after it was emptied on purpose. That is not the same
    // as a day that never left the series, and it must not be read as one.
    it("keeps a deliberately empty day", () => {
        expect(
            readOccurrenceDescriptions(["2026-08-16"]).get("2026-08-16")
        ).toBe("");
    });

    // A note edited by hand must never be able to blank a description.
    it("ignores a line that names no day", () => {
        expect(readOccurrenceDescriptions(["Apporter les clés"]).size).toBe(0);
    });
});

describe("occurrenceDescription", () => {
    it("gives a day its own text", () => {
        expect(
            occurrenceDescription(series(["2026-08-19 Démo"]), "2026-08-19")
        ).toBe("Démo");
    });

    it("gives null where the day still follows the series", () => {
        expect(
            occurrenceDescription(series(["2026-08-19 Démo"]), "2026-08-26")
        ).toBeNull();
        expect(occurrenceDescription(series(), "2026-08-19")).toBeNull();
    });

    // A single event has one description and nothing to share it with.
    it("gives null on anything that is not a series", () => {
        const single = {
            title: "Vol",
            type: "single",
            date: "2026-08-19",
            allDay: true,
            description: "Porte 12",
        } as unknown as NeoEvent;

        expect(occurrenceDescription(single, "2026-08-19")).toBeNull();
    });
});

describe("isDescriptionSynced", () => {
    it("is true until the day writes its own", () => {
        expect(isDescriptionSynced(series(), "2026-08-19")).toBe(true);
        expect(
            isDescriptionSynced(series(["2026-08-19 Démo"]), "2026-08-19")
        ).toBe(false);
        // Emptied on purpose is still the day's own.
        expect(isDescriptionSynced(series(["2026-08-19"]), "2026-08-19")).toBe(
            false
        );
    });
});

describe("setOccurrenceDescription", () => {
    it("adds a day, in date order", () => {
        expect(
            setOccurrenceDescription(["2026-08-26 Rétro"], "2026-08-19", "Démo")
        ).toEqual(["2026-08-19 Démo", "2026-08-26 Rétro"]);
    });

    it("replaces the text a day already had", () => {
        expect(
            setOccurrenceDescription(["2026-08-19 Démo"], "2026-08-19", "Bilan")
        ).toEqual(["2026-08-19 Bilan"]);
    });

    it("writes an emptied day as the day alone", () => {
        expect(
            setOccurrenceDescription(["2026-08-19 Démo"], "2026-08-19", "")
        ).toEqual(["2026-08-19"]);
    });
});

describe("clearOccurrenceDescription", () => {
    it("hands a day back to the series", () => {
        expect(
            clearOccurrenceDescription(
                ["2026-08-19 Démo", "2026-08-26 Rétro"],
                "2026-08-19"
            )
        ).toEqual(["2026-08-26 Rétro"]);
    });

    // The key goes with the last line, rather than staying behind as an empty
    // pair of brackets in the note.
    it("drops the list once its last day is cleared", () => {
        expect(
            clearOccurrenceDescription(["2026-08-19 Démo"], "2026-08-19")
        ).toBeUndefined();
        expect(
            clearOccurrenceDescription(undefined, "2026-08-19")
        ).toBeUndefined();
    });

    it("leaves the list alone when the day is not in it", () => {
        expect(
            clearOccurrenceDescription(["2026-08-19 Démo"], "2026-08-26")
        ).toEqual(["2026-08-19 Démo"]);
    });
});
