/** @jest-environment jsdom */
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { DescriptionSection } from "../../../src/ui/calendar/DescriptionSection";
import "./androidDescriptionEditor";

function Harness() {
    const [description, setDescription] = React.useState("");
    return (
        <DescriptionSection
            description={description}
            editable={true}
            setDescription={setDescription}
            onCommit={() => {}}
            eventId="Calendrier/2026-08-29.md"
            vaults={[]}
            items={[]}
            onPickAttachment={async () => {}}
        />
    );
}

describe("Android description editor", () => {
    let container: HTMLDivElement;
    let animationFrames: FrameRequestCallback[];
    const originalRequestAnimationFrame = window.requestAnimationFrame;

    beforeEach(() => {
        document.documentElement.classList.add("nc-platform-android");
        document.body.classList.add("nc-platform-android");
        container = document.createElement("div");
        document.body.appendChild(container);
        animationFrames = [];
        window.requestAnimationFrame = (callback: FrameRequestCallback) => {
            animationFrames.push(callback);
            return animationFrames.length;
        };
    });

    afterEach(() => {
        act(() => {
            ReactDOM.unmountComponentAtNode(container);
        });
        container.remove();
        document.getElementById("nc-description-android-accessory")?.remove();
        document.documentElement.classList.remove("nc-platform-android");
        document.body.classList.remove("nc-platform-android");
        window.requestAnimationFrame = originalRequestAnimationFrame;
    });

    const flushAnimationFrames = () => {
        const callbacks = animationFrames.splice(0);
        act(() => callbacks.forEach((callback) => callback(0)));
    };

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
                new MouseEvent("click", {
                    bubbles: true,
                    cancelable: true,
                    button: 0,
                })
            );
        });
    };

    const nativeKeyboardEdit = (
        field: HTMLTextAreaElement,
        value: string,
        key: string,
        inputType: string,
        data: string | null
    ) => {
        const setter = Object.getOwnPropertyDescriptor(
            HTMLTextAreaElement.prototype,
            "value"
        )?.set;
        expect(setter).toBeTruthy();

        act(() => {
            field.dispatchEvent(
                new KeyboardEvent("keydown", {
                    key,
                    bubbles: true,
                    cancelable: true,
                })
            );
            setter?.call(field, value);
            field.dispatchEvent(
                new InputEvent("input", {
                    bubbles: true,
                    inputType,
                    data,
                })
            );
            field.dispatchEvent(
                new KeyboardEvent("keyup", { key, bubbles: true })
            );
        });
    };

    it("shows paperclip + A after Description focus, never a +, then exposes a horizontal formatting strip without breaking typing", () => {
        act(() => {
            ReactDOM.render(<Harness />, container);
        });

        const row = container.querySelector(
            ".nc-description-composer"
        ) as HTMLDivElement;
        const icon = row.querySelector(
            ":scope > .nc-panel-row-icon"
        ) as HTMLElement;
        const field = row.querySelector(
            "textarea[data-description-input='true']"
        ) as HTMLTextAreaElement;

        expect(icon.hasAttribute("data-nc-description-action")).toBe(false);
        expect(
            document.getElementById("nc-description-android-accessory")
        ).toBeNull();

        act(() => {
            row.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(document.activeElement).toBe(field);
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
            '[data-nc-description-accessory="format"]'
        ) as HTMLButtonElement;
        expect(formatToggle.textContent).toBe("A");
        press(formatToggle);

        expect(accessory.dataset.mode).toBe("expanded");
        expect(
            accessory.querySelector(".nc-description-android-format-scroll")
        ).toBeTruthy();
        expect(icon.hasAttribute("data-nc-description-action")).toBe(false);
        expect(document.activeElement).toBe(field);

        const bold = accessory.querySelector(
            '[data-nc-description-command="bold"]'
        ) as HTMLButtonElement;
        press(bold);
        flushAnimationFrames();

        expect(field.value).toBe("****");
        expect(document.activeElement).toBe(field);

        field.setSelectionRange(2, 2);
        nativeKeyboardEdit(field, "**a**", "a", "insertText", "a");
        expect(field.value).toBe("**a**");
        expect(document.activeElement).toBe(field);

        field.setSelectionRange(3, 3);
        nativeKeyboardEdit(
            field,
            "****",
            "Backspace",
            "deleteContentBackward",
            null
        );
        expect(field.value).toBe("****");
        expect(document.activeElement).toBe(field);
    });
});
