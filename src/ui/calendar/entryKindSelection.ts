import { presetToRecurrence, RecurrenceState } from "./recurrence";

export type EntryKindSelection = "event" | "task" | "birthday";

interface ApplyEntryKindSelectionArgs {
    currentKind: EntryKindSelection;
    nextKind: EntryKindSelection;
    date: string;
    setTaskStatus: (status: "todo" | null) => void;
    setAllDay: (value: boolean) => void;
    setIsRecurring: (value: boolean) => void;
    setRecurrence: (value: RecurrenceState) => void;
    setDue: (value: null) => void;
    setCustomRepeat: (value: boolean) => void;
}

/**
 * Applies the semantic side effects of the Event / Task / Birthday selector.
 * Birthday is represented by the existing all-day + yearly recurrence shape.
 * An explicit selection away from Birthday must remove that yearly marker or
 * the next render infers Birthday again and visually undoes the click. The
 * all-day date is preserved so the conversion does not invent a time.
 */
export function applyEntryKindSelection({
    currentKind,
    nextKind,
    date,
    setTaskStatus,
    setAllDay,
    setIsRecurring,
    setRecurrence,
    setDue,
    setCustomRepeat,
}: ApplyEntryKindSelectionArgs): void {
    setTaskStatus(nextKind === "task" ? "todo" : null);

    if (currentKind === "birthday" && nextKind !== "birthday") {
        setIsRecurring(false);
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
