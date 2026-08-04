import { TFile } from "obsidian";
import { EventPathLocation } from "../core/EventStore";
import { EventLocation, NeoEvent } from "../types";
import { Calendar } from "./Calendar";

/** An editable event always resolves to a concrete vault location. */
export type EditableEventResponse = [NeoEvent, EventLocation];

/**
 * A calendar backed by files the plugin may write to. Every vault mutation goes
 * through an `ObsidianInterface` held by the concrete subclass; this base only
 * fixes the editing contract plus the directory-ownership test used to route a
 * changed file to the calendar that owns it.
 */
export abstract class EditableCalendar extends Calendar {
    /** Root directory this calendar reads from and writes to. */
    abstract get directory(): string;

    /**
     * Whether a vault path belongs to this calendar. A plain prefix match on
     * the directory: note that a sibling like `Foo Bar` is considered inside
     * `Foo` — kept as-is for backward compatibility.
     */
    containsPath(path: string): boolean {
        return path.startsWith(this.directory);
    }

    abstract getEventsInFile(file: TFile): Promise<EditableEventResponse[]>;

    abstract createEvent(event: NeoEvent): Promise<EventLocation>;

    abstract modifyEvent(
        location: EventPathLocation,
        event: NeoEvent,
        updateCacheWithLocation: (loc: EventLocation) => void
    ): Promise<void>;

    abstract deleteEvent(location: EventPathLocation): Promise<void>;

    abstract move(
        fromLocation: EventPathLocation,
        toCalendar: EditableCalendar,
        updateCacheWithLocation: (loc: EventLocation) => void
    ): Promise<EventLocation | void>;
}
