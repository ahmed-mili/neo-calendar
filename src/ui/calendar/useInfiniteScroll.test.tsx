/** @jest-environment jsdom */
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { useInfiniteScroll } from "./useInfiniteScroll";

describe.each([true, false])(
    "useInfiniteScroll (columns: %s)",
    (withColumns) => {
        let host: HTMLDivElement;
        let scroller: HTMLDivElement;
        let onShiftDays: jest.Mock;
        const initialDate = new Date(2026, 8, 7);
        const originalResizeObserver = window.ResizeObserver;

        function Harness({ dateKey }: { dateKey: string }) {
            const scrollRef = React.useRef(scroller);
            useInfiniteScroll({
                scrollRef,
                dateKey,
                daysPerView: 7,
                onShiftDays,
            });
            return null;
        }

        function render(date: Date) {
            act(() => {
                ReactDOM.render(
                    <Harness dateKey={date.toDateString()} />,
                    host
                );
            });
        }

        function scrollTo(left: number) {
            act(() => {
                scroller.scrollLeft = left;
                scroller.dispatchEvent(new Event("scroll"));
                jest.runOnlyPendingTimers();
            });
        }

        beforeEach(() => {
            jest.useFakeTimers();
            window.ResizeObserver = class {
                observe() {}
                unobserve() {}
                disconnect() {}
            };
            host = document.createElement("div");
            scroller = document.createElement("div");
            document.body.append(host, scroller);
            Object.defineProperty(scroller, "clientWidth", { value: 700 });
            if (withColumns) {
                for (let index = 0; index < 13; index++) {
                    const column = document.createElement("div");
                    column.className = "nc-timegrid-day";
                    column.getBoundingClientRect = () =>
                        ({
                            left: index * 100 - scroller.scrollLeft,
                            width: 100,
                        } as DOMRect);
                    scroller.append(column);
                }
            }
            onShiftDays = jest.fn();
        });

        afterEach(() => {
            act(() => {
                ReactDOM.unmountComponentAtNode(host);
            });
            host.remove();
            scroller.remove();
            window.ResizeObserver = originalResizeObserver;
            jest.useRealTimers();
        });

        it.each([
            { left: 542, shift: 2, target: new Date(2026, 8, 14) },
            { left: 62, shift: -2, target: new Date(2026, 7, 31) },
        ])(
            "recenters an external date instead of compensating a pending $shift-day shift",
            ({ left, shift, target }) => {
                render(initialDate);
                expect(scroller.scrollLeft).toBe(302);
                scrollTo(left);
                expect(onShiftDays).toHaveBeenCalledWith(shift);

                render(target);
                expect(scroller.scrollLeft).toBe(302);
                scrollTo(scroller.scrollLeft);
                expect(onShiftDays).toHaveBeenCalledTimes(1);

                scrollTo(542);
                expect(onShiftDays).toHaveBeenCalledTimes(2);
                expect(onShiftDays).toHaveBeenLastCalledWith(2);
                const shiftedTarget = new Date(target);
                shiftedTarget.setDate(target.getDate() + 2);
                render(shiftedTarget);
                expect(scroller.scrollLeft).toBe(342);
                scrollTo(scroller.scrollLeft);
                expect(onShiftDays).toHaveBeenCalledTimes(2);
            }
        );

        it.each([
            { left: 542, shift: 2, day: 9, expected: 342 },
            { left: 62, shift: -2, day: 5, expected: 262 },
            { left: 602, shift: 3, day: 10, expected: 302 },
        ])(
            "preserves the position when the date acknowledges a $shift-day shift",
            ({ left, shift, day, expected }) => {
                render(initialDate);
                scrollTo(left);
                expect(onShiftDays).toHaveBeenCalledWith(shift);

                render(new Date(2026, 8, day));
                expect(scroller.scrollLeft).toBe(expected);
                scrollTo(scroller.scrollLeft);
                expect(onShiftDays).toHaveBeenCalledTimes(1);
            }
        );

        it("leaves scroll and a pending shift intact on a render with the same date", () => {
            render(initialDate);
            scrollTo(342);
            render(initialDate);
            expect(scroller.scrollLeft).toBe(342);
            expect(onShiftDays).not.toHaveBeenCalled();

            scrollTo(542);
            render(initialDate);
            expect(scroller.scrollLeft).toBe(542);
            scrollTo(scroller.scrollLeft);
            expect(onShiftDays).toHaveBeenCalledTimes(1);

            render(new Date(2026, 8, 9));
            expect(scroller.scrollLeft).toBe(342);
        });
    }
);
