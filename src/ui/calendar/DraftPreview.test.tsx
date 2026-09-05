/** @jest-environment jsdom */
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import DraftPreview from "./DraftPreview";

describe("draft preview presence", () => {
    let host: HTMLDivElement;
    let reducedMotion = false;
    beforeEach(() => {
        jest.useFakeTimers();
        host = document.createElement("div");
        document.body.append(host);
        document.body.classList.add("nc-platform-android");
        reducedMotion = false;
        Object.defineProperty(window, "matchMedia", {
            configurable: true,
            value: () => ({ matches: reducedMotion }),
        });
    });
    afterEach(() => {
        act(() => ReactDOM.unmountComponentAtNode(host));
        host.remove();
        document.body.classList.remove("nc-platform-android");
        jest.useRealTimers();
    });
    function render(top: number | null, immediate = false) {
        act(() =>
            ReactDOM.render(
                <DraftPreview immediate={immediate}>
                    {top === null ? null : (
                        <div
                            className="nc-selection-mirror"
                            data-draft-preview="true"
                            style={{ top }}
                        >
                            <button>Resize</button>
                        </div>
                    )}
                </DraftPreview>,
                host
            )
        );
    }
    it("keeps the last geometry during exit, without an active draft target", () => {
        render(100);
        render(null);
        expect(host.firstElementChild!.getAttribute("data-draft-state")).toBe(
            "exiting"
        );
        expect((host.firstElementChild as HTMLElement).style.top).toBe("100px");
        expect(host.querySelector('[data-draft-preview="true"]')).toBeNull();
        act(() => jest.advanceTimersByTime(180));
        expect(host.firstElementChild).toBeNull();
    });
    it("preserves the desktop selection surface from before Android animations", () => {
        document.body.classList.remove("nc-platform-android");
        render(100);
        const preview = host.firstElementChild as HTMLElement;
        expect(preview.className).toBe("nc-selection-mirror");
        expect(preview.getAttribute("data-draft-preview")).toBe("true");
        expect(preview.getAttribute("data-draft-state")).toBeNull();
        expect(preview.style.cssText).toBe("top: 100px;");
    });
    it("resizes in place instead of replaying the appearance animation", () => {
        render(100);
        const original = host.firstElementChild;
        render(160);
        expect(host.firstElementChild).toBe(original);
        expect((original as HTMLElement).style.top).toBe("160px");
    });
    it("cancels the exit when a new preview arrives quickly", () => {
        render(100);
        render(null);
        act(() => jest.advanceTimersByTime(90));
        render(200);
        act(() => jest.advanceTimersByTime(200));
        expect(host.firstElementChild!.getAttribute("data-draft-state")).toBe(
            "visible"
        );
        expect((host.firstElementChild as HTMLElement).style.top).toBe("200px");
    });
    it.each(["desktop", "reduced", "commit"])(
        "does not retain a ghost for %s",
        (mode) => {
            if (mode === "desktop")
                document.body.classList.remove("nc-platform-android");
            reducedMotion = mode === "reduced";
            render(100);
            render(null, mode === "commit");
            expect(host.firstElementChild).toBeNull();
        }
    );
});
