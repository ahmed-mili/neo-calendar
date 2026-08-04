import EventCache from "../../core/EventCache";
import { resolveCalendarInfo } from "./EventPanel";

/**
 * A read-only calendar (holidays, an .ics feed) plus an editable one, in the
 * order the cache would hold them.
 */
const holidays = {
    id: "holidays::FR",
    name: "Jours fériés et autres fêtes en France",
    color: "#4a9d5f",
    type: "holidays",
};
const local = {
    id: "local::Calendars/Développement",
    name: "Développement",
    color: "#7c5cff",
    type: "local",
};

const cache = {
    calendars: new Map([
        [local.id, local],
        [holidays.id, holidays],
    ]),
    getEventDetails: (id: string) =>
        id === "fr-holiday-2026-08-15-l-assomption"
            ? { calendarId: holidays.id, event: {} }
            : id === "42"
            ? { calendarId: local.id, event: {} }
            : null,
    getCalendarById: (id: string) =>
        id === holidays.id ? holidays : id === local.id ? local : undefined,
    isEventEditable: (id: string) => id === "42",
} as unknown as EventCache;

describe("resolveCalendarInfo", () => {
    it("names the calendar a read-only event actually belongs to", () => {
        expect(
            resolveCalendarInfo(
                cache,
                "fr-holiday-2026-08-15-l-assomption",
                false,
                local.id
            )
        ).toEqual({
            name: holidays.name,
            color: holidays.color,
            editable: false,
            currentId: holidays.id,
        });
    });

    it("resolves an editable event to its own calendar", () => {
        expect(resolveCalendarInfo(cache, "42", false, local.id)).toEqual({
            name: local.name,
            color: local.color,
            editable: true,
            currentId: local.id,
        });
    });

    it("falls back to the default calendar for an unknown event", () => {
        const info = resolveCalendarInfo(cache, "nope", false, local.id);
        expect(info.editable).toBe(false);
        expect(info.currentId).toBe(local.id);
    });
});
