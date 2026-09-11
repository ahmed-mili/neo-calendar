/** @jest-environment jsdom */
import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { useStartupReveal } from "./useStartupReveal";

describe("startup reveal", () => {
    let host: HTMLDivElement;
    let wallpaper: HTMLDivElement;
    let reduced: boolean;
    let animate: jest.Mock;
    let animations: { cancel: jest.Mock; onfinish: (() => void) | null }[];
    const originalAnimate = Element.prototype.animate;
    const originalMatchMedia = window.matchMedia;

    function Content({ ready, extra }: { ready: boolean; extra: boolean }) {
        const ref = useStartupReveal(ready);
        return (
            <main ref={ref}>
                <div className="nc-event-block" />
                <div className="nc-month-event" />
                <div className="nc-list-event" />
                <div className="nc-cep-card" />
                <button className="nc-allday-hidden-count" />
                {extra && <div className="nc-event-block" data-later />}
            </main>
        );
    }

    function render(ready: boolean, extra = false) {
        act(
            () =>
                void ReactDOM.render(
                    <div className="nc-desktop-window-shell">
                        <Content ready={ready} extra={extra} />
                    </div>,
                    host
                )
        );
    }

    beforeEach(() => {
        host = document.createElement("div");
        wallpaper = document.createElement("div");
        wallpaper.id = "nc-wallpaper-render-layer";
        document.body.append(host, wallpaper);
        reduced = false;
        animations = [];
        window.matchMedia = jest.fn(() => ({ matches: reduced })) as any;
        animate = jest.fn(() => {
            const animation = { cancel: jest.fn(), onfinish: null };
            animations.push(animation);
            return animation;
        });
        Element.prototype.animate = animate;
    });

    afterEach(() => {
        act(() => void ReactDOM.unmountComponentAtNode(host));
        host.remove();
        wallpaper.remove();
        Element.prototype.animate = originalAnimate;
        window.matchMedia = originalMatchMedia;
    });

    it("waits for data, then reveals events more slowly than the whole window and wallpaper", () => {
        render(false);
        const shell = host.firstElementChild as HTMLElement;
        expect(shell.style.opacity).toBe("0");
        expect(wallpaper.style.opacity).toBe("0");
        expect(animate).not.toHaveBeenCalled();
        render(true);
        expect(shell.style.opacity).toBe("");
        expect(wallpaper.style.opacity).toBe("");
        expect(animate).toHaveBeenCalledTimes(7);
        const durationFor = (element: Element) =>
            animate.mock.calls[animate.mock.instances.indexOf(element)][1]
                .duration;
        expect(
            durationFor(host.querySelector(".nc-event-block")!)
        ).toBeGreaterThan(durationFor(shell));
        expect(durationFor(wallpaper)).toBe(durationFor(shell));
    });

    it("does not replay on refresh or animate events mounted after startup", () => {
        render(false);
        render(true);
        animate.mockClear();
        render(true, true);
        expect(animate).not.toHaveBeenCalled();
    });

    it("reveals immediately when reduced motion is requested", () => {
        reduced = true;
        render(false);
        render(true);
        expect((host.firstElementChild as HTMLElement).style.opacity).toBe("");
        expect(wallpaper.style.opacity).toBe("");
        expect(animate).not.toHaveBeenCalled();
    });

    it("cancels unfinished animations when the app unmounts", () => {
        render(true);
        expect(animations.length).toBeGreaterThan(0);
        act(() => void ReactDOM.unmountComponentAtNode(host));
        for (const animation of animations)
            expect(animation.cancel).toHaveBeenCalledTimes(1);
    });

    it("falls back to the app root without a Windows shell", () => {
        act(() => void ReactDOM.render(<Content ready extra={false} />, host));
        expect(animate.mock.instances).toContain(host.querySelector("main"));
    });
});
