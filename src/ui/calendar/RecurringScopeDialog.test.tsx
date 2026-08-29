/** @jest-environment jsdom */
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act, Simulate } from "react-dom/test-utils";
import { RecurringScopeDialog } from "./EventPanelRows";
import { RecurringEditChange } from "./recurringEditChanges";
import { t } from "../i18n";

const changes: RecurringEditChange[] = [
    {
        key: "title",
        label: "Title",
        before: "Standup",
        after: "Client demo",
    },
];

function button(label: string): HTMLButtonElement {
    const match = Array.from(document.body.querySelectorAll("button")).find(
        (element) => element.textContent?.trim() === label
    );
    if (!(match instanceof HTMLButtonElement)) {
        throw new Error(`Button not found: ${label}`);
    }
    return match;
}

describe("RecurringScopeDialog", () => {
    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("shows only the pending change and maps This event only to occurrence", () => {
        const onConfirm = jest.fn();
        const onCancel = jest.fn();
        act(() => {
            ReactDOM.render(
                <RecurringScopeDialog
                    isTask={false}
                    changes={changes}
                    onCancel={onCancel}
                    onConfirm={onConfirm}
                />,
                document.createElement("div")
            );
        });

        expect(document.body.textContent).toContain(t("Edit recurring event"));
        expect(document.body.textContent).toContain(t("Changes"));
        expect(document.body.textContent).toContain("Standup");
        expect(document.body.textContent).toContain("Client demo");

        act(() => Simulate.click(button(t("This event only"))));
        expect(onConfirm).toHaveBeenCalledWith("occurrence");
        expect(onCancel).not.toHaveBeenCalled();
    });

    it("maps All events to the unchanged series path", () => {
        const onConfirm = jest.fn();
        act(() => {
            ReactDOM.render(
                <RecurringScopeDialog
                    isTask={false}
                    changes={changes}
                    onCancel={() => {}}
                    onConfirm={onConfirm}
                />,
                document.createElement("div")
            );
        });

        act(() => Simulate.click(button(t("All events"))));
        expect(onConfirm).toHaveBeenCalledWith("series");
    });

    it("cancels without invoking either persistence scope", () => {
        const onConfirm = jest.fn();
        const onCancel = jest.fn();
        act(() => {
            ReactDOM.render(
                <RecurringScopeDialog
                    isTask={false}
                    changes={changes}
                    onCancel={onCancel}
                    onConfirm={onConfirm}
                />,
                document.createElement("div")
            );
        });

        act(() => Simulate.click(button(t("Cancel"))));
        expect(onCancel).toHaveBeenCalledTimes(1);
        expect(onConfirm).not.toHaveBeenCalled();
    });
});
