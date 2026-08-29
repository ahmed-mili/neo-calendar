/** @jest-environment jsdom */
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { DescriptionSection } from "../../../src/ui/calendar/DescriptionSection";
import "./desktopDescriptionEditor";

function Harness({ eventId = "Calendrier/2026-08-29.md" }: { eventId?: string | null }) {
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
    let animationFrames: FrameRequestCallback[];
    const originalRequestAnimationFrame = window.requestAnimationFrame;

    beforeEach(() => {
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
        document
            .querySelectorAll(".nc-description-menu-open")
            .forEach((node) =>
                node.classList.remove("nc-description-menu-open")
            );
        window.requestAnimationFrame = originalRequestAnimationFrame;
    });

    const flushAnimationFrames = () => {
        const callbacks = animationFrames.splice(0);
        act(() => callbacks.forEach((callback) => callback(0)));
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
                    cancelable: false,
                    inputType,
                    data,
                })
            );
            field.dispatchEvent(
                new KeyboardEvent("keyup", { key, bubbles: true })
            );
        });
    };

    it("keeps the Lines icon at rest, turns it into the + action only after activation, then accepts physical-style typing", () => {
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
        expect(row.classList.contains("nc-description-menu-open")).toBe(false);
        expect(document.activeElement).not.toBe(field);

        act(() => {
            row.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(document.activeElement).toBe(field);
        expect(icon.dataset.ncDescriptionAction).toBe("add");
        expect(icon.getAttribute("aria-expanded")).toBe("false");
        expect(row.classList.contains("nc-description-menu-open")).toBe(false);

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
        expect(document.activeElement).toBe(field);

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
        flushAnimationFrames();

        expect(field.value).toBe("****");
        expect(document.activeElement).toBe(field);
        expect(row.classList.contains("nc-description-menu-open")).toBe(false);

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

    it("activates the same + transform for a new draft and accepts native keyboard input", () => {
        act(() => {
            ReactDOM.render(<Harness eventId={null} />, container);
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

        act(() => {
            row.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(document.activeElement).toBe(field);
        expect(icon.dataset.ncDescriptionAction).toBe("add");

        nativeKeyboardEdit(field, "d", "d", "insertText", "d");
        expect(field.value).toBe("d");
        expect(document.activeElement).toBe(field);
    });
});
