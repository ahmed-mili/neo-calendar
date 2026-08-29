from pathlib import Path

helper = Path('src/ui/calendar/entryKindSelection.ts')
helper.write_text('''import { presetToRecurrence, RecurrenceState } from "./recurrence";\n\nexport type EntryKindSelection = "event" | "task" | "birthday";\n\ninterface ApplyEntryKindSelectionArgs {\n    currentKind: EntryKindSelection;\n    nextKind: EntryKindSelection;\n    date: string;\n    setTaskStatus: (status: "todo" | null) => void;\n    setAllDay: (value: boolean) => void;\n    setIsRecurring: (value: boolean) => void;\n    setRecurrence: (value: RecurrenceState) => void;\n    setDue: (value: null) => void;\n    setCustomRepeat: (value: boolean) => void;\n}\n\n/**\n * Applies the semantic side effects of the Event / Task / Birthday selector.\n * Birthday is represented by the existing all-day + yearly recurrence shape.\n * Leaving Birthday must remove that yearly marker or the next render infers\n * Birthday again and visually undoes the click. The all-day date is preserved.\n */\nexport function applyEntryKindSelection({\n    currentKind,\n    nextKind,\n    date,\n    setTaskStatus,\n    setAllDay,\n    setIsRecurring,\n    setRecurrence,\n    setDue,\n    setCustomRepeat,\n}: ApplyEntryKindSelectionArgs): void {\n    setTaskStatus(nextKind === "task" ? "todo" : null);\n\n    if (currentKind === "birthday" && nextKind !== "birthday") {\n        setIsRecurring(false);\n        setCustomRepeat(false);\n    }\n\n    if (nextKind === "birthday") {\n        setAllDay(true);\n        setIsRecurring(true);\n        setRecurrence(presetToRecurrence("yearly", date));\n        setDue(null);\n        setCustomRepeat(false);\n    }\n}\n''', encoding='utf-8')

panel = Path('src/ui/calendar/EventPanel.tsx')
text = panel.read_text(encoding='utf-8')
import_anchor = 'import { recurringEditChanges } from "./recurringEditChanges";\n'
assert import_anchor in text
text = text.replace(import_anchor, import_anchor + 'import { applyEntryKindSelection } from "./entryKindSelection";\n', 1)
old = '''    /**\n     * Choosing what an entry is.\n     *\n     * A birthday is the only one of the three that is more than a label: it\n     * takes the whole day and comes back each year, which is what makes it one.\n     * Turning it off leaves those where they are — the entry keeps the shape it\n     * was given, and only stops being CALLED a birthday.\n     */\n    const setEntryKind = (kind: EntryKind) => {\n        form.setTaskStatus(kind === "task" ? "todo" : null);\n        if (kind === "birthday") {\n            form.setAllDay(true);\n            form.setIsRecurring(true);\n            form.setRecurrence(presetToRecurrence("yearly", form.date));\n            form.setDue(null);\n            setCustomRepeat(false);\n        }\n        scheduleAutoSave();\n    };\n'''
new = '''    /**\n     * Choosing what an entry is. Birthday is encoded by the existing all-day +\n     * yearly shape, so explicitly leaving it must clear that yearly marker; if\n     * it does not, `entryKind` is inferred as Birthday again on the next render.\n     */\n    const setEntryKind = (kind: EntryKind) => {\n        applyEntryKindSelection({\n            currentKind: entryKind,\n            nextKind: kind,\n            date: form.date,\n            setTaskStatus: form.setTaskStatus,\n            setAllDay: form.setAllDay,\n            setIsRecurring: form.setIsRecurring,\n            setRecurrence: form.setRecurrence,\n            setDue: form.setDue,\n            setCustomRepeat,\n        });\n        scheduleAutoSave();\n    };\n'''
assert old in text
panel.write_text(text.replace(old, new, 1), encoding='utf-8')

test = Path('src/ui/calendar/EventPanelHeader.test.tsx')
text = test.read_text(encoding='utf-8')
import_anchor = 'import { t } from "../i18n";\n'
assert import_anchor in text
text = text.replace(import_anchor, import_anchor + 'import { applyEntryKindSelection } from "./entryKindSelection";\nimport { presetToRecurrence } from "./recurrence";\n', 1)
case = r'''

    it.each([false, true])(
        "switches Birthday back to Event through the real menu (draft=%s)",
        (isDraft) => {
            const host = document.createElement("div");
            document.body.appendChild(host);

            function Harness() {
                const [taskStatus, setTaskStatus] = React.useState<"todo" | null>(null);
                const [allDay, setAllDay] = React.useState(true);
                const [isRecurring, setIsRecurring] = React.useState(true);
                const [recurrence, setRecurrence] = React.useState(
                    presetToRecurrence("yearly", "2026-08-29")
                );
                const [, setDue] = React.useState<string | null>(null);
                const [, setCustomRepeat] = React.useState(false);
                const kind =
                    taskStatus !== null
                        ? "task"
                        : allDay && isRecurring && recurrence.freq === "yearly"
                        ? "birthday"
                        : "event";

                return (
                    <PanelHeader
                        isDraft={isDraft}
                        isTask={taskStatus !== null}
                        kind={kind}
                        setKind={(nextKind) =>
                            applyEntryKindSelection({
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
                        }
                        editable={true}
                        eventId={isDraft ? null : "birthday.md"}
                        menuOpen={false}
                        menuRef={React.createRef<HTMLDivElement>()}
                        headerRef={React.createRef<HTMLDivElement>()}
                        onHeaderMouseDown={() => {}}
                        onToggleMenu={() => {}}
                        onOpenFile={() => {}}
                        onDeleteClick={() => {}}
                        onClose={() => {}}
                    />
                );
            }

            act(() => ReactDOM.render(<Harness />, host));
            const trigger = host.querySelector(
                ".nc-panel-kind-trigger"
            ) as HTMLButtonElement;
            expect(trigger.textContent).toContain(t("Birthday"));

            act(() => Simulate.click(trigger));
            const eventOption = document.body.querySelector(
                ".nc-panel-kind-option[data-kind='event']"
            ) as HTMLButtonElement;
            expect(eventOption).toBeTruthy();
            act(() => Simulate.click(eventOption));

            expect(trigger.textContent).toContain(t("Event"));
        }
    );
'''
marker = '\n});\n'
pos = text.rfind(marker)
assert pos != -1
text = text[:pos] + case + text[pos:]
test.write_text(text, encoding='utf-8')
