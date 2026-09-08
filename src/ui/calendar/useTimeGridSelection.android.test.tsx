/** @jest-environment jsdom */
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { useTimeGridSelection } from "./useTimeGridSelection";
import { setHourHeight, HOUR_HEIGHT } from "./calendarConstants";

/**
 * Un appui sur la grille ouvre un brouillon, et la fiche du brouillon vient se
 * poser sous le doigt. Le `click` que le navigateur doit encore au geste
 * tombait alors sur elle : le menu « Répéter » s'ouvrait tout seul en même
 * temps que le brouillon.
 */
describe("Un tap Android sur la grille ne clique pas la fiche qu'il ouvre", () => {
    let host: HTMLDivElement;
    const selected = jest.fn();

    function Grid() {
        const gridRef = React.useRef<HTMLDivElement>(null);
        const { handleMouseDown } = useTimeGridSelection({
            gridRef,
            onSelectRange: selected,
        });
        return (
            <div ref={gridRef}>
                <div
                    className="nc-timegrid-day"
                    onPointerDown={(event) =>
                        handleMouseDown(event, new Date(2026, 8, 7), 0)
                    }
                />
            </div>
        );
    }

    beforeEach(() => {
        jest.useFakeTimers();
        selected.mockClear();
        document.body.classList.add("nc-platform-android");
        host = document.createElement("div");
        document.body.append(host);
        act(() => ReactDOM.render(<Grid />, host));
    });

    afterEach(() => {
        act(() => ReactDOM.unmountComponentAtNode(host));
        host.remove();
        document.body.classList.remove("nc-platform-android");
        jest.useRealTimers();
    });

    /** jsdom ne connaît pas PointerEvent : un MouseEvent porte ce que le code lit. */
    const pointer = (type: string, init: Record<string, number>) => {
        const event = new MouseEvent(type, { bubbles: true, ...init });
        Object.defineProperty(event, "pointerId", { value: init.pointerId });
        return event;
    };

    it.each([
        [72, 40, 347],
        [72, -200, 327],
        [144, -350, 443],
    ])(
        "keeps a tap at its minute after scrolling and zooming (%i px/hour)",
        (hourHeight, top, y) => {
            setHourHeight(hourHeight);
            const day = host.querySelector(".nc-timegrid-day") as HTMLElement;
            jest.spyOn(day, "getBoundingClientRect").mockReturnValue({
                top,
            } as DOMRect);
            try {
                act(() => {
                    day.dispatchEvent(
                        pointer("pointerdown", {
                            button: 0,
                            pointerId: 2,
                            clientY: y,
                        })
                    );
                    document.dispatchEvent(
                        pointer("pointerup", {
                            button: 0,
                            pointerId: 2,
                            clientY: y,
                        })
                    );
                });
                const [start, end] = selected.mock.calls[0];
                const renderedY =
                    top +
                    ((start.getHours() * 60 + start.getMinutes()) *
                        hourHeight) /
                        60;
                expect(Math.abs(renderedY - y)).toBeLessThanOrEqual(
                    hourHeight / 120
                );
                expect(end.getTime() - start.getTime()).toBe(30 * 60000);
            } finally {
                setHourHeight(HOUR_HEIGHT);
            }
        }
    );
    it("avale le click que le geste doit encore", () => {
        const day = host.querySelector(".nc-timegrid-day") as HTMLElement;
        act(() => {
            day.dispatchEvent(
                pointer("pointerdown", {
                    button: 0,
                    pointerId: 1,
                    clientY: 300,
                })
            );
            document.dispatchEvent(
                pointer("pointerup", { button: 0, pointerId: 1, clientY: 300 })
            );
        });
        expect(selected).toHaveBeenCalledTimes(1);

        // La fiche vient d'apparaître sous le doigt ; le click du geste arrive.
        const sheet = document.createElement("button");
        const opened = jest.fn();
        sheet.addEventListener("click", opened);
        document.body.append(sheet);
        sheet.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        expect(opened).not.toHaveBeenCalled();

        // Et le click suivant, lui, est bien celui de quelqu'un.
        jest.advanceTimersByTime(400);
        sheet.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        expect(opened).toHaveBeenCalledTimes(1);
        sheet.remove();
    });
});
