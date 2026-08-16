import { useState, useEffect, useRef, useCallback } from "react";
import { DateTime } from "luxon";
import { NeoEvent } from "../../types";
import { getTaskStatus, isSeries, isTask, TaskStatus } from "../tasks";
import { Subtask, readSubtasks, writeSubtasks } from "../tasks/subtasks";
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
    /** The draft is being written to the vault right now — see the hand-over
        in the reset effect below. */
    committingDraft?: boolean;
}

/** The key a draft is remembered under, until it has an id of its own. */
export const DRAFT_KEY = "__draft__";

/**
 * Is this key change a draft turning into the event that was written from it?
 *
 * Naming a draft creates the event, and for a moment the panel holds neither:
 * the draft is dropped as the write starts (so the grid does not show a slot and
 * an event in the same place), and the id only lands when the file does. Both of
 * those frames are the SAME edit continuing, and the form must not be reloaded
 * on either — reloading is what emptied the panel on the first character typed
 * and filled it again a moment later.
 *
 * Any other change of key is a different entry being shown, and does reload:
 * a draft simply abandoned, another event clicked, the panel emptied.
 */
export function isDraftHandover(
    previousKey: string | null,
    eventId: string | null,
    committingDraft: boolean
): boolean {
    if (previousKey !== DRAFT_KEY) return false;
    return committingDraft || eventId !== null;
}

/**
 * The `completed` field a form's task state should be saved with.
 *
 * `undefined` is what keeps an entry a plain event: `isTask` treats *any*
 * present, non-null `completed` as a task, so a non-task must carry no field
 * at all. `false` means outstanding, an ISO timestamp records when it was
 * finished.
 *
 * Both payload branches (dated and someday) go through here so they cannot
 * drift: the dated one used to hardcode `false`, which silently turned every
 * dated event into a task no matter what the form said.
 */
export function completedFor(
    taskStatus: TaskStatus | null,
    now: () => string = () => DateTime.now().toISO() as string
): string | false | undefined {
    if (taskStatus === null) return undefined;
    return taskStatus === "complete" ? now() : false;
}

/**
 * The `due` field a form should be saved with.
 *
 * A deadline only means something on a task: an event has none, it *is* its
 * date. So switching an entry back to Event drops any deadline it was carrying
 * rather than leaving an orphan key in the note — the same reasoning that makes
 * a non-task carry no `completed`.
 */
export function dueFor(
    taskStatus: TaskStatus | null,
    due: string | null
): string | undefined {
    if (taskStatus === null || !due) return undefined;
    return due;
}

/**
 * The `completed` field for a SERIES.
 *
 * On a series the field is a marker and nothing more — it says "this is a
 * task", never "it is finished", because a series as a whole never is. The
 * finished occurrences live in `completedDates`. So there are only two states
 * here, and a finish timestamp is not one of them.
 */
export function completedForSeries(isTask: boolean): false | undefined {
    return isTask ? false : undefined;
}

/**
 * The status the FORM should show for an event — a series included.
 *
 * `getTaskStatus` answers `null` for a series ON PURPOSE: a series is never
 * finished as a whole, and asking whether it is done is a question that only
 * one of its days can answer. But the panel is not asking that. It is asking
 * "is this a task", and for a series the answer is `completed` being present at
 * all, which is exactly what `isTask` reads.
 *
 * Reading a series through `getTaskStatus` is what turned a task into an event
 * the moment Repeat was pressed: the note was written as a series with its
 * `completed` intact, the cache handed it back, the sync below read `null` off
 * it, and the form — now believing it held an ordinary event — dropped the
 * field on the next save.
 */
export function formStatusOf(event: NeoEvent): TaskStatus | null {
    if (isSeries(event)) return isTask(event) ? "todo" : null;
    return getTaskStatus(event);
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
    committingDraft = false,
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
    // A task's deadline, independent of its date. Null when it has none —
    // most tasks never need one.
    const [due, setDue] = useState<string | null>(null);
    // The steps the task is made of. Held as objects and written back as lines
    // (see ui/tasks/subtasks), so the panel never handles the stored syntax.
    const [subtasks, setSubtasks] = useState<Subtask[]>([]);
    // Carried through untouched: the panel edits the series, while the ticks
    // happen on the grid. Dropping it here would erase every occurrence ever
    // ticked the next time the title was edited.
    const [completedDates, setCompletedDates] = useState<string[] | undefined>(
        undefined
    );
    // The days this series does NOT happen on, because each of them was taken
    // out of it and written on its own. Carried through untouched for the same
    // reason as `completedDates`: `recurrenceToEventFields` builds a rule from
    // the form alone and hands back an empty list, so a payload that did not
    // carry these would put every detached day back on the calendar — twice,
    // beside the copy it was detached into.
    const [skipDates, setSkipDates] = useState<string[] | undefined>(undefined);

    const lastKeyRef = useRef<string | null>(null);
    // Tracks the event's last-seen PERSISTED task status, so the sync effect
    // below can tell a real external change (checkbox on the block, undo, edit)
    // from our own optimistic toggle echoing back through the cache.
    const prevPersistedStatusRef = useRef<TaskStatus | null>(null);

    useEffect(() => {
        const key = eventId || (draft ? DRAFT_KEY : null);
        if (key === lastKeyRef.current) return;

        // The draft → event hand-over carries the typed state over instead of
        // loading the form again from the note it just wrote (see
        // isDraftHandover). Nothing typed while the file was being written is
        // lost either, for the same reason.
        if (isDraftHandover(lastKeyRef.current, eventId, committingDraft)) {
            if (eventId) {
                lastKeyRef.current = eventId;
                prevPersistedStatusRef.current = event
                    ? formStatusOf(event)
                    : null;
            }
            return;
        }

        if (event) {
            setTitle(event.title);
            setDescription(event.description || "");
            setAllDay(!!event.allDay);
            setSubtasks(readSubtasks(event));

            if (event.type === "single" || event.type === undefined) {
                setDate(event.date || "");
                setEndDate(event.endDate ?? undefined);
                setStartTime(!event.allDay ? event.startTime || "" : "");
                setEndTime(!event.allDay ? event.endTime || "" : "");
                const r = eventToRecurrenceState(event, event.date || "");
                setIsRecurring(r.isRecurring);
                setRecurrence(r.recurrence);
                setTaskStatus(getTaskStatus(event));
                setDue(event.due ?? null);
                setCompletedDates(undefined);
                setSkipDates(undefined);
            } else if (event.type === "recurring") {
                setDate(event.startRecur || "");
                setStartTime(!event.allDay ? event.startTime || "" : "");
                setEndTime(!event.allDay ? event.endTime || "" : "");
                const r = eventToRecurrenceState(event, event.startRecur || "");
                setIsRecurring(r.isRecurring);
                setRecurrence(r.recurrence);
                setTaskStatus(isTask(event) ? "todo" : null);
                setDue(null);
                setCompletedDates(event.completedDates);
                setSkipDates(event.skipDates);
            } else if (event.type === "rrule") {
                setDate(event.startDate || "");
                setStartTime(!event.allDay ? event.startTime || "" : "");
                setEndTime(!event.allDay ? event.endTime || "" : "");
                const r = eventToRecurrenceState(event, event.startDate || "");
                setIsRecurring(r.isRecurring);
                setRecurrence(r.recurrence);
                setTaskStatus(isTask(event) ? "todo" : null);
                setDue(null);
                setCompletedDates(event.completedDates);
                setSkipDates(event.skipDates);
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
                setDue((event as { due?: string | null }).due ?? null);
                setCompletedDates(undefined);
                setSkipDates(undefined);
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
            setDue(null);
            setSubtasks([]);
            setCompletedDates(undefined);
            setSkipDates(undefined);

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
            setDue(null);
            setSubtasks([]);
            setCompletedDates(undefined);
            setSkipDates(undefined);
        }

        lastKeyRef.current = key;
        prevPersistedStatusRef.current = event ? formStatusOf(event) : null;
    }, [eventId, event, draft, committingDraft]);

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
        const persisted = formStatusOf(event);
        if (persisted !== prevPersistedStatusRef.current) {
            prevPersistedStatusRef.current = persisted;
            setTaskStatus(persisted);
        }
    }, [event]);

    const buildPayload = useCallback((): NeoEvent => {
        // The steps only belong to a task: switching an entry back to Event
        // drops them the way it drops the deadline, rather than leaving an
        // orphan list in the note.
        const steps = taskStatus === null ? undefined : writeSubtasks(subtasks);
        return {
            title,
            ...(steps ? { subtasks: steps } : {}),
            ...(allDay
                ? { allDay: true }
                : { allDay: false, startTime: startTime || "", endTime }),
            ...(isRecurring
                ? {
                      ...recurrenceToEventFields(recurrence, date || ""),
                      completed: completedForSeries(taskStatus !== null),
                      // Ticked occurrences are the series' only record of what
                      // is done, and skipped ones the only record of what has
                      // been detached from it. Both must survive an edit that
                      // was about something else entirely.
                      ...(completedDates ? { completedDates } : {}),
                      ...(skipDates?.length ? { skipDates } : {}),
                  }
                : date
                ? {
                      type: "single",
                      date,
                      endDate: endDate || null,
                      completed: completedFor(taskStatus),
                      due: dueFor(taskStatus, due),
                  }
                : {
                      type: "someday",
                      completed: completedFor(taskStatus),
                      due: dueFor(taskStatus, due),
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
        due,
        subtasks,
        completedDates,
        skipDates,
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
        due,
        setDue,
        subtasks,
        setSubtasks,
        buildPayload,
        resetLastKey: () => {
            lastKeyRef.current = null;
        },
    };
}
