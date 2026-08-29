/** @jest-environment jsdom */
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act, Simulate } from "react-dom/test-utils";
import { PanelHeader, TitleRow } from "./EventPanelRows";
import { t } from "../i18n";
import { applyEntryKindSelection } from "./entryKindSelection";
import { presetToRecurrence } from "./recurrence";

function titleNativeInput(field: HTMLInputElement, value: string) {
    const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
    )?.set;
    expect(setter).toBeTruthy();
    act(() => {
        field.dispatchEvent(
            new KeyboardEvent("keydown", {
                key: value.slice(-1),
                bubbles: true,
            })
        );
        field.dispatchEvent(
            new InputEvent("beforeinput", {
                bubbles: true,
                inputType: "insertText",
                data: value.slice(-1),
            })
        );
        setter?.call(field, value);
        field.dispatchEvent(
            new InputEvent("input", {
                bubbles: true,
                inputType: "insertText",
                data: value.slice(-1),
            })
        );
    });
}

describe("event panel header refresh", () => {
    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("opens the type menu without starting panel drag and changes kind", () => {
        const host = document.createElement("div");
        document.body.appendChild(host);
        const setKind = jest.fn();
        const onHeaderMouseDown = jest.fn();
        const menuRef = React.createRef<HTMLDivElement>();
        const headerRef = React.createRef<HTMLDivElement>();

        act(() => {
            ReactDOM.render(
                <PanelHeader
                    isDraft={false}
                    isTask={false}
                    kind="event"
                    setKind={setKind}
                    editable={true}
                    eventId="event.md"
                    menuOpen={false}
                    menuRef={menuRef}
                    headerRef={headerRef}
                    onHeaderMouseDown={onHeaderMouseDown}
                    onToggleMenu={() => {}}
                    onOpenFile={() => {}}
                    onDeleteClick={() => {}}
                    onClose={() => {}}
                />,
                host
            );
        });

        const trigger = host.querySelector(
            ".nc-panel-kind-trigger"
        ) as HTMLButtonElement;
        expect(trigger).toBeTruthy();
        act(() => {
            Simulate.mouseDown(trigger, { button: 0 });
            Simulate.click(trigger);
        });
        expect(onHeaderMouseDown).not.toHaveBeenCalled();

        const task = document.body.querySelector(
            ".nc-panel-kind-option[data-kind='task']"
        ) as HTMLButtonElement;
        expect(task).toBeTruthy();
        act(() => Simulate.click(task));
        expect(setKind).toHaveBeenCalledWith("task");
    });

    it("keeps Title on the native keyboard to DOM to React path", () => {
        const host = document.createElement("div");
        document.body.appendChild(host);

        function Harness() {
            const [title, setTitle] = React.useState("");
            const ref = React.useRef<HTMLInputElement>(null);
            return (
                <TitleRow
                    title={title}
                    editable={true}
                    inputRef={ref}
                    onChange={setTitle}
                    onCommit={() => {}}
                />
            );
        }

        act(() => {
            ReactDOM.render(<Harness />, host);
        });
        const field = host.querySelector(
            ".nc-panel-title-input"
        ) as HTMLInputElement;
        expect(field.placeholder).toBe(t("Title"));
        expect(host.querySelector(".nc-panel-title-icon")).toBeNull();

        act(() => field.focus());
        expect(document.activeElement).toBe(field);
        titleNativeInput(field, "T");
        titleNativeInput(field, "Ti");
        titleNativeInput(field, "Title");
        expect(field.value).toBe("Title");

        field.setSelectionRange(4, 5);
        act(() => {
            field.dispatchEvent(
                new KeyboardEvent("keydown", {
                    key: "Backspace",
                    bubbles: true,
                })
            );
            const setter = Object.getOwnPropertyDescriptor(
                HTMLInputElement.prototype,
                "value"
            )?.set;
            setter?.call(field, "Titl");
            field.dispatchEvent(
                new InputEvent("input", {
                    bubbles: true,
                    inputType: "deleteContentBackward",
                })
            );
        });
        expect(field.value).toBe("Titl");
    });

    it.each([false, true])(
        "switches Birthday back to Event through the real menu (draft=%s)",
        (isDraft) => {
            const host = document.createElement("div");
            document.body.appendChild(host);

            function Harness() {
                const [taskStatus, setTaskStatus] = React.useState<
                    "todo" | null
                >(null);
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
        let returnState:
            | import("./entryKindSelection").BirthdayReturnState
            | null = null;
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
});
