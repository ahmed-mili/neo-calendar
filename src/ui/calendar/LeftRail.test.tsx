/** @jest-environment jsdom */
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { LeftRail } from "./TimeGridSections";

describe("all-day collapse control focus", () => {
    let host: HTMLDivElement;
    let toggle: jest.Mock;

    function render(collapsed: boolean): HTMLElement {
        act(() => {
            ReactDOM.render(
                <LeftRail
                    width={80}
                    headerHeight={32}
                    allDayRef={React.createRef()}
                    showAllDay
                    hours={[]}
                    timeFormat24h
                    allDayCollapsed={collapsed}
                    onToggleAllDayCollapsed={toggle}
                    referenceDate={undefined}
                    todayInRange={false}
                    nowTop="0px"
                    nowLabel=""
                    now={new Date(2026, 8, 9, 12)}
                    scrollableRef={React.createRef()}
                />,
                host
            );
        });
        return host.querySelector<HTMLElement>(".nc-allday-collapse-btn")!;
    }

    beforeEach(() => {
        host = document.createElement("div");
        document.body.append(host);
        toggle = jest.fn();
    });

    afterEach(() => {
        act(() => ReactDOM.unmountComponentAtNode(host));
        host.remove();
    });

    it.each([false, true])(
        "releases pointer focus before Shift when collapsed=%s",
        (collapsed) => {
            const control = render(collapsed);
            control.focus(); // The browser focuses it before dispatching click.
            act(() => {
                control
                    .querySelector("svg")!
                    .dispatchEvent(
                        new MouseEvent("click", { bubbles: true, detail: 1 })
                    );
                document.dispatchEvent(
                    new KeyboardEvent("keydown", {
                        key: "Shift",
                        bubbles: true,
                    })
                );
            });
            expect(toggle).toHaveBeenCalledTimes(1);
            expect(document.activeElement).not.toBe(control);
        }
    );

    it.each(["Enter", " "])("keeps keyboard focus after %p", (key) => {
        const control = render(false);
        control.focus();
        act(() => {
            control.dispatchEvent(
                new KeyboardEvent("keydown", {
                    key,
                    bubbles: true,
                    cancelable: true,
                })
            );
        });
        expect(toggle).toHaveBeenCalledTimes(1);
        expect(document.activeElement).toBe(control);
    });

    it("keeps focus for assistive activation without a pointer", () => {
        const control = render(true);
        control.focus();
        act(() => control.click());
        expect(toggle).toHaveBeenCalledTimes(1);
        expect(document.activeElement).toBe(control);
    });
});
