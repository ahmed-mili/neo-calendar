import { useState, useEffect, useRef, useCallback } from "react";
import { DateTime } from "luxon";
import { NeoEvent } from "../../types";
import { getTaskStatus, TaskStatus } from "../tasks";
import type { DraftInfo } from "./EventPanel";
import {
    RecurrenceState,
    defaultRecurrence,
    eventToRecurrenceState,
    recurrenceToEventFields,
} from "./recurrence";

interface EditableCalendarRef {
    id: string;
    name: string;
    type: string;
}

interface Args {
    eventId: string | null;
    event: NeoEvent | null;
    draft: DraftInfo | null;
    editableCalendars: EditableCalendarRef[];
    currentCalendarId: string;
}

function toISOTime(d: Date): string {
    return (
        DateTime.fromJSDate(d).toISOTime({
            includeOffset: false,
            suppressMilliseconds: true,
            suppressSeconds: true,
            includePrefix: false,
        }) || ""
    );
}

export function useEventFormState({
    eventId,
    event,
    draft,
    editableCalendars,
    currentCalendarId,
}: Args) {
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [date, setDate] = useState("");
    const [endDate, setEndDate] = useState<string | undefined>(undefined);
    const [startTime, setStartTime] = useState("");
    const [endTime, setEndTime] = useState("");
    const [allDay, setAllDay] = useState(false);
    const [isRecurring, setIsRecurring] = useState(false);
    const [recurrence, setRecurrence] = useState<RecurrenceState>(
        defaultRecurrence(new Date().toISOString().slice(0, 10))
    );
    const [calendarIndex, setCalendarIndex] = useState(0);
    const [taskStatus, setTaskStatus] = useState<TaskStatus | null>(null);

    const lastKeyRef = useRef<string | null>(null);
    // Tracks the event's last-seen PERSISTED task status, so the sync effect
    // below can tell a real external change (checkbox on the block, undo, edit)
    // from our own optimistic toggle echoing back through the cache.
    const prevPersistedStatusRef = useRef<TaskStatus | null>(null);

    useEffect(() => {
        const key = eventId || (draft ? "__draft__" : null);
        if (key === lastKeyRef.current) return;

        if (event) {
            setTitle(event.title);
            setDescription(event.description || "");
            setAllDay(!!event.allDay);

            if (event.type === "single" || event.type === undefined) {
                setDate(event.date || "");
                setEndDate(event.endDate ?? undefined);
                setStartTime(!event.allDay ? event.startTime || "" : "");
                setEndTime(!event.allDay ? event.endTime || "" : "");
                const r = eventToRecurrenceState(event, event.date || "");
                setIsRecurring(r.isRecurring);
                setRecurrence(r.recurrence);
                setTaskStatus(getTaskStatus(event));
            } else if (event.type === "recurring") {
                setDate(event.startRecur || "");
                setStartTime(!event.allDay ? event.startTime || "" : "");
                setEndTime(!event.allDay ? event.endTime || "" : "");
                const r = eventToRecurrenceState(event, event.startRecur || "");
                setIsRecurring(r.isRecurring);
                setRecurrence(r.recurrence);
                setTaskStatus(null);
            } else if (event.type === "rrule") {
                setDate(event.startDate || "");
                setStartTime(!event.allDay ? event.startTime || "" : "");
                setEndTime(!event.allDay ? event.endTime || "" : "");
                const r = eventToRecurrenceState(event, event.startDate || "");
                setIsRecurring(r.isRecurring);
                setRecurrence(r.recurrence);
                setTaskStatus(null);
            } else {
                setDate("");
                setEndDate(undefined);
                setStartTime("");
                setEndTime("");
                setIsRecurring(false);
                setRecurrence(
                    defaultRecurrence(new Date().toISOString().slice(0, 10))
                );
                setTaskStatus(getTaskStatus(event));
            }

            const idx = editableCalendars.findIndex(
                (c) => c.id === currentCalendarId
            );
            setCalendarIndex(idx >= 0 ? idx : 0);
        } else if (draft) {
            const startDate = DateTime.fromJSDate(draft.start).toISODate()!;
            setTitle("");
            setDescription("");
            setDate(startDate);
            setAllDay(draft.allDay);
            setStartTime(draft.allDay ? "" : toISOTime(draft.start));
            setEndTime(draft.allDay ? "" : toISOTime(draft.end));

            const endStr = draft.allDay
                ? DateTime.fromJSDate(draft.end).minus({ days: 1 }).toISODate()
                : DateTime.fromJSDate(draft.end).toISODate();
            setEndDate(endStr && endStr !== startDate ? endStr : undefined);

            setIsRecurring(false);
            setRecurrence(defaultRecurrence(startDate));
            setTaskStatus(draft.defaultAsTask ? "todo" : null);

            const idx = editableCalendars.findIndex(
                (c) => c.id === currentCalendarId
            );
            setCalendarIndex(idx >= 0 ? idx : 0);
        } else {
            setTitle("");
            setDescription("");
            setDate("");
            setStartTime("");
            setEndTime("");
            setAllDay(false);
            setIsRecurring(false);
            setRecurrence(
                defaultRecurrence(new Date().toISOString().slice(0, 10))
            );
            setTaskStatus(null);
        }

        lastKeyRef.current = key;
        prevPersistedStatusRef.current = event ? getTaskStatus(event) : null;
    }, [eventId, event, draft]);

    // Keep the status pill in sync with the event's PERSISTED status while the
    // panel stays open (same eventId) — e.g. toggling the checkbox on the
    // calendar block, an undo, or an external edit. The key-gated reset effect
    // above only runs on eventId change, so without this the pill would show a
    // stale state. We adopt the persisted value ONLY when it actually
    // transitions (tracked via the ref), so our own optimistic toggle isn't
    // clobbered mid-autosave: when our debounced write lands, the persisted
    // value transitions to what we already set, making this a no-op.
    useEffect(() => {
        if (!event) return;
        const persisted = getTaskStatus(event);
        if (persisted !== prevPersistedStatusRef.current) {
            prevPersistedStatusRef.current = persisted;
            setTaskStatus(persisted);
        }
    }, [event]);

    const buildPayload = useCallback((): NeoEvent => {
        return {
            title,
            ...(allDay
                ? { allDay: true }
                : { allDay: false, startTime: startTime || "", endTime }),
            ...(isRecurring
                ? recurrenceToEventFields(recurrence, date || "")
                : date
                ? {
                      type: "single",
                      date,
                      endDate: endDate || null,
                      completed:
                          taskStatus === "complete"
                              ? DateTime.now().toISO()
                              : false,
                  }
                : {
                      type: "someday",
                      completed:
                          taskStatus === "complete"
                              ? DateTime.now().toISO()
                              : taskStatus === "todo"
                              ? false
                              : undefined,
                  }),
            ...(description ? { description } : {}),
        } as NeoEvent;
    }, [
        title,
        allDay,
        startTime,
        endTime,
        isRecurring,
        recurrence,
        date,
        endDate,
        taskStatus,
        description,
    ]);

    return {
        title,
        setTitle,
        description,
        setDescription,
        date,
        setDate,
        endDate,
        setEndDate,
        startTime,
        setStartTime,
        endTime,
        setEndTime,
        allDay,
        setAllDay,
        isRecurring,
        setIsRecurring,
        recurrence,
        setRecurrence,
        calendarIndex,
        setCalendarIndex,
        taskStatus,
        setTaskStatus,
        buildPayload,
        resetLastKey: () => {
            lastKeyRef.current = null;
        },
    };
}
