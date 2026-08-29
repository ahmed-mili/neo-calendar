from pathlib import Path

helper = Path("src/ui/calendar/entryKindSelection.ts")
helper.write_text(
    '''import { presetToRecurrence, RecurrenceState } from "./recurrence";

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
''',
    encoding="utf-8",
)

panel = Path("src/ui/calendar/EventPanel.tsx")
text = panel.read_text(encoding="utf-8")
old_import = 'import { applyEntryKindSelection } from "./entryKindSelection";\n'
new_import = '''import {
    applyEntryKindSelection,
    BirthdayReturnState,
} from "./entryKindSelection";
'''
assert old_import in text
text = text.replace(old_import, new_import, 1)

old_custom = '''    const [customRepeat, setCustomRepeat] = useState(false);
    useEffect(() => {
        setCustomRepeat(false);
    }, [eventId]);

    const toggleAllDay = () => {
'''
new_custom = '''    const [customRepeat, setCustomRepeat] = useState(false);
    useEffect(() => {
        setCustomRepeat(false);
    }, [eventId]);

    // Birthday is a temporary presentation of an existing entry. Keep the
    // schedule it replaced so Event -> Birthday -> Event is reversible while
    // the panel stays open (including the exact timed-grid position).
    const birthdayReturnStateRef = useRef<BirthdayReturnState | null>(null);
    const birthdayReturnOwner =
        eventId ??
        (draft ? `${draft.start.getTime()}:${draft.end.getTime()}` : null);
    useEffect(() => {
        birthdayReturnStateRef.current = null;
    }, [birthdayReturnOwner]);

    const toggleAllDay = () => {
'''
assert old_custom in text
text = text.replace(old_custom, new_custom, 1)

old_call = '''        applyEntryKindSelection({
            currentKind: entryKind,
            nextKind: kind,
            date: form.date,
            setTaskStatus: form.setTaskStatus,
            setAllDay: form.setAllDay,
            setIsRecurring: form.setIsRecurring,
            setRecurrence: form.setRecurrence,
            setDue: form.setDue,
            setCustomRepeat,
        });
'''
new_call = '''        applyEntryKindSelection({
            currentKind: entryKind,
            nextKind: kind,
            date: form.date,
            currentAllDay: form.allDay,
            currentIsRecurring: form.isRecurring,
            currentRecurrence: form.recurrence,
            currentStartTime: form.startTime,
            currentEndTime: form.endTime,
            birthdayReturnState: birthdayReturnStateRef.current,
            setBirthdayReturnState: (state) => {
                birthdayReturnStateRef.current = state;
            },
            setTaskStatus: form.setTaskStatus,
            setAllDay: form.setAllDay,
            setIsRecurring: form.setIsRecurring,
            setRecurrence: form.setRecurrence,
            setStartTime: form.setStartTime,
            setEndTime: form.setEndTime,
            setDue: form.setDue,
            setCustomRepeat,
        });
'''
assert old_call in text
text = text.replace(old_call, new_call, 1)
panel.write_text(text, encoding="utf-8")

test = Path("src/ui/calendar/EventPanelHeader.test.tsx")
text = test.read_text(encoding="utf-8")
old_existing_call = '''                            applyEntryKindSelection({
                                currentKind: kind,
                                nextKind,
                                date: "2026-08-29",
                                setTaskStatus,
                                setAllDay,
                                setIsRecurring,
                                setRecurrence,
                                setDue: () => setDue(null),
                                setCustomRepeat,
                            })
'''
new_existing_call = '''                            applyEntryKindSelection({
                                currentKind: kind,
                                nextKind,
                                date: "2026-08-29",
                                currentAllDay: allDay,
                                currentIsRecurring: isRecurring,
                                currentRecurrence: recurrence,
                                currentStartTime: "",
                                currentEndTime: "",
                                birthdayReturnState: null,
                                setBirthdayReturnState: () => {},
                                setTaskStatus,
                                setAllDay,
                                setIsRecurring,
                                setRecurrence,
                                setStartTime: () => {},
                                setEndTime: () => {},
                                setDue: () => setDue(null),
                                setCustomRepeat,
                            })
'''
assert old_existing_call in text
text = text.replace(old_existing_call, new_existing_call, 1)

test_case = r'''

    it.each([false, true])(
        "restores the original timed slot through Event -> Birthday -> Event (draft=%s)",
        (isDraft) => {
            const host = document.createElement("div");
            document.body.appendChild(host);

            function Harness() {
                const [taskStatus, setTaskStatus] = React.useState<
                    "todo" | null
                >(null);
                const [allDay, setAllDay] = React.useState(false);
                const [isRecurring, setIsRecurring] = React.useState(false);
                const [recurrence, setRecurrence] = React.useState(
                    presetToRecurrence("weekly", "2026-08-29")
                );
                const [startTime, setStartTime] = React.useState("09:15");
                const [endTime, setEndTime] = React.useState("10:00");
                const [, setDue] = React.useState<string | null>(null);
                const [, setCustomRepeat] = React.useState(false);
                const birthdayReturnState = React.useRef<
                    import("./entryKindSelection").BirthdayReturnState | null
                >(null);

                const kind =
                    taskStatus !== null
                        ? "task"
                        : allDay && isRecurring && recurrence.freq === "yearly"
                        ? "birthday"
                        : "event";

                return (
                    <>
                        <PanelHeader
                            isDraft={isDraft}
                            isTask={taskStatus !== null}
                            kind={kind}
                            setKind={(nextKind) =>
                                applyEntryKindSelection({
                                    currentKind: kind,
                                    nextKind,
                                    date: "2026-08-29",
                                    currentAllDay: allDay,
                                    currentIsRecurring: isRecurring,
                                    currentRecurrence: recurrence,
                                    currentStartTime: startTime,
                                    currentEndTime: endTime,
                                    birthdayReturnState:
                                        birthdayReturnState.current,
                                    setBirthdayReturnState: (state) => {
                                        birthdayReturnState.current = state;
                                    },
                                    setTaskStatus,
                                    setAllDay,
                                    setIsRecurring,
                                    setRecurrence,
                                    setStartTime,
                                    setEndTime,
                                    setDue: () => setDue(null),
                                    setCustomRepeat,
                                })
                            }
                            editable={true}
                            eventId={isDraft ? null : "timed-event.md"}
                            menuOpen={false}
                            menuRef={React.createRef<HTMLDivElement>()}
                            headerRef={React.createRef<HTMLDivElement>()}
                            onHeaderMouseDown={() => {}}
                            onToggleMenu={() => {}}
                            onOpenFile={() => {}}
                            onDeleteClick={() => {}}
                            onClose={() => {}}
                        />
                        <output
                            data-schedule-state="true"
                            data-all-day={String(allDay)}
                            data-start-time={startTime}
                            data-end-time={endTime}
                            data-recurring={String(isRecurring)}
                        />
                    </>
                );
            }

            act(() => ReactDOM.render(<Harness />, host));

            const readSchedule = () =>
                host.querySelector(
                    '[data-schedule-state="true"]'
                ) as HTMLOutputElement;
            const readTrigger = () =>
                host.querySelector(
                    ".nc-panel-kind-trigger"
                ) as HTMLButtonElement;
            const choose = (kind: "event" | "birthday") => {
                act(() => Simulate.click(readTrigger()));
                const option = document.body.querySelector(
                    `.nc-panel-kind-option[data-kind='${kind}']`
                ) as HTMLButtonElement;
                expect(option).toBeTruthy();
                act(() => Simulate.click(option));
            };

            expect(readTrigger().textContent).toContain(t("Event"));
            expect(readSchedule().dataset.allDay).toBe("false");
            expect(readSchedule().dataset.startTime).toBe("09:15");
            expect(readSchedule().dataset.endTime).toBe("10:00");

            choose("birthday");
            expect(readTrigger().textContent).toContain(t("Birthday"));
            expect(readSchedule().dataset.allDay).toBe("true");
            expect(readSchedule().dataset.startTime).toBe("09:15");
            expect(readSchedule().dataset.endTime).toBe("10:00");

            choose("event");
            expect(readTrigger().textContent).toContain(t("Event"));
            expect(readSchedule().dataset.allDay).toBe("false");
            expect(readSchedule().dataset.startTime).toBe("09:15");
            expect(readSchedule().dataset.endTime).toBe("10:00");
            expect(readSchedule().dataset.recurring).toBe("false");
        }
    );

    it("does not turn an originally all-day Event into a timed Event after Birthday", () => {
        let returnState: import("./entryKindSelection").BirthdayReturnState | null =
            null;
        let allDay = true;
        let recurring = false;
        let recurrence = presetToRecurrence("weekly", "2026-08-29");
        let startTime = "";
        let endTime = "";

        const apply = (
            currentKind: "event" | "birthday",
            nextKind: "event" | "birthday"
        ) =>
            applyEntryKindSelection({
                currentKind,
                nextKind,
                date: "2026-08-29",
                currentAllDay: allDay,
                currentIsRecurring: recurring,
                currentRecurrence: recurrence,
                currentStartTime: startTime,
                currentEndTime: endTime,
                birthdayReturnState: returnState,
                setBirthdayReturnState: (state) => {
                    returnState = state;
                },
                setTaskStatus: () => {},
                setAllDay: (value) => {
                    allDay = value;
                },
                setIsRecurring: (value) => {
                    recurring = value;
                },
                setRecurrence: (value) => {
                    recurrence = value;
                },
                setStartTime: (value) => {
                    startTime = value;
                },
                setEndTime: (value) => {
                    endTime = value;
                },
                setDue: () => {},
                setCustomRepeat: () => {},
            });

        apply("event", "birthday");
        expect(allDay).toBe(true);
        expect(recurring).toBe(true);
        expect(recurrence.freq).toBe("yearly");

        apply("birthday", "event");
        expect(allDay).toBe(true);
        expect(recurring).toBe(false);
        expect(startTime).toBe("");
        expect(endTime).toBe("");
    });
'''
marker = "\n});\n"
pos = text.rfind(marker)
assert pos != -1
text = text[:pos] + test_case + text[pos:]
test.write_text(text, encoding="utf-8")
