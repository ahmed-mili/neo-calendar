import { useState, useEffect, useRef, useCallback } from "react";
import { DateTime } from "luxon";
import { NeoEvent } from "../../types";
import { getTaskStatus, isTask, TaskStatus } from "../tasks";
import { Subtask, readSubtasks, writeSubtasks } from "../tasks/subtasks";
import type { DraftInfo } from "./EventPanel";
import {
    RecurrenceState,
    defaultRecurrence,
    eventToRecurrenceState,
    recurrenceToEventFields,
} from "./recurrence";
import {
    clearOccurrenceDescription,
    occurrenceDescription,
    setOccurrenceDescription,
} from "./occurrenceDescription";

interface EditableCalendarRef {
    id: string;
    name: string;
    type: string;
}

interface Args {
    eventId: string | null;
    event: NeoEvent | null;
    /** The day of the series this panel was opened on, when it was opened on
        one. It is what a description can be written for on its own. */
    occurrenceDate?: string | null;
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
    occurrenceDate = null,
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
    // The series' OWN description, kept aside while an occurrence is writing
    // its own: the note still carries it for every other day, and a save built
    // from the form alone would overwrite it with this one day's text.
    const [seriesDescription, setSeriesDescription] = useState("");
    // Carried through untouched unless this occurrence's own description
    // changes, for the same reason as `completedDates` above.
    const [occurrenceDescriptions, setOccurrenceDescriptions] = useState<
        string[] | undefined
    >(undefined);
    // False while the description on screen belongs to this occurrence alone.
    // A series shares one description by default — that is what it means for a
    // series to have one — and this is the exception, held per occurrence.
    const [descriptionSynced, setDescriptionSynced] = useState(true);

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
                    ? getTaskStatus(event)
                    : null;
            }
            return;
        }

        if (event) {
            setTitle(event.title);
            setAllDay(!!event.allDay);
            setSubtasks(readSubtasks(event));

            // An occurrence that was unsynced shows ITS text; every other one
            // shows the series'. Both are held, because a save has to write
            // back the one the form is not showing.
            const own = occurrenceDescription(event, occurrenceDate);
            setSeriesDescription(event.description || "");
            setDescription(own ?? event.description ?? "");
            setDescriptionSynced(own === null);

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
                setOccurrenceDescriptions(undefined);
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
                setOccurrenceDescriptions(event.occurrenceDescriptions);
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
                setOccurrenceDescriptions(event.occurrenceDescriptions);
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
                setOccurrenceDescriptions(undefined);
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
            setSeriesDescription("");
            setOccurrenceDescriptions(undefined);
            setDescriptionSynced(true);

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
            setSeriesDescription("");
            setOccurrenceDescriptions(undefined);
            setDescriptionSynced(true);
        }

        lastKeyRef.current = key;
        prevPersistedStatusRef.current = event ? getTaskStatus(event) : null;
    }, [eventId, event, occurrenceDate, draft, committingDraft]);

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

    /**
     * A series' description is shared by every occurrence, or this one keeps
     * its own. Nothing is written here: the panel's change-watching effect
     * follows both pieces of state and saves the finished form.
     *
     * Turning it back on hands the occurrence to the series and shows the
     * series' own text again, which is the only honest way to undo it —
     * leaving the day's text on screen would suggest the series now said it.
     */
    const setDescriptionSyncedWithText = useCallback(
        (synced: boolean) => {
            setDescriptionSynced(synced);
            if (!occurrenceDate) return;
            if (synced) {
                setOccurrenceDescriptions((entries) =>
                    clearOccurrenceDescription(entries, occurrenceDate)
                );
                setDescription(seriesDescription);
                return;
            }
            // Unsyncing changes nothing on screen and nothing for the other
            // days: this one takes a copy of the text they share, and edits it
            // from there. Taking the text away from them is not what was asked
            // for — the switch was thrown on one day, not on the series.
            setSeriesDescription(description);
        },
        [occurrenceDate, seriesDescription, description]
    );

    /** True only where the choice exists: one day of a series, on a note that
        can carry the day's own text. */
    const canUnsyncDescription = isRecurring && !!occurrenceDate;

    const buildPayload = useCallback((): NeoEvent => {
        // The steps only belong to a task: switching an entry back to Event
        // drops them the way it drops the deadline, rather than leaving an
        // orphan list in the note.
        const steps = taskStatus === null ? undefined : writeSubtasks(subtasks);
        // With the description unsynced, the text in the form is this day's,
        // and the note keeps the series' own for every other day.
        const ownDay = isRecurring && !!occurrenceDate && !descriptionSynced;
        const seriesText = ownDay ? seriesDescription : description;
        const perOccurrence = ownDay
            ? setOccurrenceDescription(
                  occurrenceDescriptions,
                  occurrenceDate as string,
                  description
              )
            : occurrenceDescriptions;
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
                      // is done; they must survive an unrelated edit. So must
                      // the days that wrote their own description.
                      ...(completedDates ? { completedDates } : {}),
                      ...(perOccurrence
                          ? { occurrenceDescriptions: perOccurrence }
                          : {}),
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
            ...(seriesText ? { description: seriesText } : {}),
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
        description,
        seriesDescription,
        occurrenceDescriptions,
        descriptionSynced,
        occurrenceDate,
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
        descriptionSynced,
        setDescriptionSynced: setDescriptionSyncedWithText,
        canUnsyncDescription,
        buildPayload,
        resetLastKey: () => {
            lastKeyRef.current = null;
        },
    };
}
