/** @jest-environment jsdom */
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import AddCalendarDialog from "./AddCalendarDialog";
import { applyLanguage } from "../../../src/ui/i18n";

describe("AddCalendarDialog", () => {
    let host: HTMLDivElement;

    beforeEach(() => {
        applyLanguage("fr");
        host = document.createElement("div");
        document.body.appendChild(host);
    });

    afterEach(() => {
        act(() => {
            ReactDOM.unmountComponentAtNode(host);
        });
        host.remove();
        document
            .querySelectorAll(".nc-add-calendar-dialog")
            .forEach((node) => node.remove());
        applyLanguage("fr");
    });

    const render = () => {
        act(() => {
            ReactDOM.render(
                React.createElement(AddCalendarDialog, {
                    open: true,
                    rootFolder: "C:/Calendrier",
                    existingNames: [],
                    onClose: () => {},
                    onCreate: async () => {},
                }),
                host
            );
        });
    };

    it("offers only the Full Note and automatic calendar types", () => {
        render();
        const cards = Array.from(
            document.querySelectorAll(
                '[role="radiogroup"] [role="radio"]'
            )
        ).map((node) => node.textContent);
        expect(cards).toHaveLength(2);
    });

    it("never offers an online subscription card", () => {
        render();
        expect(document.body.textContent).not.toContain(
            "Online subscription"
        );
        expect(document.body.textContent).not.toContain(
            "Abonnement en ligne"
        );
    });

    it("has no URL field, since a local calendar has no feed of its own", () => {
        render();
        expect(
            document.querySelector('input[placeholder*="webcal"]')
        ).toBeNull();
    });
});
