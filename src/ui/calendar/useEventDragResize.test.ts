import { applyEventDrag, applyEventResize } from "./useEventDragResize";

/**
 * A stand-in for EventCache holding a single event, recording the calls the
 * drag makes so we can assert on what it touched.
 */
const makeCache = (event: any) => ({
    getEventById: jest.fn(() => event),
    getInfoForEditableEvent: jest.fn(() => ({ calendar: { id: "cal" } })),
    updateEventWithId: jest.fn(async () => true),
    addEvent: jest.fn(async (_calendarId: string, _event: any) => "new-id"),
    deleteEvent: jest.fn(async () => undefined),
    processEvent: jest.fn(
        async (_id: string, _transform: (e: any) => any) => true
    ),
});

const at = (iso: string) => new Date(iso);

describe("dragging one occurrence of a recurring series", () => {
    // deleteEvent() resolves an occurrence id back to its parent, so deleting
    // "<id>_<date>" erases the whole series from disk — every other occurrence
    // with it. Moving one occurrence must never do that.
    it("never deletes the series", async () => {
        const cache = makeCache({
            title: "Standup",
            type: "recurring",
            allDay: false,
            daysOfWeek: ["M", "W", "F"],
            skipDates: [],
            startTime: "08:00",
            endTime: "08:30",
        });

        await applyEventDrag(
            cache,
            "42_2026-07-29",
            at("2026-07-29T09:00:00"),
            at("2026-07-29T09:30:00")
        );

        expect(cache.deleteEvent).not.toHaveBeenCalled();
    });

    it("detaches the occurrence from a weekday series too", async () => {
        // `recurring` carries skipDates just like `rrule` does, so the moved
        // occurrence is written on its own and the series is told to skip it.
        const cache = makeCache({
            title: "Standup",
            type: "recurring",
            allDay: false,
            daysOfWeek: ["M", "W", "F"],
            skipDates: [],
            startTime: "08:00",
            endTime: "08:30",
        });

        const moved = await applyEventDrag(
            cache,
            "42_2026-07-29",
            at("2026-07-29T09:00:00"),
            at("2026-07-29T09:30:00")
        );

        expect(moved).toBe(true);
        expect(cache.addEvent).toHaveBeenCalled();
        expect(cache.deleteEvent).not.toHaveBeenCalled();
        const [, transform] = cache.processEvent.mock.calls[0];
        expect(transform({ skipDates: [] })).toEqual({
            skipDates: ["2026-07-29"],
        });
    });

    it("adds to the exception dates a series already had", async () => {
        const cache = makeCache({
            title: "Standup",
            type: "recurring",
            allDay: false,
            daysOfWeek: ["M", "W", "F"],
            skipDates: ["2026-07-22"],
            startTime: "08:00",
            endTime: "08:30",
        });

        await applyEventDrag(
            cache,
            "42_2026-07-29",
            at("2026-07-29T09:00:00"),
            at("2026-07-29T09:30:00")
        );

        const [, transform] = cache.processEvent.mock.calls[0];
        expect(transform({ skipDates: ["2026-07-22"] })).toEqual({
            skipDates: ["2026-07-22", "2026-07-29"],
        });
    });

    it("detaches the occurrence from an rrule series instead", async () => {
        const cache = makeCache({
            title: "Standup",
            type: "rrule",
            allDay: false,
            startDate: "2026-07-01",
            rrule: "FREQ=WEEKLY;BYDAY=WE",
            skipDates: [],
            startTime: "08:00",
            endTime: "08:30",
        });

        const moved = await applyEventDrag(
            cache,
            "42_2026-07-29",
            at("2026-07-29T09:00:00"),
            at("2026-07-29T09:30:00")
        );

        expect(moved).toBe(true);
        // The moved copy is written first: if adding the exception failed
        // afterwards the occurrence would show twice, which beats losing it.
        expect(cache.addEvent).toHaveBeenCalled();
        expect(cache.deleteEvent).not.toHaveBeenCalled();
        const [, transform] = cache.processEvent.mock.calls[0];
        expect(transform({ skipDates: [] })).toEqual({
            skipDates: ["2026-07-29"],
        });
    });

    // The preview follows the pointer while resizing, so releasing has to
    // commit what it showed — silently doing nothing is the same broken
    // promise as a drop that snaps back.
    it("commits a resize of an rrule occurrence", async () => {
        const cache = makeCache({
            title: "Standup",
            type: "rrule",
            allDay: false,
            startDate: "2026-07-01",
            rrule: "FREQ=WEEKLY;BYDAY=WE",
            skipDates: [],
            startTime: "08:00",
            endTime: "08:30",
        });

        const resized = await applyEventResize(
            cache,
            "42_2026-07-29",
            at("2026-07-29T08:00:00"),
            at("2026-07-29T09:30:00")
        );

        expect(resized).toBe(true);
        expect(cache.addEvent).toHaveBeenCalled();
        expect(cache.deleteEvent).not.toHaveBeenCalled();
        const [, event] = cache.addEvent.mock.calls[0];
        expect(event.startTime).toBe("08:00");
        expect(event.endTime).toBe("09:30");
    });

    it("never deletes the series when resizing", async () => {
        const cache = makeCache({
            title: "Standup",
            type: "recurring",
            allDay: false,
            daysOfWeek: ["W"],
            startTime: "08:00",
            endTime: "08:30",
        });

        await applyEventResize(
            cache,
            "42_2026-07-29",
            at("2026-07-29T08:00:00"),
            at("2026-07-29T09:30:00")
        );

        expect(cache.deleteEvent).not.toHaveBeenCalled();
    });

    it("leaves a plain single event's move untouched", async () => {
        const cache = makeCache({
            title: "One-off",
            type: "single",
            allDay: false,
            date: "2026-07-29",
            startTime: "08:00",
            endTime: "08:30",
        });

        await applyEventDrag(
            cache,
            "42",
            at("2026-07-29T09:00:00"),
            at("2026-07-29T09:30:00")
        );

        expect(cache.updateEventWithId).toHaveBeenCalled();
        expect(cache.deleteEvent).not.toHaveBeenCalled();
    });
});
