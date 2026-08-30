/** @jest-environment jsdom */
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { DescriptionSection } from "../../../src/ui/calendar/DescriptionSection";
import "./androidDescriptionEditor";

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

function writeNativeValue(field: HTMLTextAreaElement, value: string): void {
    const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value"
    )?.set;
    expect(setter).toBeTruthy();
    setter?.call(field, value);
}

describe("Android description editor", () => {
    let container: HTMLDivElement;
    let animationFrames: FrameRequestCallback[];
    let undoValues: string[];
    let redoValues: string[];
    let captureBeforeInput: (event: Event) => void;
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const originalExecCommand = document.execCommand;
    const originalQueryCommandEnabled = document.queryCommandEnabled;

    beforeEach(() => {
        document.documentElement.classList.add("nc-platform-android");
        document.body.classList.add("nc-platform-android");
        container = document.createElement("div");
        document.body.appendChild(container);
        animationFrames = [];
        undoValues = [];
        redoValues = [];
        window.requestAnimationFrame = (callback: FrameRequestCallback) => {
            animationFrames.push(callback);
            return animationFrames.length;
        };

        // jsdom has no browser editing history. Model Chromium/WebView's native
        // textarea history here so the regression still travels through the
        // real beforeinput/input + controlled React path rather than calling a
        // React setter directly.
        captureBeforeInput = (event: Event) => {
            if (!(event.target instanceof HTMLTextAreaElement)) return;
            const input = event as InputEvent;
            if (
                input.inputType === "historyUndo" ||
                input.inputType === "historyRedo"
            ) {
                return;
            }
            undoValues.push(event.target.value);
            redoValues = [];
        };
        document.addEventListener("beforeinput", captureBeforeInput, true);

        Object.defineProperty(document, "queryCommandEnabled", {
            configurable: true,
            value: (command: string) =>
                command === "undo"
                    ? undoValues.length > 0
                    : command === "redo"
                    ? redoValues.length > 0
                    : false,
        });
        Object.defineProperty(document, "execCommand", {
            configurable: true,
            value: (command: string) => {
                const field = document.activeElement;
                if (!(field instanceof HTMLTextAreaElement)) return false;
                if (command !== "undo" && command !== "redo") return false;
                const source = command === "undo" ? undoValues : redoValues;
                const destination =
                    command === "undo" ? redoValues : undoValues;
                const next = source.pop();
                if (next === undefined) return false;
                destination.push(field.value);
                writeNativeValue(field, next);
                field.setSelectionRange(next.length, next.length);
                field.dispatchEvent(
                    new InputEvent("input", {
                        bubbles: true,
                        inputType:
                            command === "undo" ? "historyUndo" : "historyRedo",
                        data: null,
                    })
                );
                return true;
            },
        });
    });
    afterEach(() => {
        act(() => {
            ReactDOM.unmountComponentAtNode(container);
        });
        container.remove();
        document.getElementById("nc-description-android-accessory")?.remove();
        document.documentElement.classList.remove("nc-platform-android");
        document.body.classList.remove("nc-platform-android");
        document.removeEventListener("beforeinput", captureBeforeInput, true);
        window.requestAnimationFrame = originalRequestAnimationFrame;
        if (originalExecCommand) {
            Object.defineProperty(document, "execCommand", {
                configurable: true,
                value: originalExecCommand,
            });
        } else {
            delete (document as Document & { execCommand?: unknown })
                .execCommand;
        }
        if (originalQueryCommandEnabled) {
            Object.defineProperty(document, "queryCommandEnabled", {
                configurable: true,
                value: originalQueryCommandEnabled,
            });
        } else {
            delete (document as Document & { queryCommandEnabled?: unknown })
                .queryCommandEnabled;
        }
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
                new MouseEvent("pointerup", {
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
        act(() => {
            field.dispatchEvent(
                new KeyboardEvent("keydown", {
                    key,
                    bubbles: true,
                    cancelable: true,
                })
            );
            field.dispatchEvent(
                new InputEvent("beforeinput", {
                    bubbles: true,
                    cancelable: true,
                    inputType,
                    data,
                })
            );
            writeNativeValue(field, value);
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
    it("keeps the accessory visible when the professional format control opens the horizontal strip", () => {
        act(() => {
            ReactDOM.render(<Harness />, container);
        });
        const row = container.querySelector(
            ".nc-description-composer"
        ) as HTMLDivElement;
        const section = row.closest(
            ".nc-description-section"
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
            '.nc-description-android-compact [data-nc-description-accessory="format"]'
        ) as HTMLButtonElement;
        expect(formatToggle.textContent?.trim()).toBe("");
        expect(formatToggle.querySelector("svg")).toBeTruthy();

        // Exact regression: before the fix the section itself received the
        // .nc-description-android-expanded class. CSS gives that class
        // display:none for the accessory's inner view, which hid the textarea,
        // caused focusout, and then hid the whole accessory.
        press(formatToggle);
        expect(accessory.isConnected).toBe(true);
        expect(accessory.hidden).toBe(false);
        expect(accessory.dataset.mode).toBe("expanded");
        expect(
            section.classList.contains("nc-description-android-expanded")
        ).toBe(false);
        expect(
            section.classList.contains("nc-description-android-formatting-open")
        ).toBe(true);
        const strip = accessory.querySelector(
            ".nc-description-android-format-scroll"
        ) as HTMLDivElement;
        expect(strip).toBeTruthy();
        expect(icon.hasAttribute("data-nc-description-action")).toBe(false);
        expect(document.activeElement).toBe(field);
        expect(
            Array.from(
                strip.querySelectorAll<HTMLButtonElement>(
                    ".nc-description-android-format-button"
                )
            ).every((button) => Boolean(button.querySelector("svg")))
        ).toBe(true);
        expect(strip.textContent).not.toContain("Tx");
        expect(strip.textContent).not.toContain("☑");
        expect(strip.textContent).not.toContain("•≡");
        expect(strip.textContent).not.toContain("1≡");

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

        const expandedToggle = accessory.querySelector(
            '.nc-description-android-expanded [data-nc-description-accessory="format"]'
        ) as HTMLButtonElement;
        expect(expandedToggle.textContent?.trim()).toBe("");
        expect(expandedToggle.querySelector("svg")).toBeTruthy();
        press(expandedToggle);
        expect(accessory.hidden).toBe(false);
        expect(accessory.dataset.mode).toBe("compact");
        expect(document.activeElement).toBe(field);
    });
    it("keeps undo and redo fixed at the far right and follows the native textarea history", () => {
        act(() => {
            ReactDOM.render(<Harness />, container);
        });
        const row = container.querySelector(
            ".nc-description-composer"
        ) as HTMLDivElement;
        const field = row.querySelector(
            "textarea[data-description-input='true']"
        ) as HTMLTextAreaElement;
        act(() => {
            row.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        const accessory = document.getElementById(
            "nc-description-android-accessory"
        ) as HTMLDivElement;
        const formatToggle = accessory.querySelector(
            '.nc-description-android-compact [data-nc-description-accessory="format"]'
        ) as HTMLButtonElement;
        press(formatToggle);

        const strip = accessory.querySelector(
            ".nc-description-android-format-scroll"
        ) as HTMLDivElement;
        const history = accessory.querySelector(
            ".nc-description-android-history"
        ) as HTMLDivElement;
        const undo = history.querySelector(
            '[data-nc-description-history="undo"]'
        ) as HTMLButtonElement;
        const redo = history.querySelector(
            '[data-nc-description-history="redo"]'
        ) as HTMLButtonElement;
        expect(strip.nextElementSibling).toBe(history);
        expect(undo.querySelector("svg")).toBeTruthy();
        expect(redo.querySelector("svg")).toBeTruthy();
        expect(undo.disabled).toBe(true);
        expect(redo.disabled).toBe(true);

        nativeKeyboardEdit(field, "a", "a", "insertText", "a");
        expect(field.value).toBe("a");
        expect(undo.disabled).toBe(false);
        expect(redo.disabled).toBe(true);

        press(undo);
        expect(field.value).toBe("");
        expect(document.activeElement).toBe(field);
        expect(redo.disabled).toBe(false);

        press(redo);
        expect(field.value).toBe("a");
        expect(document.activeElement).toBe(field);
        expect(undo.disabled).toBe(false);

        field.setSelectionRange(1, 1);
        nativeKeyboardEdit(field, "ab", "b", "insertText", "b");
        expect(field.value).toBe("ab");
        expect(redo.disabled).toBe(true);
    });
    it("keeps a new draft on the Android keyboard path with no + and accepts native input", () => {
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
        act(() => {
            row.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        const accessory = document.getElementById(
            "nc-description-android-accessory"
        ) as HTMLDivElement;
        const attachment = accessory.querySelector(
            '[data-nc-description-command="attachment"]'
        ) as HTMLButtonElement;
        expect(document.activeElement).toBe(field);
        expect(icon.hasAttribute("data-nc-description-action")).toBe(false);
        expect(accessory.hidden).toBe(false);
        expect(accessory.dataset.mode).toBe("compact");
        expect(attachment.disabled).toBe(true);
        nativeKeyboardEdit(field, "d", "d", "insertText", "d");
        expect(field.value).toBe("d");
        expect(document.activeElement).toBe(field);
    });
});
