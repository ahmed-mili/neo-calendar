/** @jest-environment jsdom */
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { DescriptionSection } from "./DescriptionSection";
import { applyLanguage } from "../i18n";
import {
    docOf,
    editorViewIn,
    stubEditorLayout,
} from "./description/editorTestSupport";

beforeAll(stubEditorLayout);

function Harness({
    initial = "",
    editable = true,
    onCommit = () => {},
}: {
    initial?: string;
    editable?: boolean;
    onCommit?: () => void;
}) {
    const [description, setDescription] = React.useState(initial);
    return (
        <DescriptionSection
            description={description}
            editable={editable}
            setDescription={setDescription}
            onCommit={onCommit}
            eventId="Calendrier/2026-10-05.md"
            vaults={[]}
            items={[]}
            onPickAttachment={async () => {}}
        />
    );
}

/* The description is ONE editor in every state: empty, prose, checklist,
   links, read-only. What the panel promises around it stays. */
describe("DescriptionSection around the editor", () => {
    let container: HTMLDivElement;

    beforeEach(() => {
        applyLanguage("en");
        container = document.createElement("div");
        document.body.appendChild(container);
    });
    afterEach(() => {
        act(() => {
            ReactDOM.unmountComponentAtNode(container);
        });
        container.remove();
        applyLanguage("fr");
    });

    const mount = (props: React.ComponentProps<typeof Harness> = {}) => {
        act(() => {
            ReactDOM.render(<Harness {...props} />, container);
        });
        return editorViewIn(container);
    };
    const paste = (view: ReturnType<typeof editorViewIn>, text: string) => {
        const event = new Event("paste", { bubbles: true, cancelable: true });
        (event as any).clipboardData = { getData: () => text };
        act(() => {
            view.contentDOM.dispatchEvent(event);
        });
        return event;
    };

    it.each([
        ["empty", ""],
        ["prose", "just a sentence"],
        ["checklist", "- [ ] a\n- [x] b"],
        ["links", "see [Elgato](https://example.com/mic)"],
    ])("is a single editor when the description is %s", (_state, text) => {
        mount({ initial: text });
        expect(container.querySelectorAll(".cm-editor")).toHaveLength(1);
        expect(container.querySelector("textarea")).toBeNull();
        expect(container.querySelector(".nc-panel-checklist-edit")).toBeNull();
    });

    it("invites to write when empty and editable, with the translated prompt", () => {
        mount();
        expect(
            container.querySelector(".cm-placeholder")?.textContent
        ).toBe("Add a description");
    });

    it("turns a pasted bare address into a titled link", () => {
        const view = mount();
        const event = paste(view, "https://example.com/path");
        expect(event.defaultPrevented).toBe(true);
        expect(docOf(view)).toMatch(/^\[.+\]\(https:\/\/example\.com\/path\)$/);
    });

    it("leaves any other paste to the editor", () => {
        const view = mount();
        const event = paste(view, "plain words");
        expect(docOf(view)).not.toMatch(/\]\(/);
        // The panel does not claim it; the editor's own paste inserts it.
        expect(docOf(view)).toBe("plain words");
    });

    it("commits when the editor loses the focus", () => {
        const onCommit = jest.fn();
        const view = mount({ initial: "a", onCommit });
        act(() => view.focus());
        expect(onCommit).not.toHaveBeenCalled();
        act(() => (view.contentDOM as HTMLElement).blur());
        expect(onCommit).toHaveBeenCalledTimes(1);
    });

    it("commits after a checkbox is toggled, with the new text written first", () => {
        const onCommit = jest.fn();
        const view = mount({ initial: "- [ ] a\nb", onCommit });
        const box = container.querySelector(
            ".nc-desc-checkbox"
        ) as HTMLElement;
        act(() => {
            box.dispatchEvent(
                new MouseEvent("mousedown", { bubbles: true, button: 0 })
            );
        });
        expect(docOf(view)).toBe("- [x] a\nb");
        expect(onCommit).toHaveBeenCalledTimes(1);
    });

    it("is read-only for an ICS event: same drawing, no editing, no prompt, no toolbar", () => {
        const view = mount({ initial: "- [ ] a\n[l](https://a.b)", editable: false });
        expect(view.contentDOM.getAttribute("contenteditable")).toBe("false");
        expect(container.querySelector('[role="toolbar"]')).toBeNull();
        expect(container.querySelector(".nc-desc-checkbox")).not.toBeNull();
        expect(
            (container.querySelector(".nc-desc-checkbox") as HTMLButtonElement)
                .disabled
        ).toBe(true);
        expect(container.querySelector(".nc-desc-link")).not.toBeNull();
    });

    it("puts the caret at the end on a click beside the text", () => {
        const view = mount({ initial: "- [ ] a\nb" });
        const row = container.querySelector(
            ".nc-description-composer"
        ) as HTMLElement;
        act(() => {
            row.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
            row.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        const { from, to } = view.state.selection.main;
        expect([from, to]).toEqual([9, 9]);
    });

    it("keeps a selection dragged out of the text and released beside it", () => {
        const view = mount({ initial: "- [ ] a\nb" });
        const row = container.querySelector(
            ".nc-description-composer"
        ) as HTMLElement;
        // The press lands in the text, the drag selects, the release lands on
        // the row: the click then goes to the row, the selection must stay.
        act(() => {
            view.contentDOM.dispatchEvent(
                new MouseEvent("mousedown", { bubbles: true })
            );
            view.dispatch({ selection: { anchor: 7, head: 2 } });
            row.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        const { anchor, head } = view.state.selection.main;
        expect([anchor, head]).toEqual([7, 2]);
    });

    it("says nothing at all when locked and empty", () => {
        mount({ editable: false });
        expect(container.querySelector(".cm-placeholder")).toBeNull();
        expect(
            container.querySelector(".nc-panel-row-desc--silent")
        ).not.toBeNull();
    });
});
