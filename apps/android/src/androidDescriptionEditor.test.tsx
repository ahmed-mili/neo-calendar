/** @jest-environment jsdom */
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { DescriptionSection } from "../../../src/ui/calendar/DescriptionSection";
import {
    docOf,
    editorViewIn,
    stubEditorLayout,
    typeInto,
} from "../../../src/ui/calendar/description/editorTestSupport";
import "./androidDescriptionEditor";

beforeAll(stubEditorLayout);

function Harness({
    eventId = "Calendrier/2026-08-29.md",
}: {
    eventId?: string | null;
}) {
    const [description, setDescription] = React.useState("");
    return (
        <DescriptionSection
            description={description}
            editable={true}
            setDescription={setDescription}
            onCommit={() => {}}
            eventId={eventId}
            vaults={[]}
            items={[]}
            onPickAttachment={async () => {}}
        />
    );
}

describe("Android description editor", () => {
    let container: HTMLDivElement;

    beforeEach(() => {
        document.documentElement.classList.add("nc-platform-android");
        document.body.classList.add("nc-platform-android");
        container = document.createElement("div");
        document.body.appendChild(container);
    });
    afterEach(() => {
        act(() => {
            ReactDOM.unmountComponentAtNode(container);
        });
        container.remove();
        document.getElementById("nc-description-android-accessory")?.remove();
        document.documentElement.classList.remove("nc-platform-android");
        document.body.classList.remove("nc-platform-android");
    });
    const press = (button: HTMLElement) => {
        act(() => {
            button.dispatchEvent(
                new MouseEvent("pointerdown", {
                    bubbles: true,
                    cancelable: true,
                    button: 0,
                })
            );
            button.dispatchEvent(
                new MouseEvent("pointerup", {
                    bubbles: true,
                    cancelable: true,
                    button: 0,
                })
            );
            button.dispatchEvent(
                new MouseEvent("click", {
                    bubbles: true,
                    cancelable: true,
                    button: 0,
                })
            );
        });
    };
    it("keeps the accessory visible when the professional format control opens the horizontal strip", () => {
        act(() => {
            ReactDOM.render(<Harness />, container);
        });
        const view = editorViewIn(container);
        const row = container.querySelector(
            ".nc-description-composer"
        ) as HTMLDivElement;
        const section = row.closest(
            ".nc-description-section"
        ) as HTMLDivElement;
        const icon = row.querySelector(
            ":scope > .nc-panel-row-icon"
        ) as HTMLElement;
        expect(icon.hasAttribute("data-nc-description-action")).toBe(false);
        expect(
            document.getElementById("nc-description-android-accessory")
        ).toBeNull();
        act(() => {
            row.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        expect(document.activeElement).toBe(view.contentDOM);
        expect(icon.hasAttribute("data-nc-description-action")).toBe(false);
        const accessory = document.getElementById(
            "nc-description-android-accessory"
        ) as HTMLDivElement;
        expect(accessory).toBeTruthy();
        expect(accessory.hidden).toBe(false);
        expect(accessory.dataset.mode).toBe("compact");
        expect(
            accessory.querySelector(
                '[data-nc-description-command="attachment"]'
            )
        ).toBeTruthy();
        const formatToggle = accessory.querySelector(
            '.nc-description-android-compact [data-nc-description-accessory="format"]'
        ) as HTMLButtonElement;
        expect(formatToggle.textContent?.trim()).toBe("");
        expect(formatToggle.querySelector("svg")).toBeTruthy();

        // Exact regression: before the fix the section itself received the
        // .nc-description-android-expanded class. CSS gives that class
        // display:none for the accessory's inner view, which hid the editor,
        // caused focusout, and then hid the whole accessory.
        press(formatToggle);
        expect(accessory.isConnected).toBe(true);
        expect(accessory.hidden).toBe(false);
        expect(accessory.dataset.mode).toBe("expanded");
        expect(
            section.classList.contains("nc-description-android-expanded")
        ).toBe(false);
        expect(
            section.classList.contains("nc-description-android-formatting-open")
        ).toBe(true);
        const strip = accessory.querySelector(
            ".nc-description-android-format-scroll"
        ) as HTMLDivElement;
        expect(strip).toBeTruthy();
        expect(icon.hasAttribute("data-nc-description-action")).toBe(false);
        expect(document.activeElement).toBe(view.contentDOM);
        expect(
            Array.from(
                strip.querySelectorAll<HTMLButtonElement>(
                    ".nc-description-android-format-button"
                )
            ).every((button) => Boolean(button.querySelector("svg")))
        ).toBe(true);
        expect(strip.textContent).not.toContain("Tx");
        expect(strip.textContent).not.toContain("☑");
        expect(strip.textContent).not.toContain("•≡");
        expect(strip.textContent).not.toContain("1≡");

        // A strip command acts on the editor selection and leaves it focused.
        const bold = accessory.querySelector(
            '[data-nc-description-command="bold"]'
        ) as HTMLButtonElement;
        press(bold);
        expect(docOf(view)).toBe("****");
        expect(document.activeElement).toBe(view.contentDOM);
        act(() => typeInto(view, "a"));
        expect(docOf(view)).toBe("**a**");
        expect(document.activeElement).toBe(view.contentDOM);

        const expandedToggle = accessory.querySelector(
            '.nc-description-android-expanded [data-nc-description-accessory="format"]'
        ) as HTMLButtonElement;
        expect(expandedToggle.textContent?.trim()).toBe("");
        expect(expandedToggle.querySelector("svg")).toBeTruthy();
        press(expandedToggle);
        expect(accessory.hidden).toBe(false);
        expect(accessory.dataset.mode).toBe("compact");
        expect(document.activeElement).toBe(view.contentDOM);
    });
    it("keeps undo and redo fixed at the far right and follows the editor history", () => {
        act(() => {
            ReactDOM.render(<Harness />, container);
        });
        const view = editorViewIn(container);
        const row = container.querySelector(
            ".nc-description-composer"
        ) as HTMLDivElement;
        act(() => {
            row.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        const accessory = document.getElementById(
            "nc-description-android-accessory"
        ) as HTMLDivElement;
        const formatToggle = accessory.querySelector(
            '.nc-description-android-compact [data-nc-description-accessory="format"]'
        ) as HTMLButtonElement;
        press(formatToggle);

        const strip = accessory.querySelector(
            ".nc-description-android-format-scroll"
        ) as HTMLDivElement;
        const history = accessory.querySelector(
            ".nc-description-android-history"
        ) as HTMLDivElement;
        const undo = history.querySelector(
            '[data-nc-description-history="undo"]'
        ) as HTMLButtonElement;
        const redo = history.querySelector(
            '[data-nc-description-history="redo"]'
        ) as HTMLButtonElement;
        expect(strip.nextElementSibling).toBe(history);
        expect(undo.querySelector("svg")).toBeTruthy();
        expect(redo.querySelector("svg")).toBeTruthy();
        expect(undo.disabled).toBe(true);
        expect(redo.disabled).toBe(true);

        act(() => typeInto(view, "a"));
        expect(docOf(view)).toBe("a");
        expect(undo.disabled).toBe(false);
        expect(redo.disabled).toBe(true);

        // Undo is CodeMirror's history, not the document-wide editing history.
        press(undo);
        expect(docOf(view)).toBe("");
        expect(document.activeElement).toBe(view.contentDOM);
        expect(undo.disabled).toBe(true);
        expect(redo.disabled).toBe(false);

        press(redo);
        expect(docOf(view)).toBe("a");
        expect(document.activeElement).toBe(view.contentDOM);
        expect(undo.disabled).toBe(false);
        expect(redo.disabled).toBe(true);

        // A new edit after an undo drops the redo branch.
        press(undo);
        expect(redo.disabled).toBe(false);
        act(() => typeInto(view, "b"));
        expect(docOf(view)).toBe("b");
        expect(redo.disabled).toBe(true);
    });
    it("keeps a new draft on the Android keyboard path with no + and accepts typing", () => {
        act(() => {
            ReactDOM.render(<Harness eventId={null} />, container);
        });
        const view = editorViewIn(container);
        const row = container.querySelector(
            ".nc-description-composer"
        ) as HTMLDivElement;
        const icon = row.querySelector(
            ":scope > .nc-panel-row-icon"
        ) as HTMLElement;
        act(() => {
            row.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        const accessory = document.getElementById(
            "nc-description-android-accessory"
        ) as HTMLDivElement;
        const attachment = accessory.querySelector(
            '[data-nc-description-command="attachment"]'
        ) as HTMLButtonElement;
        expect(document.activeElement).toBe(view.contentDOM);
        expect(icon.hasAttribute("data-nc-description-action")).toBe(false);
        expect(accessory.hidden).toBe(false);
        expect(accessory.dataset.mode).toBe("compact");
        expect(attachment.disabled).toBe(true);
        act(() => typeInto(view, "d"));
        expect(docOf(view)).toBe("d");
        expect(document.activeElement).toBe(view.contentDOM);
    });
});
