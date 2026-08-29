import { NeoEvent } from "../../types";
import { eventToRecurrenceState, recurrenceSummary } from "./recurrence";

export type RecurringEditChangeKey =
    | "title"
    | "date"
    | "dates"
    | "startTime"
    | "endTime"
    | "allDay"
    | "repeat"
    | "calendar"
    | "status"
    | "reminders"
    | "description";

export interface RecurringEditChange {
    key: RecurringEditChangeKey;
    label: string;
    before: string;
    after: string;
}

export interface RecurringEditChangeContext {
    previousCalendarId?: string | null;
    nextCalendarId?: string | null;
    previousCalendarLabel?: string;
    nextCalendarLabel?: string;
}

function recordOf(event: NeoEvent): Record<string, unknown> {
    return event as unknown as Record<string, unknown>;
}

function stringField(event: NeoEvent, key: string): string {
    const value = recordOf(event)[key];
    return typeof value === "string" ? value : "";
}

function startDateOf(event: NeoEvent): string {
    const record = recordOf(event);
    if (event.type === "recurring") {
        return typeof record.startRecur === "string" ? record.startRecur : "";
    }
    if (event.type === "rrule") {
        return typeof record.startDate === "string" ? record.startDate : "";
    }
    return typeof record.date === "string" ? record.date : "";
}

function endDateOf(event: NeoEvent): string {
    if (event.type !== "single" && event.type !== undefined) return "";
    return stringField(event, "endDate");
}

function shortText(value: string): string {
    const compact = value.replace(/\s+/g, " ").trim();
    if (!compact) return "Empty";
    return compact.length > 72 ? `${compact.slice(0, 69)}…` : compact;
}

function dateText(start: string, end: string): string {
    if (!start) return "None";
    return end && end !== start ? `${start} – ${end}` : start;
}

function statusText(event: NeoEvent): string {
    const record = recordOf(event);
    if (!Object.prototype.hasOwnProperty.call(record, "completed"))
        return "Event";
    if (record.completed === undefined || record.completed === null)
        return "Event";
    return typeof record.completed === "string" && record.completed
        ? "Done"
        : "To do";
}

function remindersText(event: NeoEvent): string {
    const value = recordOf(event).reminders;
    if (value === undefined) return "Default";
    if (!Array.isArray(value) || value.length === 0) return "None";
    return value
        .map((raw) => Number(raw))
        .filter((value) => Number.isFinite(value))
        .map((minutes) => {
            if (minutes === 0) return "At start of event";
            if (minutes % 1440 === 0) {
                const days = minutes / 1440;
                return `${days} day${days === 1 ? "" : "s"} before`;
            }
            if (minutes % 60 === 0) {
                const hours = minutes / 60;
                return `${hours} hour${hours === 1 ? "" : "s"} before`;
            }
            return `${minutes} min before`;
        })
        .join(", ");
}

function recurrenceState(event: NeoEvent) {
    return eventToRecurrenceState(event, startDateOf(event));
}

function recurrenceKey(event: NeoEvent): string {
    const state = recurrenceState(event);
    return JSON.stringify({
        isRecurring: state.isRecurring,
        recurrence: state.recurrence,
    });
}

function recurrenceText(event: NeoEvent): string {
    const state = recurrenceState(event);
    if (!state.isRecurring) return "Once";
    return recurrenceSummary(state.recurrence, startDateOf(event));
}

export function recurringEditChanges(
    stableEvent: NeoEvent,
    payload: NeoEvent,
    context: RecurringEditChangeContext = {}
): RecurringEditChange[] {
    const changes: RecurringEditChange[] = [];
    const add = (
        key: RecurringEditChangeKey,
        label: string,
        before: string,
        after: string
    ) => {
        if (before === after) return;
        changes.push({ key, label, before, after });
    };

    add(
        "title",
        "Title",
        shortText(stableEvent.title || ""),
        shortText(payload.title || "")
    );

    const beforeStart = startDateOf(stableEvent);
    const afterStart = startDateOf(payload);
    const beforeEnd = endDateOf(stableEvent);
    const afterEnd = endDateOf(payload);
    add(
        beforeEnd || afterEnd ? "dates" : "date",
        beforeEnd || afterEnd ? "Dates" : "Date",
        dateText(beforeStart, beforeEnd),
        dateText(afterStart, afterEnd)
    );

    add(
        "startTime",
        "Start time",
        stringField(stableEvent, "startTime") || "None",
        stringField(payload, "startTime") || "None"
    );
    add(
        "endTime",
        "End time",
        stringField(stableEvent, "endTime") || "None",
        stringField(payload, "endTime") || "None"
    );
    add(
        "allDay",
        "All day",
        stableEvent.allDay ? "On" : "Off",
        payload.allDay ? "On" : "Off"
    );

    if (recurrenceKey(stableEvent) !== recurrenceKey(payload)) {
        changes.push({
            key: "repeat",
            label: "Repeat",
            before: recurrenceText(stableEvent),
            after: recurrenceText(payload),
        });
    }

    if (
        context.previousCalendarId != null &&
        context.nextCalendarId != null &&
        context.previousCalendarId !== context.nextCalendarId
    ) {
        changes.push({
            key: "calendar",
            label: "Calendar",
            before: context.previousCalendarLabel || context.previousCalendarId,
            after: context.nextCalendarLabel || context.nextCalendarId,
        });
    }

    add("status", "Status", statusText(stableEvent), statusText(payload));
    add(
        "reminders",
        "Reminders",
        remindersText(stableEvent),
        remindersText(payload)
    );
    add(
        "description",
        "Description",
        shortText(stringField(stableEvent, "description")),
        shortText(stringField(payload, "description"))
    );

    return changes;
}
