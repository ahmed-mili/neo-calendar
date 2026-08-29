/** @jest-environment jsdom */

import * as React from "react";
import * as ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { DateOptionsRow } from "./EventDateControls";
import { RemindersRow } from "./EventPanelRows";
import { setReminderDisplayAllDay } from "./reminderChoices";

describe("event date controls", () => {
    let host: HTMLDivElement;

    beforeEach(() => {
        host = document.createElement("div");
        document.body.appendChild(host);
        Object.defineProperty(window, "innerHeight", {
            configurable: true,
            value: 800,
        });
    });

    afterEach(() => {
        act(() => {
            ReactDOM.unmountComponentAtNode(host);
        });
        document.body.innerHTML = "";
        document.documentElement.classList.remove("nc-platform-android");
        document.documentElement.removeAttribute("data-neo-calendar-platform");
        setReminderDisplayAllDay(false);
    });

    function renderControls(
        overrides: Partial<React.ComponentProps<typeof DateOptionsRow>> = {}
    ) {
        const props: React.ComponentProps<typeof DateOptionsRow> = {
            allDay: false,
            editable: true,
            onToggleAllDay: jest.fn(),
            isRecurring: false,
            currentPreset: "daily",
            summary: "",
            onChooseRepeat: jest.fn(),
            ...overrides,
        };

        act(() => {
            ReactDOM.render(<DateOptionsRow {...props} />, host);
        });

        const row = host.querySelector(
            ".nc-panel-date-options"
        ) as HTMLDivElement;
        row.getBoundingClientRect = () =>
            ({
                x: 20,
                y: 100,
                left: 20,
                top: 100,
                right: 280,
                bottom: 134,
                width: 260,
                height: 34,
                toJSON: () => ({}),
            } as DOMRect);

        return props;
    }

    it("renders All-day and Repeat as the exact two flat schedule actions", () => {
        renderControls();

        const controls = host.querySelectorAll(".nc-panel-date-option");
        const allDay = host.querySelector(
            '[data-date-option="all-day"]'
        ) as HTMLButtonElement;
        const repeat = host.querySelector(
            '[data-date-option="repeat"]'
        ) as HTMLButtonElement;

        expect(controls).toHaveLength(2);
        expect(allDay).not.toBeNull();
        expect(repeat).not.toBeNull();
        expect(
            allDay.querySelector(".nc-panel-date-option-icon svg")
        ).not.toBeNull();
        expect(
            repeat.querySelector(".nc-panel-date-option-icon svg")
        ).not.toBeNull();
        expect(allDay.getAttribute("aria-pressed")).toBe("false");
        expect(allDay.classList.contains("nc-active")).toBe(false);
        expect(repeat.textContent).toBe("Répéter");
        expect(host.querySelector(".nc-panel-row-repeat")).toBeNull();
        expect(host.querySelector(".nc-panel-row-allday")).toBeNull();
    });

    it("marks the all-day action active without changing the Repeat action", () => {
        renderControls({ allDay: true });

        const allDay = host.querySelector(
            '[data-date-option="all-day"]'
        ) as HTMLButtonElement;
        const repeat = host.querySelector(
            '[data-date-option="repeat"]'
        ) as HTMLButtonElement;

        expect(allDay.getAttribute("aria-pressed")).toBe("true");
        expect(allDay.classList.contains("nc-active")).toBe(true);
        expect(repeat.classList.contains("nc-active")).toBe(false);
    });

    it("opens recurrence with the exact calendar-selector menu classes and native pointer/click path", () => {
        const onChooseRepeat = jest.fn();
        renderControls({ onChooseRepeat });

        const repeat = host.querySelector(
            '[data-date-option="repeat"]'
        ) as HTMLButtonElement;

        act(() => {
            repeat.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        const menu = document.querySelector(
            '[data-date-repeat-menu="true"]'
        ) as HTMLDivElement;
        expect(menu).not.toBeNull();
        expect(menu.classList.contains("nc-cal-select-menu")).toBe(true);
        expect(menu.classList.contains("nc-repeat-select-menu")).toBe(true);

        const options = Array.from(
            menu.querySelectorAll<HTMLButtonElement>(".nc-cal-select-option")
        );
        expect(options).toHaveLength(6);
        expect(options[0].getAttribute("aria-checked")).toBe("true");

        act(() => {
            options[2].dispatchEvent(
                new MouseEvent("click", { bubbles: true })
            );
        });
        expect(onChooseRepeat).toHaveBeenCalledWith("weekly");
        expect(
            document.querySelector('[data-date-repeat-menu="true"]')
        ).toBeNull();
    });

    it("toggles all-day through a real button click", () => {
        const onToggleAllDay = jest.fn();
        renderControls({ onToggleAllDay });

        const allDay = host.querySelector(
            '[data-date-option="all-day"]'
        ) as HTMLButtonElement;
        act(() => {
            allDay.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(onToggleAllDay).toHaveBeenCalledTimes(1);
    });

    it("makes the reminder row use 09:00 + relative-day choices when All-day is active", () => {
        function Harness() {
            const [allDay, setAllDay] = React.useState(false);
            const [reminders, setReminders] = React.useState<number[]>([]);
            return (
                <>
                    <DateOptionsRow
                        allDay={allDay}
                        editable={true}
                        onToggleAllDay={() => setAllDay((value) => !value)}
                        isRecurring={false}
                        currentPreset="daily"
                        summary=""
                        onChooseRepeat={() => {}}
                    />
                    <RemindersRow
                        reminders={reminders}
                        editable={true}
                        setReminders={setReminders}
                        onAutoSave={() => {}}
                    />
                </>
            );
        }

        act(() => {
            ReactDOM.render(<Harness />, host);
        });
        const allDay = host.querySelector(
            '[data-date-option="all-day"]'
        ) as HTMLButtonElement;
        act(() => {
            allDay.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        expect(allDay.getAttribute("aria-pressed")).toBe("true");

        const reminders = host.querySelector(
            ".nc-panel-reminders"
        ) as HTMLDivElement;
        reminders.getBoundingClientRect = () =>
            ({
                x: 20,
                y: 180,
                left: 20,
                top: 180,
                right: 280,
                bottom: 214,
                width: 260,
                height: 34,
                toJSON: () => ({}),
            } as DOMRect);
        act(() => {
            reminders.dispatchEvent(
                new MouseEvent("click", { bubbles: true })
            );
        });

        const options = Array.from(
            document.querySelectorAll<HTMLButtonElement>(
                ".nc-reminders-menu .nc-reminders-option"
            )
        );
        expect(options).toHaveLength(4);
        expect(options[0].textContent).toContain("09:00");
        expect(options[0].textContent).toContain("Same day");
        expect(options[1].textContent).toContain("09:00");
        expect(options[1].textContent).toContain("1 jour avant");

        act(() => {
            options[0].dispatchEvent(
                new MouseEvent("click", { bubbles: true })
            );
        });
        expect(reminders.textContent).toContain("09:00");
        expect(reminders.textContent).toContain("Same day");
    });

    it("portals the same repeat menu into the Android overlay root", () => {
        document.documentElement.classList.add("nc-platform-android");
        const overlay = document.createElement("div");
        overlay.id = "nc-android-overlay-root";
        document.body.appendChild(overlay);
        renderControls();

        const repeat = host.querySelector(
            '[data-date-option="repeat"]'
        ) as HTMLButtonElement;
        act(() => {
            repeat.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        const menu = overlay.querySelector('[data-date-repeat-menu="true"]');
        expect(menu).not.toBeNull();
        expect(menu?.classList.contains("nc-cal-select-menu")).toBe(true);
    });
});
