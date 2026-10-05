/** @jest-environment jsdom */
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { DescriptionEditor } from "../../../src/ui/calendar/description/DescriptionEditor";
import {
    docOf,
    editorViewIn,
    selectIn,
    stubEditorLayout,
    typeInto,
} from "../../../src/ui/calendar/description/editorTestSupport";
import {
    captureEditTarget,
    editorOwnsCommand,
    runEditorCommand,
} from "./desktopEditCommands";

beforeAll(stubEditorLayout);

/* The Edit menu of the app must act on the description editor, with its own
   history, when the focus was inside it: the app-wide Undo is the deletion
   history (an event brought back), which has nothing to do with typed text. */
describe("Edit menu commands on the description editor", () => {
    let host: HTMLDivElement;
    const written = jest.fn();

    beforeEach(() => {
        host = document.createElement("div");
        document.body.appendChild(host);
        written.mockClear();
        act(() => {
            ReactDOM.render(
                <DescriptionEditor value="" onChange={written} />,
                host
            );
        });
    });
    afterEach(() => {
        act(() => {
            ReactDOM.unmountComponentAtNode(host);
        });
        host.remove();
    });

    /** What the menu does on opening: remember the focused field. */
    const captured = () => {
        const view = editorViewIn(host);
        act(() => view.focus());
        // jsdom keeps no DOM selection for a contenteditable: give it one.
        const range = document.createRange();
        range.selectNodeContents(view.contentDOM);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);
        return { view, snapshot: captureEditTarget() };
    };

    it("recognises the editor as the owner of the text commands", () => {
        const { snapshot } = captured();
        for (const id of ["undo", "redo", "cut", "copy", "paste", "select-all"]) {
            expect(editorOwnsCommand(snapshot, id)).toBe(true);
        }
        // Anything else stays the calendar's.
        expect(editorOwnsCommand(snapshot, "duplicate")).toBe(false);
        expect(editorOwnsCommand(null, "undo")).toBe(false);
    });

    it("undoes and redoes the typed text through the editor history", () => {
        const { view, snapshot } = captured();
        act(() => typeInto(view, "hello"));
        expect(docOf(view)).toBe("hello");

        act(() => {
            runEditorCommand(snapshot, "undo");
        });
        expect(docOf(view)).toBe("");
        expect(written).toHaveBeenLastCalledWith("");

        act(() => {
            runEditorCommand(snapshot, "redo");
        });
        expect(docOf(view)).toBe("hello");
        expect(written).toHaveBeenLastCalledWith("hello");
    });

    it("selects the whole text with Select all", () => {
        const { view, snapshot } = captured();
        act(() => typeInto(view, "a\nb"));
        act(() => selectIn(view, 0));

        act(() => {
            runEditorCommand(snapshot, "select-all");
        });

        expect(view.state.selection.main.from).toBe(0);
        expect(view.state.selection.main.to).toBe(3);
    });

    it("cuts the selection to the clipboard and deletes it", () => {
        const writeText = jest.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: { writeText },
        });
        const { view, snapshot } = captured();
        act(() => typeInto(view, "abc"));
        act(() => selectIn(view, 1, 3));

        act(() => {
            runEditorCommand(snapshot, "cut");
        });

        expect(writeText).toHaveBeenCalledWith("bc");
        expect(docOf(view)).toBe("a");
    });

    it("does nothing for a field that is not the editor", () => {
        const input = document.createElement("input");
        document.body.appendChild(input);
        input.focus();
        const snapshot = captureEditTarget();
        expect(editorOwnsCommand(snapshot, "undo")).toBe(false);
        expect(runEditorCommand(snapshot, "undo")).toBe(false);
        input.remove();
    });
});
