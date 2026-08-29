/** @jest-environment jsdom */

import * as React from "react";
import * as ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { DateOptionsRow } from "./EventDateControls";

describe("compact event date controls", () => {
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
                bottom: 132,
                width: 260,
                height: 32,
                toJSON: () => ({}),
            } as DOMRect);

        return props;
    }

    it("replaces the old full 'Once' row with compact all-day and repeat controls", () => {
        renderControls();

        const allDay = host.querySelector(
            '[data-date-option="all-day"]'
        ) as HTMLButtonElement;
        const repeat = host.querySelector(
            '[data-date-option="repeat"]'
        ) as HTMLButtonElement;

        expect(allDay).not.toBeNull();
        expect(repeat).not.toBeNull();
        expect(repeat.textContent).toBe("Répéter");
        expect(host.querySelector(".nc-panel-row-repeat")).toBeNull();
        expect(host.querySelector(".nc-panel-row-allday")).toBeNull();
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
            options[2].dispatchEvent(new MouseEvent("click", { bubbles: true }));
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
