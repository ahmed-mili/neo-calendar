/** @jest-environment jsdom */
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { restOffsetFor, useSheetDrag } from "./useSheetDrag";

describe("Android draft sheet", () => {
    let host: HTMLDivElement;
    let height: number;
    let onClose: jest.Mock;
    let sheet: HTMLElement;
    let resize: () => void;

    function Harness({ variant = "draft" }: { variant?: "draft" | "sheet" }) {
        const sheetRef = React.useRef<HTMLDivElement>(null);
        const handleRef = React.useRef<HTMLDivElement>(null);
        const controls = useSheetDrag({
            enabled: true,
            sheetRef,
            handleRef,
            variant,
            onClose,
        });
        return (
            <div ref={sheetRef} data-anchor={controls.anchor}>
                <div ref={handleRef}>
                    <button onClick={controls.pressHandle}>Expand</button>
                </div>
                <input aria-label="Title" />
                <button onClick={controls.requestClose}>Close</button>
            </div>
        );
    }

    beforeEach(() => {
        jest.useFakeTimers();
        host = document.createElement("div");
        document.body.append(host);
        height = 780;
        onClose = jest.fn();
        jest.spyOn(
            HTMLElement.prototype,
            "getBoundingClientRect"
        ).mockImplementation(() => ({ height } as DOMRect));
        Object.defineProperty(window, "matchMedia", {
            configurable: true,
            value: () => ({ matches: false }),
        });
        Object.defineProperty(window, "ResizeObserver", {
            configurable: true,
            value: class {
                constructor(callback: () => void) {
                    resize = callback;
                }
                observe() {}
                disconnect() {}
            },
        });
    });

    afterEach(() => {
        act(() => ReactDOM.unmountComponentAtNode(host));
        host.remove();
        jest.restoreAllMocks();
        jest.useRealTimers();
    });

    const render = (variant: "draft" | "sheet" = "draft") => {
        act(() => ReactDOM.render(<Harness variant={variant} />, host));
        sheet = host.firstElementChild as HTMLElement;
    };

    it("opens a draft at a compact anchor with the title keyboard closed", () => {
        render();
        const offset = Number.parseFloat(
            sheet.style.getPropertyValue("--nc-sheet-offset")
        );
        expect(sheet.dataset.anchor).toBe("half");
        expect(height - offset).toBeGreaterThanOrEqual(190);
        expect(height - offset).toBeLessThanOrEqual(230);
        expect(document.activeElement).not.toBe(host.querySelector("input"));
    });

    it("still opens an existing event fully", () => {
        render("sheet");
        expect(sheet.dataset.anchor).toBe("full");
        expect(sheet.style.getPropertyValue("--nc-sheet-offset")).toBe("0px");
    });

    it("expands when the title receives focus, and stays expanded as the keyboard resizes it", () => {
        render();
        act(() => host.querySelector("input")!.focus());
        expect(sheet.dataset.anchor).toBe("full");
        height = 420;
        act(() => resize());
        expect(sheet.style.getPropertyValue("--nc-sheet-offset")).toBe("0px");
    });

    it("keeps the compact anchor attached to the bottom after a resize", () => {
        render();
        height = 660;
        act(() => resize());
        expect(sheet.style.getPropertyValue("--nc-sheet-offset")).toBe(
            restOffsetFor({ height, variant: "draft" }) + "px"
        );
    });

    it("closes even if the viewport resizes during the exit", () => {
        render();
        act(() => host.querySelectorAll("button")[1].click());
        height = 660;
        act(() => resize());
        act(() => jest.advanceTimersByTime(300));
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
