/** @jest-environment jsdom */
import { OPEN_DESCRIPTION_LINK_DIALOG_EVENT } from "../../../src/ui/calendar/descriptionLinkShortcut";
import "./desktopDescriptionShortcuts";

/** A description section whose editor is the CodeMirror content element. */
function mountSection() {
    const section = document.createElement("div");
    section.className = "nc-description-section";
    const editor = document.createElement("div");
    editor.className = "cm-editor";
    const content = document.createElement("div");
    content.className = "cm-content";
    content.setAttribute("contenteditable", "true");
    editor.appendChild(content);
    section.appendChild(editor);
    document.body.appendChild(section);
    return { section, content };
}

const ctrl = (key: string) =>
    new KeyboardEvent("keydown", {
        key,
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
    });

describe("desktop description shortcuts", () => {
    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("opens the description link dialog event with Ctrl+K", () => {
        const { section, content } = mountSection();
        const opened = jest.fn();
        section.addEventListener(OPEN_DESCRIPTION_LINK_DIALOG_EVENT, opened);

        const event = ctrl("k");
        content.dispatchEvent(event);

        expect(opened).toHaveBeenCalledTimes(1);
        expect(event.defaultPrevented).toBe(true);
    });

    it("keeps Ctrl+K scoped to a description editor", () => {
        const field = document.createElement("textarea");
        document.body.appendChild(field);
        const event = ctrl("k");

        field.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(false);
    });

    it("presses the toolbar's Underline button with Ctrl+U", () => {
        const { section, content } = mountSection();
        const button = document.createElement("button");
        button.className = "nc-description-tool";
        button.dataset.formatCommand = "underline";
        const clicked = jest.fn();
        button.addEventListener("click", clicked);
        section.appendChild(button);

        const event = ctrl("u");
        content.dispatchEvent(event);

        expect(clicked).toHaveBeenCalledTimes(1);
        expect(event.defaultPrevented).toBe(true);
    });

    it("leaves Ctrl+B, Ctrl+I and Ctrl+L to the editor's own keymap", () => {
        const { section, content } = mountSection();
        for (const command of ["bold", "italic", "checklist"]) {
            const button = document.createElement("button");
            button.className = "nc-description-tool";
            button.dataset.formatCommand = command;
            const clicked = jest.fn();
            button.addEventListener("click", clicked);
            section.appendChild(button);
            const key = { bold: "b", italic: "i", checklist: "l" }[command]!;

            const event = ctrl(key);
            content.dispatchEvent(event);

            expect(clicked).not.toHaveBeenCalled();
            expect(event.defaultPrevented).toBe(false);
        }
    });
});
