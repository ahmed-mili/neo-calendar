/** @jest-environment jsdom */
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { DescriptionSection } from "./DescriptionSection";
import { applyLanguage } from "../i18n";
import {
    docOf,
    editorViewIn,
    selectIn,
    stubEditorLayout,
    typeInto,
} from "./description/editorTestSupport";

beforeAll(stubEditorLayout);

const NOTE = "- [ ] Micro (99 €)\n- [ ] Plateau (229 €)\nTotal : environ 328 €";

function Harness({ initial }: { initial: string }) {
    const [description, setDescription] = React.useState(initial);
    return (
        <DescriptionSection
            description={description}
            editable={true}
            setDescription={setDescription}
            onCommit={() => {}}
            eventId="Calendrier/2026-09-12.md"
            vaults={[]}
            items={[]}
        />
    );
}

/* Ctrl+A is the editor's own: ONE selection over the whole text, across lines,
   boxes and links, with nothing to swap in or out. */
describe("Ctrl+A in a description", () => {
    let container: HTMLDivElement;

    beforeEach(() => {
        applyLanguage("fr");
        container = document.createElement("div");
        document.body.appendChild(container);
        act(() => {
            ReactDOM.render(<Harness initial={NOTE} />, container);
        });
    });

    afterEach(() => {
        act(() => {
            ReactDOM.unmountComponentAtNode(container);
        });
        container.remove();
    });

    /** Puts the caret in the prose line and presses Ctrl+A. */
    const pressSelectAll = () => {
        const view = editorViewIn(container);
        act(() => selectIn(view, NOTE.length));
        act(() => {
            view.contentDOM.dispatchEvent(
                new KeyboardEvent("keydown", {
                    key: "a",
                    ctrlKey: true,
                    bubbles: true,
                    cancelable: true,
                })
            );
        });
        return view;
    };

    it("selects the whole description, not just the line the caret is on", () => {
        const view = pressSelectAll();
        const { from, to } = view.state.selection.main;
        expect(from).toBe(0);
        expect(to).toBe(NOTE.length);
    });

    it("stays one editor: no whole-text field takes its place, and the lines draw again once the selection is left", () => {
        const view = pressSelectAll();
        expect(container.querySelector("textarea")).toBeNull();
        expect(container.querySelectorAll(".cm-editor")).toHaveLength(1);
        act(() => selectIn(view, NOTE.length));
        expect(container.querySelectorAll(".nc-desc-checkbox").length).toBe(2);
    });

    it("replaces everything selected by what is typed", () => {
        const view = pressSelectAll();
        act(() => typeInto(view, "- [ ] repartir de zéro"));
        expect(docOf(view)).toBe("- [ ] repartir de zéro");
        expect(container.querySelectorAll(".nc-desc-checkbox").length).toBe(1);
        expect(container.textContent).toContain("repartir de zéro");
    });
});
