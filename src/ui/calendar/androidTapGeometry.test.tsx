/** @jest-environment jsdom */
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { useAxisLock } from "./useAxisLock";
import { useTimeGridSelection } from "./useTimeGridSelection";
import {
    currentHourHeight,
    restingHourHeight,
    setHourHeight,
} from "./calendarConstants";
import { draftPreviewBox } from "./draftPreviewBox";

describe("Android tap geometry after changing views", () => {
    it.each([72, 96])(
        "restores the CSS resting scale (%i px) before the next tap",
        (resting) => {
            document.body.classList.add("nc-platform-android");
            document.body.style.setProperty("--nc-hour-height", `${resting}px`);
            setHourHeight(restingHourHeight()); // CalendarApp runs this only once.
            const mount = document.createElement("div");
            document.body.append(mount);
            const selected = jest.fn();
            const day = new Date(2026, 8, 6);
            function Grid() {
                const hostRef = React.useRef<HTMLDivElement>(null);
                const scrollRef = React.useRef<HTMLDivElement>(null);
                useAxisLock(scrollRef, hostRef);
                const { handleMouseDown } = useTimeGridSelection({
                    gridRef: hostRef,
                    onSelectRange: selected,
                });
                return (
                    <div ref={hostRef}>
                        <div ref={scrollRef}>
                            <div
                                className="nc-timegrid-day"
                                onPointerDown={(event) =>
                                    handleMouseDown(event, day, 0)
                                }
                            />
                        </div>
                    </div>
                );
            }
            try {
                act(() => {
                    ReactDOM.render(<Grid />, mount);
                });
                // Leave a zoomed grid, then return without remounting CalendarApp.
                setHourHeight(120);
                (mount.firstElementChild as HTMLElement).style.setProperty(
                    "--nc-hour-height",
                    "120px"
                );
                act(() => {
                    ReactDOM.render(<div />, mount);
                });
                act(() => {
                    ReactDOM.render(<Grid />, mount);
                });
                const column = mount.querySelector(".nc-timegrid-day")!;
                // A scrolled column: client coordinates and the column origin must cancel.
                jest.spyOn(column, "getBoundingClientRect").mockReturnValue({
                    top: -500,
                } as DOMRect);
                const tapY = 10 * resting;
                const pointer = (type: string) => {
                    const event = new MouseEvent(type, {
                        bubbles: true,
                        cancelable: true,
                        button: 0,
                        clientY: -500 + tapY,
                    });
                    Object.defineProperty(event, "pointerId", { value: 1 });
                    return event;
                };
                act(() => {
                    column.dispatchEvent(pointer("pointerdown"));
                });
                act(() => {
                    document.dispatchEvent(pointer("pointerup"));
                });
                expect(selected).toHaveBeenCalledTimes(1);
                const [start, end, allDay] = selected.mock.calls[0];
                const hours = start.getHours() + start.getMinutes() / 60;
                expect({ tapY, draftTop: hours * resting }).toEqual({
                    tapY,
                    draftTop: tapY,
                });
                expect(
                    draftPreviewBox({ topHours: hours, durationHours: 0.5 }).top
                ).toBe("calc(var(--nc-hour-height, 60px) * 10)");
                expect(currentHourHeight()).toBe(resting);
                expect(end.getTime() - start.getTime()).toBe(30 * 60000);
                expect(allDay).toBe(false);
            } finally {
                act(() => {
                    ReactDOM.unmountComponentAtNode(mount);
                });
                mount.remove();
                document.body.style.removeProperty("--nc-hour-height");
                document.body.classList.remove("nc-platform-android");
                setHourHeight(60);
            }
        }
    );
});
