import { CalendarInfo, EventLocation, NeoEvent } from "../types";

/**
 * One event as produced by a calendar: the normalized event paired with where
 * it lives, or `null` for read-only remote events that have no vault location.
 */
export type EventResponse = [NeoEvent, EventLocation | null];

/**
 * Base class for every event source. A calendar knows how to enumerate its
 * events, carries its display color, and exposes a stable identity derived from
 * its source kind and a source-specific identifier.
 */
export abstract class Calendar {
    constructor(public color: string) {}

    /** The source kind: "local" | "dailynote" | "ical" | "caldav" | … */
    abstract get type(): CalendarInfo["type"];

    /** A value uniquely identifying this source within its type (path, URL, …). */
    abstract get identifier(): string;

    /** Human-readable label for the calendar. */
    abstract get name(): string;

    /** Stable id, unique across all calendars: `<type>::<identifier>`. */
    get id(): string {
        return `${this.type}::${this.identifier}`;
    }

    /** Enumerate every event this calendar currently exposes. */
    abstract getEvents(): Promise<EventResponse[]>;
}
