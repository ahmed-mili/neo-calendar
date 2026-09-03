import { CalendarInfo } from "../types";
import { TaskStatus } from "./tasks";

/**
 * Types for the view layer, independent of any third-party calendar library.
 */

// ── Display Event ──────────────────────────────────────────

export interface DisplayEvent {
    id: string;
    title: string;
    start: Date;
    end: Date;
    allDay: boolean;
    color: string;
    editable: boolean;
    calendarId: string;
    calendarName: string;
    /** The ICS link this event was materialised by, when it was one — lets a
     *  view filter a single link's events out of the calendar they share. */
    icsFeedId?: string;
    // Tasks
    isTask: boolean;
    taskCompleted: boolean | string; // false | ISO date string
    taskStatus: TaskStatus; // "todo" | "complete"
    /** Minutes before the start to be reminded; absent means the setting decides. */
    reminders?: number[];
    // Recurrence
    isRecurring: boolean;
    rrule?: string;
    // The first occurrence of the series that has not been deleted, worked out
    // at display time. Deleting the occurrences a series began with moves it.
    isSeriesStart?: boolean;
    // Multi-day
    isMultiDay: boolean;
    description?: string;
    /** Où l'évènement se tient, tel qu'il est écrit dans son fichier. Une vue
     *  ne l'affiche pas — c'est le panneau qui le montre — mais un rappel le
     *  dit, et c'est la seule lecture qu'on fasse sans ouvrir l'application. */
    location?: string;
    // Plan C: someday events
    isSomeday: boolean;
    // True while this event is the one open in the side panel (selected).
    selected?: boolean;
    // Short-lived UI state used while a calendar fades in or out. Exiting
    // events stay mounted until their CSS animation reports completion.
    visibilityState?: "entering" | "exiting";
    // Set on the next-day portion of an event that crosses midnight: a
    // read-only visual continuation. `labelStart` carries the original start
    // time so the continuation still shows e.g. "23:00" (Notion-style).
    isContinuation?: boolean;
    labelStart?: Date;
}

// ── Calendar Source ─────────────────────────────────────────

export interface CalendarSource {
    id: string;
    name: string;
    color: string;
    editable: boolean;
    type: CalendarInfo["type"];
    /** Lucide icon name, for auto calendars — they carry their own. */
    icon?: string;
}

// ── View Type ──────────────────────────────────────────────

// "days" is the custom "Number of days" view (Notion-style): a timed grid over
// an arbitrary N-day span, N carried alongside in navigation state (dayCount).
export type ViewType = "day" | "week" | "month" | "list" | "3days" | "days";

// ── Callbacks ──────────────────────────────────────────────

export interface CalendarCallbacks {
    onEventClick: (eventId: string) => void;
    onEventDrag: (
        eventId: string,
        newStart: Date,
        newEnd: Date
    ) => Promise<boolean>;
    onEventResize: (eventId: string, newEnd: Date) => Promise<boolean>;
    onSelectRange: (start: Date, end: Date, allDay: boolean) => void;
    onContextMenu: (eventId: string, mouseEvent: MouseEvent) => void;
    onToggleTask: (eventId: string, isDone: boolean) => Promise<boolean>;
    onOpenFile: (eventId: string) => void;
}

// ── Calendar Props ─────────────────────────────────────────

export interface CalendarAppProps {
    cache: import("../core/EventCache").default;
    settings: import("../ui/settings").NeoCalendarSettings;
    plugin: import("../main").default;
    onEventClick: (id: string) => void;
    onSelectRange: (start: Date, end: Date, allDay: boolean) => void;
    onOpenFile: (id: string) => void;
    onDeleteEvent: (id: string) => Promise<void>;
    /** Delete several events as one undoable batch (multi-selection). */
    onDeleteEvents?: (ids: string[]) => Promise<void>;
    onToggleTask: (id: string, isDone: boolean) => Promise<boolean>;
    onContextMenu?: (eventId: string, mouseEvent: MouseEvent) => void;
}

// ── Event Position (computed for grid layout) ──────────────

export interface EventPosition {
    top: number; // px from top of grid
    height: number; // px
    left: number; // percentage 0-100
    width: number; // percentage 0-100
    column: number; // overlap column index
    totalColumns: number; // total overlap columns for this group
}
