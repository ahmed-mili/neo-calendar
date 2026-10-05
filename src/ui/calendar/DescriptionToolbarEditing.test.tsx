/** @jest-environment jsdom */
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act, Simulate } from "react-dom/test-utils";
import { DescriptionSection } from "./DescriptionSection";
import {
    docOf,
    editorViewIn,
    stubEditorLayout,
    typeInto,
} from "./description/editorTestSupport";

beforeAll(stubEditorLayout);

// The toolbar acts on the CodeMirror selection and must leave the SAME editor
// focused, on desktop and in the WebView: nothing swaps renderer any more.
function Harness({ initial = "" }: { initial?: string }) {
    const [description, setDescription] = React.useState(initial);
    return (
        <DescriptionSection
            description={description}
            editable={true}
            setDescription={setDescription}
            onCommit={() => {}}
            eventId="Calendrier/2026-08-28.md"
            vaults={[]}
            items={[]}
            onPickAttachment={async () => {}}
        />
    );
}

describe("description toolbar keyboard editing", () => {
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
    });

    const mount = (initial = "") => {
        act(() => {
            ReactDOM.render(<Harness initial={initial} />, container);
        });
        return editorViewIn(container);
    };
    const tool = (command: string) =>
        container.querySelector(
            `button[data-format-command='${command}']`
        ) as HTMLButtonElement;
    const press = (button: HTMLButtonElement) =>
        act(() => {
            Simulate.mouseDown(button, { button: 0 });
            Simulate.click(button);
        });

    it("keeps the editor focused when the checklist command writes a task", () => {
        const view = mount();
        act(() => view.focus());

        press(tool("checklist"));

        expect(docOf(view)).toBe("- [ ] ");
        expect(document.activeElement).toBe(view.contentDOM);
        // Same editor, same element: no field was swapped for another.
        expect(editorViewIn(container)).toBe(view);
        expect(container.querySelector("textarea")).toBeNull();

        act(() => typeInto(view, "hello"));
        expect(docOf(view)).toBe("- [ ] hello");
    });

    it("keeps the same editor focused when typing turns the line into a checklist", () => {
        const view = mount();
        act(() => view.focus());

        act(() => typeInto(view, "- [ ] "));

        expect(editorViewIn(container)).toBe(view);
        expect(document.activeElement).toBe(view.contentDOM);
        expect(container.querySelector(".nc-desc-checkbox")).not.toBeNull();
    });

    it("formats an existing checklist in place, caret end of the text", () => {
        const view = mount("- [ ] Existing");

        press(tool("bold"));

        // Before any click the caret goes to the end, a word: the whole word.
        expect(docOf(view)).toBe("- [ ] **Existing**");
        expect(document.activeElement).toBe(view.contentDOM);
        expect(editorViewIn(container)).toBe(view);
    });

    it("focuses the editor when the unified Description surface is clicked", () => {
        const view = mount();
        const composer = container.querySelector(
            ".nc-description-composer"
        ) as HTMLDivElement;
        expect(document.activeElement).not.toBe(view.contentDOM);

        act(() => Simulate.click(composer));
        expect(document.activeElement).toBe(view.contentDOM);

        act(() => typeInto(view, "hello from the keyboard"));
        expect(docOf(view)).toBe("hello from the keyboard");
    });

    it("accepts typing between the stars Bold creates on an empty line", () => {
        const view = mount();

        press(tool("bold"));

        expect(docOf(view)).toBe("****");
        expect(view.state.selection.main.head).toBe(2);
        expect(document.activeElement).toBe(view.contentDOM);

        act(() => typeInto(view, "hello"));
        expect(docOf(view)).toBe("**hello**");
    });

    it("writes italic with asterisks, as Obsidian does", () => {
        const view = mount();

        press(tool("italic"));

        expect(docOf(view)).toBe("**");
        expect(view.state.selection.main.head).toBe(1);
    });
});
