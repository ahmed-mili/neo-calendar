import { presetToRecurrence, RecurrenceState } from "./recurrence";

export type EntryKindSelection = "event" | "task" | "birthday";

/** The schedule an entry had immediately before Birthday temporarily forced it all-day/yearly. */
export interface BirthdayReturnState {
    allDay: boolean;
    isRecurring: boolean;
    recurrence: RecurrenceState;
    startTime: string;
    endTime: string;
}

interface ApplyEntryKindSelectionArgs {
    currentKind: EntryKindSelection;
    nextKind: EntryKindSelection;
    date: string;
    currentAllDay: boolean;
    currentIsRecurring: boolean;
    currentRecurrence: RecurrenceState;
    currentStartTime: string;
    currentEndTime: string;
    birthdayReturnState: BirthdayReturnState | null;
    setBirthdayReturnState: (state: BirthdayReturnState | null) => void;
    setTaskStatus: (status: "todo" | null) => void;
    setAllDay: (value: boolean) => void;
    setIsRecurring: (value: boolean) => void;
    setRecurrence: (value: RecurrenceState) => void;
    setStartTime: (value: string) => void;
    setEndTime: (value: string) => void;
    setDue: (value: null) => void;
    setCustomRepeat: (value: boolean) => void;
}

/**
 * Applies the semantic side effects of the Event / Task / Birthday selector.
 *
 * Birthday temporarily forces an entry to all-day + yearly recurrence. Before
 * doing that, remember the schedule already in the form. Leaving Birthday in
 * the same edit restores that schedule, so a timed Event returns to the exact
 * timed-grid slot it occupied instead of staying in the all-day lane.
 *
 * An already-persisted Birthday has no in-memory return state; for that case we
 * keep the existing all-day shape while removing the yearly Birthday marker.
 */
export function applyEntryKindSelection({
    currentKind,
    nextKind,
    date,
    currentAllDay,
    currentIsRecurring,
    currentRecurrence,
    currentStartTime,
    currentEndTime,
    birthdayReturnState,
    setBirthdayReturnState,
    setTaskStatus,
    setAllDay,
    setIsRecurring,
    setRecurrence,
    setStartTime,
    setEndTime,
    setDue,
    setCustomRepeat,
}: ApplyEntryKindSelectionArgs): void {
    if (currentKind !== "birthday" && nextKind === "birthday") {
        setBirthdayReturnState({
            allDay: currentAllDay,
            isRecurring: currentIsRecurring,
            recurrence: currentRecurrence,
            startTime: currentStartTime,
            endTime: currentEndTime,
        });
    }

    setTaskStatus(nextKind === "task" ? "todo" : null);

    if (currentKind === "birthday" && nextKind !== "birthday") {
        if (birthdayReturnState) {
            setAllDay(birthdayReturnState.allDay);
            setStartTime(birthdayReturnState.startTime);
            setEndTime(birthdayReturnState.endTime);
            setIsRecurring(birthdayReturnState.isRecurring);
            if (birthdayReturnState.isRecurring) {
                setRecurrence(birthdayReturnState.recurrence);
            }
        } else {
            setIsRecurring(false);
        }
        setBirthdayReturnState(null);
        setCustomRepeat(false);
    }

    if (nextKind === "birthday") {
        setAllDay(true);
        setIsRecurring(true);
        setRecurrence(presetToRecurrence("yearly", date));
        setDue(null);
        setCustomRepeat(false);
    }
}
