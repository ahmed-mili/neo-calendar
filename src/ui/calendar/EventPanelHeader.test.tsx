/** @jest-environment jsdom */
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act, Simulate } from "react-dom/test-utils";
import { PanelHeader, TitleRow } from "./EventPanelRows";
import { t } from "../i18n";

function titleNativeInput(field: HTMLInputElement, value: string) {
    const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
    )?.set;
    expect(setter).toBeTruthy();
    act(() => {
        field.dispatchEvent(
            new KeyboardEvent("keydown", {
                key: value.slice(-1),
                bubbles: true,
            })
        );
        field.dispatchEvent(
            new InputEvent("beforeinput", {
                bubbles: true,
                inputType: "insertText",
                data: value.slice(-1),
            })
        );
        setter?.call(field, value);
        field.dispatchEvent(
            new InputEvent("input", {
                bubbles: true,
                inputType: "insertText",
                data: value.slice(-1),
            })
        );
    });
}

describe("event panel header refresh", () => {
    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("opens the type menu without starting panel drag and changes kind", () => {
        const host = document.createElement("div");
        document.body.appendChild(host);
        const setKind = jest.fn();
        const onHeaderMouseDown = jest.fn();
        const menuRef = React.createRef<HTMLDivElement>();
        const headerRef = React.createRef<HTMLDivElement>();

        act(() => {
            ReactDOM.render(
                <PanelHeader
                    isDraft={false}
                    isTask={false}
                    kind="event"
                    setKind={setKind}
                    editable={true}
                    eventId="event.md"
                    menuOpen={false}
                    menuRef={menuRef}
                    headerRef={headerRef}
                    onHeaderMouseDown={onHeaderMouseDown}
                    onToggleMenu={() => {}}
                    onOpenFile={() => {}}
                    onDeleteClick={() => {}}
                    onClose={() => {}}
                />,
                host
            );
        });

        const trigger = host.querySelector(
            ".nc-panel-kind-trigger"
        ) as HTMLButtonElement;
        expect(trigger).toBeTruthy();
        act(() => {
            Simulate.mouseDown(trigger, { button: 0 });
            Simulate.click(trigger);
        });
        expect(onHeaderMouseDown).not.toHaveBeenCalled();

        const task = document.body.querySelector(
            ".nc-panel-kind-option[data-kind='task']"
        ) as HTMLButtonElement;
        expect(task).toBeTruthy();
        act(() => Simulate.click(task));
        expect(setKind).toHaveBeenCalledWith("task");
    });

    it("keeps Title on the native keyboard to DOM to React path", () => {
        const host = document.createElement("div");
        document.body.appendChild(host);

        function Harness() {
            const [title, setTitle] = React.useState("");
            const ref = React.useRef<HTMLInputElement>(null);
            return (
                <TitleRow
                    title={title}
                    editable={true}
                    inputRef={ref}
                    onChange={setTitle}
                    onCommit={() => {}}
                />
            );
        }

        act(() => {
            ReactDOM.render(<Harness />, host);
        });
        const field = host.querySelector(
            ".nc-panel-title-input"
        ) as HTMLInputElement;
        expect(field.placeholder).toBe(t("Title"));
        expect(host.querySelector(".nc-panel-title-icon")).toBeNull();

        act(() => field.focus());
        expect(document.activeElement).toBe(field);
        titleNativeInput(field, "T");
        titleNativeInput(field, "Ti");
        titleNativeInput(field, "Title");
        expect(field.value).toBe("Title");

        field.setSelectionRange(4, 5);
        act(() => {
            field.dispatchEvent(
                new KeyboardEvent("keydown", {
                    key: "Backspace",
                    bubbles: true,
                })
            );
            const setter = Object.getOwnPropertyDescriptor(
                HTMLInputElement.prototype,
                "value"
            )?.set;
            setter?.call(field, "Titl");
            field.dispatchEvent(
                new InputEvent("input", {
                    bubbles: true,
                    inputType: "deleteContentBackward",
                })
            );
        });
        expect(field.value).toBe("Titl");
    });
});
