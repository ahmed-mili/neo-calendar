/** @jest-environment jsdom */
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { selectAll } from "@codemirror/commands";
import {
    DescriptionEditor,
    DescriptionEditorHandle,
} from "./DescriptionEditor";

// CodeMirror measures text with ranges; jsdom has no layout.
beforeAll(() => {
    const rect = {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: 0,
        height: 0,
        toJSON: () => ({}),
    };
    const rects = () => ({
        length: 0,
        item: () => null,
        [Symbol.iterator]: function* () {},
    });
    (Range.prototype as any).getClientRects = rects;
    (Range.prototype as any).getBoundingClientRect = () => rect;
    (document as any).elementFromPoint = () => null;
});

let host: HTMLDivElement;
beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
});
afterEach(() => {
    ReactDOM.unmountComponentAtNode(host);
    host.remove();
});

function mount(props: Partial<React.ComponentProps<typeof DescriptionEditor>>) {
    const ref = React.createRef<DescriptionEditorHandle>();
    act(() => {
        ReactDOM.render(
            <DescriptionEditor ref={ref} value="" {...props} />,
            host
        );
    });
    return ref;
}

const DOC = "- [ ] a\n- [x] b\n- item\nTotal [lien](https://a.b) fin";

describe("DescriptionEditor", () => {
    test("draws boxes, bullets and links; the caret away from them", () => {
        const ref = mount({ value: DOC });
        // The initial caret is at 0, inside the first task marker (raw).
        act(() => ref.current!.setSelection(DOC.length));
        expect(host.querySelectorAll(".nc-desc-checkbox")).toHaveLength(2);
        expect(
            host.querySelector(".nc-desc-checkbox[aria-checked=true]")
        ).not.toBeNull();
        expect(host.querySelectorAll(".nc-desc-bullet")).toHaveLength(1);
        expect(host.querySelector(".nc-desc-link")?.textContent).toBe("lien");
        expect(host.querySelector(".cm-content")?.textContent).not.toContain(
            "https://a.b"
        );
    });

    test("the caret on a link shows its raw syntax", () => {
        const ref = mount({ value: DOC });
        const at = DOC.indexOf("[lien]");
        act(() => ref.current!.setSelection(at));
        expect(host.querySelector(".cm-content")?.textContent).toContain(
            "[lien](https://a.b)"
        );
        expect(host.querySelector(".nc-desc-link")).toBeNull();
    });

    test("clicking a box toggles it, keeps the caret, then reports", () => {
        const changes: string[] = [];
        const calls: string[] = [];
        const ref = mount({
            value: DOC,
            onChange: (text) => {
                changes.push(text);
                calls.push("change");
            },
            onToggle: () => calls.push("toggle"),
        });
        act(() => ref.current!.setSelection(DOC.length));
        const box = host.querySelector(".nc-desc-checkbox") as HTMLElement;
        act(() => {
            box.dispatchEvent(
                new MouseEvent("mousedown", { bubbles: true, button: 0 })
            );
        });
        expect(changes[0].startsWith("- [x] a\n- [x] b")).toBe(true);
        expect(calls).toEqual(["change", "toggle"]);
        expect(ref.current!.getSelection().from).toBe(DOC.length);
    });

    test("clicking a link opens it, right click opens the menu", () => {
        const opened: string[] = [];
        const menus: string[] = [];
        const ref = mount({
            value: DOC,
            onOpenLink: (link) => opened.push(link.target),
            onLinkMenu: (link) => menus.push(link.label),
        });
        act(() => ref.current!.setSelection(DOC.length));
        const link = host.querySelector(".nc-desc-link") as HTMLElement;
        act(() => {
            link.dispatchEvent(
                new MouseEvent("mousedown", { bubbles: true, button: 0 })
            );
            link.dispatchEvent(
                new MouseEvent("contextmenu", { bubbles: true, button: 2 })
            );
        });
        expect(opened).toEqual(["https://a.b"]);
        expect(menus).toEqual(["lien"]);
    });

    test("a read-only editor draws the same, toggles nothing", () => {
        const changes: string[] = [];
        const ref = mount({
            value: DOC,
            editable: false,
            onChange: (text) => changes.push(text),
        });
        const box = host.querySelector(
            ".nc-desc-checkbox"
        ) as HTMLButtonElement;
        expect(box).not.toBeNull();
        expect(box.disabled).toBe(true);
        act(() => {
            box.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        });
        expect(changes).toEqual([]);
        expect(ref.current!.getView()!.state.doc.toString()).toBe(DOC);
        expect(
            host.querySelector(".cm-content")?.getAttribute("contenteditable")
        ).toBe("false");
    });

    test("shows the placeholder when empty", () => {
        mount({ value: "", placeholder: "Add a description" });
        expect(host.querySelector(".cm-placeholder")?.textContent).toBe(
            "Add a description"
        );
    });

    test("a different outside value is written, an equal one is not", () => {
        const ref = mount({ value: "abc" });
        const view = ref.current!.getView()!;
        act(() => ref.current!.setSelection(3));
        act(() => {
            ReactDOM.render(<DescriptionEditor ref={ref} value="abcd" />, host);
        });
        expect(view.state.doc.toString()).toBe("abcd");
        // The caret is mapped, not reset; the change is not an edit to report.
        expect(ref.current!.getSelection().from).toBe(3);
    });

    test("typing is reported once and the echo does not loop", () => {
        const changes: string[] = [];
        const ref = mount({
            value: "",
            onChange: (text) => changes.push(text),
        });
        act(() => ref.current!.replaceSelection("hello"));
        expect(changes).toEqual(["hello"]);
        act(() => {
            ReactDOM.render(
                <DescriptionEditor
                    ref={ref}
                    value="hello"
                    onChange={(text) => changes.push(text)}
                />,
                host
            );
        });
        expect(changes).toEqual(["hello"]);
    });

    test("Enter continues a task, Ctrl+B bolds, Tab indents", () => {
        const ref = mount({ value: "- [ ] a" });
        const view = ref.current!.getView()!;
        const key = (init: KeyboardEventInit) =>
            act(() => {
                view.contentDOM.dispatchEvent(
                    new KeyboardEvent("keydown", {
                        bubbles: true,
                        cancelable: true,
                        ...init,
                    })
                );
            });
        act(() => ref.current!.setSelection(7));
        key({ key: "Enter", keyCode: 13 });
        expect(view.state.doc.toString()).toBe("- [ ] a\n- [ ] ");
        key({ key: "Tab", keyCode: 9 });
        expect(view.state.doc.toString()).toBe("- [ ] a\n\t- [ ] ");
        act(() => ref.current!.setSelection(2, 3));
        key({ key: "b", keyCode: 66, ctrlKey: true });
        expect(view.state.doc.toString()).toBe("- **[** ] a\n\t- [ ] ");
    });

    test("Ctrl+A selects everything, across lines", () => {
        const ref = mount({ value: DOC });
        const view = ref.current!.getView()!;
        act(() => {
            selectAll(view);
        });
        expect(ref.current!.getSelection().text).toBe(DOC);
    });

    test("the toolbar formats the selection with the same rules", () => {
        const ref = mount({ value: "ab\ncd" });
        act(() => ref.current!.setSelection(0, 2));
        act(() => ref.current!.applyFormat("bold"));
        expect(ref.current!.getView()!.state.doc.toString()).toBe("**ab**\ncd");
        act(() => ref.current!.setSelection(0, 9));
        act(() => ref.current!.applyFormat("checklist"));
        expect(ref.current!.getView()!.state.doc.toString()).toBe(
            "- [ ] **ab**\n- [ ] cd"
        );
    });

    test("onPaste can take over a paste", () => {
        const seen: string[] = [];
        const ref = mount({
            value: "",
            onPaste: (text) => {
                seen.push(text);
                return true;
            },
        });
        const view = ref.current!.getView()!;
        const event = new Event("paste", { bubbles: true, cancelable: true });
        (event as any).clipboardData = { getData: () => "https://a.b" };
        act(() => {
            view.contentDOM.dispatchEvent(event);
        });
        expect(seen).toEqual(["https://a.b"]);
        expect(event.defaultPrevented).toBe(true);
    });
});
