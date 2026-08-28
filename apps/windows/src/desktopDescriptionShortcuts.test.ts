/** @jest-environment jsdom */
import { OPEN_DESCRIPTION_LINK_DIALOG_EVENT } from "../../../src/ui/calendar/descriptionLinkShortcut";
import "./desktopDescriptionShortcuts";

describe("desktop description shortcuts", () => {
    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("opens the description link dialog event with Ctrl+K", () => {
        const section = document.createElement("div");
        section.className = "nc-description-section";
        const field = document.createElement("textarea");
        section.appendChild(field);
        document.body.appendChild(section);

        const opened = jest.fn();
        section.addEventListener(OPEN_DESCRIPTION_LINK_DIALOG_EVENT, opened);

        const event = new KeyboardEvent("keydown", {
            key: "k",
            ctrlKey: true,
            bubbles: true,
            cancelable: true,
        });
        field.dispatchEvent(event);

        expect(opened).toHaveBeenCalledTimes(1);
        expect(event.defaultPrevented).toBe(true);
    });

    it("keeps Ctrl+K scoped to an active description textarea", () => {
        const field = document.createElement("textarea");
        document.body.appendChild(field);
        const event = new KeyboardEvent("keydown", {
            key: "k",
            ctrlKey: true,
            bubbles: true,
            cancelable: true,
        });

        field.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(false);
    });
});
