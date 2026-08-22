import type { TFile } from "obsidian";
import type EventCache from "../../../../src/core/EventCache";
import type { EventPathLocation } from "../../../../src/core/EventStore";
import {
    Calendar,
    type EventResponse,
} from "../../../../src/calendars/Calendar";
import { EditableCalendar } from "../../../../src/calendars/EditableCalendar";
import type { EditableEventResponse } from "../../../../src/calendars/EditableCalendar";
import type {
    CalendarInfo,
    EventLocation,
    NeoEvent,
} from "../../../../src/types";
import {
    DesktopStoredEvent,
    findStoredEvent,
    resolveStoredEventId,
} from "./desktopEventFormat";

export type DesktopCalendarType = "local" | "ical" | "auto";

export interface DesktopCalendarModel {
    id: string;
    /** Local folder path, or the stable source id for read-only calendars. */
    relativePath: string;
    name: string;
    color: string;
    editable: boolean;
    type: DesktopCalendarType;
    icon?: string;
}

export interface DesktopCacheController {
    getRecords: () => DesktopStoredEvent[];
    getCalendars: () => DesktopCalendarModel[];
    addEvent: (calendarId: string, event: NeoEvent) => Promise<string>;
    updateEvent: (
        eventId: string,
        event: NeoEvent,
        targetCalendarId?: string
    ) => Promise<boolean>;
    deleteEvent: (eventId: string) => Promise<void>;
}

class DesktopEditableCalendar extends EditableCalendar {
    constructor(
        private model: DesktopCalendarModel,
        private controller: DesktopCacheController
    ) {
        super(model.color);
    }

    updateModel(model: DesktopCalendarModel): void {
        this.model = model;
        this.color = model.color;
    }

    get directory(): string {
        return this.model.relativePath;
    }

    get type(): "local" {
        return "local";
    }

    get identifier(): string {
        return this.model.relativePath || ".";
    }

    get name(): string {
        return this.model.name;
    }

    async getEventsInFile(_file: TFile): Promise<EditableEventResponse[]> {
        return [];
    }

    async getEvents(): Promise<EditableEventResponse[]> {
        return this.controller
            .getRecords()
            .filter(
                (record) =>
                    record.calendarId === this.model.id && !record.readOnly
            )
            .map(
                (record): EditableEventResponse => [
                    record.event,
                    {
                        file: { path: record.relativePath },
                        lineNumber: undefined,
                    },
                ]
            );
    }

    async createEvent(event: NeoEvent): Promise<EventLocation> {
        const id = await this.controller.addEvent(this.model.id, event);
        const record = findStoredEvent(this.controller.getRecords(), id);
        return {
            file: { path: record?.relativePath ?? id },
            lineNumber: undefined,
        };
    }

    async modifyEvent(
        location: EventPathLocation,
        event: NeoEvent,
        updateCacheWithLocation: (location: EventLocation) => void
    ): Promise<void> {
        const record = this.controller
            .getRecords()
            .find(
                (candidate) =>
                    !candidate.readOnly &&
                    candidate.relativePath === location.path
            );
        if (!record) throw new Error("Event does not exist or is read-only.");
        await this.controller.updateEvent(record.id, event, this.model.id);
        const updated = findStoredEvent(
            this.controller.getRecords(),
            record.id
        );
        updateCacheWithLocation({
            file: { path: updated?.relativePath ?? location.path },
            lineNumber: undefined,
        });
    }

    async deleteEvent(location: EventPathLocation): Promise<void> {
        const record = this.controller
            .getRecords()
            .find(
                (candidate) =>
                    !candidate.readOnly &&
                    candidate.relativePath === location.path
            );
        if (record) await this.controller.deleteEvent(record.id);
    }

    async move(
        fromLocation: EventPathLocation,
        toCalendar: EditableCalendar,
        updateCacheWithLocation: (location: EventLocation) => void
    ): Promise<EventLocation | void> {
        const record = this.controller
            .getRecords()
            .find(
                (candidate) =>
                    !candidate.readOnly &&
                    candidate.relativePath === fromLocation.path
            );
        if (!record) throw new Error("Event does not exist or is read-only.");
        await this.controller.updateEvent(
            idOf(record),
            record.event,
            toCalendar.id
        );
        const updated = findStoredEvent(
            this.controller.getRecords(),
            record.id
        );
        const location = {
            file: { path: updated?.relativePath ?? fromLocation.path },
            lineNumber: undefined,
        };
        updateCacheWithLocation(location);
        return location;
    }
}

function idOf(record: DesktopStoredEvent): string {
    return record.id;
}

class DesktopReadonlyCalendar extends Calendar {
    constructor(
        private model: DesktopCalendarModel,
        private controller: DesktopCacheController
    ) {
        super(model.color);
    }

    updateModel(model: DesktopCalendarModel): void {
        this.model = model;
        this.color = model.color;
    }

    get type(): CalendarInfo["type"] {
        return this.model.type;
    }

    get identifier(): string {
        const prefix = `${this.model.type}::`;
        return this.model.id.startsWith(prefix)
            ? this.model.id.slice(prefix.length)
            : this.model.id;
    }

    get name(): string {
        return this.model.name;
    }

    get icon(): string | undefined {
        return this.model.icon;
    }

    async getEvents(): Promise<EventResponse[]> {
        return this.controller
            .getRecords()
            .filter((record) => record.calendarId === this.model.id)
            .map((record): EventResponse => [record.event, null]);
    }
}

/**
 * EventCache-compatible facade used by the shared EventPanel and drag logic.
 * Editable local calendars delegate disk operations to Tauri; auto and ICS
 * calendars are represented by read-only Calendar instances.
 */
export class DesktopEventCacheFacade {
    calendars = new Map<string, Calendar>();

    constructor(private controller: DesktopCacheController) {
        this.syncCalendars();
    }

    syncCalendars(): void {
        const current = new Set<string>();
        for (const model of this.controller.getCalendars()) {
            current.add(model.id);
            const existing = this.calendars.get(model.id);
            if (model.editable) {
                if (existing instanceof DesktopEditableCalendar) {
                    existing.updateModel(model);
                } else {
                    this.calendars.set(
                        model.id,
                        new DesktopEditableCalendar(model, this.controller)
                    );
                }
            } else if (existing instanceof DesktopReadonlyCalendar) {
                existing.updateModel(model);
            } else {
                this.calendars.set(
                    model.id,
                    new DesktopReadonlyCalendar(model, this.controller)
                );
            }
        }
        for (const id of this.calendars.keys()) {
            if (!current.has(id)) this.calendars.delete(id);
        }
    }

    private resolve(id: string): string | null {
        return resolveStoredEventId(this.controller.getRecords(), id);
    }

    getEventById(id: string): NeoEvent | null {
        return findStoredEvent(this.controller.getRecords(), id)?.event ?? null;
    }

    getEventDetails(
        id: string
    ): { id: string; calendarId: string; event: NeoEvent } | null {
        const resolved = this.resolve(id);
        if (!resolved) return null;
        const record = this.controller
            .getRecords()
            .find((candidate) => candidate.id === resolved);
        return record
            ? {
                  id: resolved,
                  calendarId: record.calendarId,
                  event: record.event,
              }
            : null;
    }

    getCalendarById(id: string): Calendar | undefined {
        return this.calendars.get(id);
    }

    isEventEditable(id: string): boolean {
        const record = findStoredEvent(this.controller.getRecords(), id);
        if (!record || record.readOnly) return false;
        return this.controller
            .getCalendars()
            .some(
                (calendar) =>
                    calendar.id === record.calendarId && calendar.editable
            );
    }

    getInfoForEditableEvent(id: string): {
        calendar: EditableCalendar;
        location: EventLocation;
    } {
        const record = findStoredEvent(this.controller.getRecords(), id);
        if (!record || record.readOnly) {
            throw new Error(`Event ID ${id} is read-only or is not present.`);
        }
        const calendar = this.calendars.get(record.calendarId);
        if (!(calendar instanceof EditableCalendar)) {
            throw new Error(
                "The event calendar is read-only or no longer exists."
            );
        }
        return {
            calendar,
            location: {
                file: { path: record.relativePath },
                lineNumber: undefined,
            },
        };
    }

    async addEvent(calendarId: string, event: NeoEvent): Promise<string> {
        return this.controller.addEvent(calendarId, event);
    }

    async updateEventWithId(id: string, event: NeoEvent): Promise<boolean> {
        if (!this.isEventEditable(id)) return false;
        return this.controller.updateEvent(id, event);
    }

    async deleteEvent(id: string): Promise<void> {
        if (!this.isEventEditable(id)) return;
        await this.controller.deleteEvent(id);
    }

    async moveEventToCalendar(id: string, calendarId: string): Promise<void> {
        const record = findStoredEvent(this.controller.getRecords(), id);
        if (!record || record.readOnly) return;
        await this.controller.updateEvent(id, record.event, calendarId);
    }

    async processEvent(
        id: string,
        process: (event: NeoEvent) => NeoEvent
    ): Promise<boolean> {
        const event = this.getEventById(id);
        if (!event || !this.isEventEditable(id)) return false;
        return this.updateEventWithId(id, process(event));
    }

    asEventCache(): EventCache {
        return this as unknown as EventCache;
    }
}
