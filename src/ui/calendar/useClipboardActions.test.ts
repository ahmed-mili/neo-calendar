import { eventToPaste, cutMayDeleteSource } from "./useClipboardActions";
import { NeoEvent } from "../../types";

const series = {
    title: "Standup",
    type: "recurring",
    allDay: false,
    daysOfWeek: ["M", "W", "F"],
    startRecur: "2026-07-01",
    startTime: "08:00",
    endTime: "08:30",
} as unknown as NeoEvent;

const oneOff = {
    title: "One-off",
    type: "single",
    allDay: false,
    date: "2026-07-29",
    startTime: "08:00",
    endTime: "08:30",
} as unknown as NeoEvent;

describe("pasting an event", () => {
    it("lands a series as a one-off, without the series keys", () => {
        const pasted = eventToPaste(series);

        expect(pasted.type).toBe("single");
        expect(pasted.daysOfWeek).toBeUndefined();
        expect(pasted.startRecur).toBeUndefined();
        // The times survive: only the recurrence is dropped.
        expect(pasted.startTime).toBe("08:00");
        expect(pasted.endTime).toBe("08:30");
    });

    it("keeps a one-off as it was", () => {
        const pasted = eventToPaste(oneOff);

        expect(pasted.type).toBe("single");
        expect(pasted.startTime).toBe("08:00");
    });
});

describe("cutting an event", () => {
    // deleteEvent() resolves an occurrence id back to its parent, so removing
    // the source of a cut occurrence would erase the whole series from disk.
    it("refuses to delete the source when it is one occurrence of a series", () => {
        expect(cutMayDeleteSource(series, "42_2026-07-29")).toBe(false);
    });

    it("refuses to delete a series addressed directly", () => {
        expect(cutMayDeleteSource(series, "42")).toBe(false);
    });

    it("still removes a genuine one-off", () => {
        expect(cutMayDeleteSource(oneOff, "42")).toBe(true);
    });
});
