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
import "./desktopDescriptionEditor";

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

describe("desktop description editor", () => {
    let container: HTMLDivElement;
    beforeEach(() => {
        container = document.createElement("div");
        document.body.appendChild(container);
    });
    afterEach(() => {
        act(() => {
            ReactDOM.unmountComponentAtNode(container);
        });
        container.remove();
        document
            .querySelectorAll(".nc-description-menu-open")
            .forEach((node) =>
                node.classList.remove("nc-description-menu-open")
            );
    });

    it("keeps the Lines icon at rest, turns it into the + action only after activation, then accepts typing", () => {
        act(() => {
            ReactDOM.render(<Harness />, container);
        });
        const view = editorViewIn(container);
        const row = container.querySelector(
            ".nc-description-composer"
        ) as HTMLDivElement;
        const icon = row.querySelector(
            ":scope > .nc-panel-row-icon"
        ) as HTMLElement;
        expect(icon.hasAttribute("data-nc-description-action")).toBe(false);
        expect(row.classList.contains("nc-description-menu-open")).toBe(false);
        expect(document.activeElement).not.toBe(view.contentDOM);

        // A click on the row surface puts the caret in the editor.
        act(() => {
            row.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        expect(document.activeElement).toBe(view.contentDOM);
        expect(icon.dataset.ncDescriptionAction).toBe("add");
        expect(icon.getAttribute("aria-expanded")).toBe("false");
        expect(row.classList.contains("nc-description-menu-open")).toBe(false);

        // The + opens the formatting menu without taking the focus.
        act(() => {
            icon.dispatchEvent(
                new MouseEvent("pointerdown", {
                    bubbles: true,
                    cancelable: true,
                    button: 0,
                })
            );
        });
        expect(row.classList.contains("nc-description-menu-open")).toBe(true);
        expect(icon.getAttribute("aria-expanded")).toBe("true");
        expect(document.activeElement).toBe(view.contentDOM);

        // A menu command acts on the editor selection, closes the menu, and
        // leaves the editor focused.
        const bold = row.querySelector(
            "button[data-format-command='bold']"
        ) as HTMLButtonElement;
        act(() => {
            bold.dispatchEvent(
                new MouseEvent("mousedown", {
                    bubbles: true,
                    cancelable: true,
                    button: 0,
                })
            );
            bold.dispatchEvent(
                new MouseEvent("click", {
                    bubbles: true,
                    cancelable: true,
                    button: 0,
                })
            );
        });
        expect(docOf(view)).toBe("****");
        expect(document.activeElement).toBe(view.contentDOM);
        expect(row.classList.contains("nc-description-menu-open")).toBe(false);

        act(() => typeInto(view, "a"));
        expect(docOf(view)).toBe("**a**");
        expect(document.activeElement).toBe(view.contentDOM);
    });

    it("activates the same + transform for a new draft and accepts typing", () => {
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
        expect(icon.hasAttribute("data-nc-description-action")).toBe(false);

        act(() => {
            row.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        expect(document.activeElement).toBe(view.contentDOM);
        expect(icon.dataset.ncDescriptionAction).toBe("add");

        act(() => typeInto(view, "d"));
        expect(docOf(view)).toBe("d");
        expect(document.activeElement).toBe(view.contentDOM);
    });
});
