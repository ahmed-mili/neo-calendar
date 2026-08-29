/** @jest-environment jsdom */

import * as React from "react";
import * as ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { formatPanelDate } from "./EventPanel.helpers";
import { DateRow } from "./EventPanelRows";

describe("editable multi-day end date", () => {
    let host: HTMLDivElement;

    beforeEach(() => {
        host = document.createElement("div");
        host.className = "nc-event-popup";
        document.body.appendChild(host);
    });

    afterEach(() => {
        act(() => {
            ReactDOM.unmountComponentAtNode(host);
        });
        host.remove();
    });

    it("opens the end-date picker by a real click and updates the range", () => {
        const setEndDate = jest.fn();
        const onAutoSave = jest.fn();

        act(() => {
            ReactDOM.render(
                <DateRow
                    date="2026-08-28"
                    dateLabel={formatPanelDate("2026-08-28")}
                    endDate="2026-08-31"
                    endDateLabel={formatPanelDate("2026-08-31")}
                    startTime="14:15"
                    endTime="15:15"
                    duration="73h"
                    allDay={false}
                    isRecurring={false}
                    editable={true}
                    firstDay={1}
                    setDate={jest.fn()}
                    setEndDate={setEndDate}
                    setStartTime={jest.fn()}
                    setEndTime={jest.fn()}
                    onAutoSave={onAutoSave}
                />,
                host
            );
        });

        const dateButtons =
            host.querySelectorAll<HTMLButtonElement>(".nc-panel-date-btn");
        expect(dateButtons).toHaveLength(2);
        expect(dateButtons[0].textContent).not.toContain("2026");
        expect(dateButtons[1].textContent).not.toContain("2026");

        act(() => {
            dateButtons[1].dispatchEvent(
                new MouseEvent("click", { bubbles: true })
            );
        });

        const nextDay = document.querySelector<HTMLButtonElement>(
            '[data-date-value="2026-09-01"]'
        );
        expect(nextDay).not.toBeNull();

        act(() => {
            nextDay?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(setEndDate).toHaveBeenCalledWith("2026-09-01");
        expect(onAutoSave).toHaveBeenCalledTimes(1);
    });
});
