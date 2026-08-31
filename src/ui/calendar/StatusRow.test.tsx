/** @jest-environment jsdom */

import * as React from "react";
import * as ReactDOM from "react-dom";
import { act, Simulate } from "react-dom/test-utils";
import { StatusRow } from "./EventPanelRows";

describe("StatusRow", () => {
    let host: HTMLDivElement;

    beforeEach(() => {
        host = document.createElement("div");
        document.body.appendChild(host);
    });

    afterEach(() => {
        act(() => {
            ReactDOM.unmountComponentAtNode(host);
        });
        host.remove();
    });

    function render(
        taskStatus: "todo" | "complete",
        completeDisabledReason?: string
    ) {
        const setStatus = jest.fn();
        act(() => {
            ReactDOM.render(
                <StatusRow
                    taskStatus={taskStatus}
                    editable={true}
                    setStatus={setStatus}
                    completeDisabledReason={completeDisabledReason}
                />,
                host
            );
        });
        return setStatus;
    }

    it("blocks completing an undated task", () => {
        const setStatus = render(
            "todo",
            "Add a date or deadline before completing this task"
        );
        const button = host.querySelector("button") as HTMLButtonElement;

        expect(button.disabled).toBe(true);
        act(() => Simulate.click(button));
        expect(setStatus).not.toHaveBeenCalled();
    });

    it("still lets an inconsistent completed task return to todo", () => {
        const setStatus = render(
            "complete",
            "Add a date or deadline before completing this task"
        );
        const button = host.querySelector("button") as HTMLButtonElement;

        expect(button.disabled).toBe(false);
        act(() => Simulate.click(button));
        expect(setStatus).toHaveBeenCalledWith("todo");
    });
});
