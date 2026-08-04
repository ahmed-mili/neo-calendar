import { CalendarInfo, NeoEvent } from "src/types";
import { Calendar, EventResponse } from "./Calendar";
import { HolidayRule, expandRules } from "./auto/rules";

/**
 * How far the generated window reaches around the current year. Recomputed on
 * every plugin start, so the window follows the calendar forward on its own.
 */
const YEARS_BEHIND = 5;
const YEARS_AHEAD = 10;

/** ASCII, collision-free id fragment: two feasts can share a date. */
const slug = (name: string): string =>
    name
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
        .toLowerCase();

/**
 * A read-only calendar computed from rules rather than fetched: public
 * holidays, observances, anything that recurs on a describable schedule. The
 * rules travel with the calendar in data.json, so a calendar added from a
 * country preset, written by hand, or generated later on stays self-contained —
 * no network, nothing written to the vault, right for any year.
 */
export default class AutoCalendar extends Calendar {
    constructor(
        color: string,
        private autoId: string,
        private displayName: string,
        readonly icon: string,
        private rules: HolidayRule[],
        private currentYear: number
    ) {
        super(color);
    }

    get type(): CalendarInfo["type"] {
        return "auto";
    }

    get identifier(): string {
        return this.autoId;
    }

    get name(): string {
        return this.displayName;
    }

    async getEvents(): Promise<EventResponse[]> {
        const holidays = expandRules(
            this.rules,
            this.currentYear - YEARS_BEHIND,
            this.currentYear + YEARS_AHEAD
        );
        // Names outside the Latin alphabet slug to nothing, so two feasts on one
        // date would collide; a per-date counter keeps every id distinct.
        const used = new Map<string, number>();
        return holidays.map(({ date, name }) => {
            const base = `auto-${this.autoId}-${date}-${slug(name)}`;
            const seen = used.get(base) ?? 0;
            used.set(base, seen + 1);
            const event: NeoEvent = {
                title: name,
                id: seen === 0 ? base : `${base}-${seen}`,
                type: "single",
                date,
                endDate: null,
                allDay: true,
            };
            // Nothing backs these events on disk, hence the null location.
            return [event, null];
        });
    }
}
