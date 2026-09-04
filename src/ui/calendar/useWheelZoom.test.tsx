/** @jest-environment jsdom */
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import {
    HOUR_HEIGHT,
    MAX_HOUR_HEIGHT,
    MIN_HOUR_HEIGHT,
    currentHourHeight,
    setHourHeight,
} from "./calendarConstants";
import {
    WHEEL_LINE_PX,
    WHEEL_MAX_PX_PER_EVENT,
    WHEEL_NOTCH_PX,
    WHEEL_ZOOM_IDLE_MS,
    WHEEL_ZOOM_PER_NOTCH,
    useWheelZoom,
    zoomedHourHeight,
} from "./useWheelZoom";

describe("zoomedHourHeight", () => {
    it("grows the hour when the wheel goes up, shrinks it when it goes down", () => {
        expect(zoomedHourHeight(60, -WHEEL_NOTCH_PX, 0)).toBeCloseTo(
            60 * WHEEL_ZOOM_PER_NOTCH
        );
        expect(zoomedHourHeight(60, WHEEL_NOTCH_PX, 0)).toBeCloseTo(
            60 / WHEEL_ZOOM_PER_NOTCH
        );
    });

    it("comes back where it started, a notch each way", () => {
        const there = zoomedHourHeight(60, -WHEEL_NOTCH_PX, 0);
        expect(zoomedHourHeight(there, WHEEL_NOTCH_PX, 0)).toBeCloseTo(60);
    });

    it("stops at the ends of the range instead of running past them", () => {
        expect(zoomedHourHeight(MAX_HOUR_HEIGHT, -10 * WHEEL_NOTCH_PX, 0)).toBe(
            MAX_HOUR_HEIGHT
        );
        expect(zoomedHourHeight(MIN_HOUR_HEIGHT, 10 * WHEEL_NOTCH_PX, 0)).toBe(
            MIN_HOUR_HEIGHT
        );
    });

    it("reads a wheel that counts in lines the same as one counting pixels", () => {
        expect(zoomedHourHeight(60, -3, 1)).toBeCloseTo(
            zoomedHourHeight(60, -3 * WHEEL_LINE_PX, 0)
        );
    });

    it("caps what one event can do, so a flung trackpad cannot teleport", () => {
        expect(zoomedHourHeight(60, -4000, 0)).toBeCloseTo(
            zoomedHourHeight(60, -WHEEL_MAX_PX_PER_EVENT, 0)
        );
    });
});

/*
 * Ctrl + molette sur PC.
 *
 * Le même nombre que le pincement fait bouger sur téléphone — la hauteur d'une
 * heure — écrit sur la grille en variable CSS, avec le défilement corrigé dans
 * la même image pour que l'heure sous le curseur y reste.
 */
describe("useWheelZoom", () => {
    let scroller: HTMLDivElement;
    let host: HTMLDivElement;
    let mount: HTMLDivElement;
    let scrollTop: number;
    let frames: FrameRequestCallback[];

    const GRID_TOP = 100;
    const CURSOR_BELOW_TOP = 200;
    const VIEWPORT = 600;

    const runFrame = () => {
        const queued = frames;
        frames = [];
        act(() => {
            queued.forEach((cb) => cb(0));
        });
    };

    const wheel = (init: WheelEventInit): WheelEvent => {
        const event = new WheelEvent("wheel", {
            bubbles: true,
            cancelable: true,
            clientY: GRID_TOP + CURSOR_BELOW_TOP,
            ...init,
        });
        act(() => {
            scroller.dispatchEvent(event);
        });
        return event;
    };

    const anchorUnderCursor = () =>
        (scrollTop + CURSOR_BELOW_TOP) / currentHourHeight();

    function Harness({
        enabled = true,
        options = {},
    }: {
        enabled?: boolean;
        options?: Parameters<typeof useWheelZoom>[3];
    }) {
        const scrollRef = React.useRef(scroller);
        const hostRef = React.useRef(host);
        useWheelZoom(scrollRef, hostRef, enabled, options);
        return null;
    }

    const render = (props: React.ComponentProps<typeof Harness> = {}) => {
        act(() => {
            ReactDOM.render(<Harness {...props} />, mount);
        });
    };

    beforeEach(() => {
        jest.useFakeTimers();
        frames = [];
        window.requestAnimationFrame = ((cb: FrameRequestCallback) =>
            frames.push(cb)) as typeof window.requestAnimationFrame;
        window.cancelAnimationFrame = (() => {
            frames = [];
        }) as typeof window.cancelAnimationFrame;

        setHourHeight(HOUR_HEIGHT);
        scrollTop = 300;

        host = document.createElement("div");
        scroller = document.createElement("div");
        host.appendChild(scroller);
        mount = document.createElement("div");
        document.body.append(host, mount);

        Object.defineProperty(scroller, "clientHeight", {
            configurable: true,
            get: () => VIEWPORT,
        });
        Object.defineProperty(scroller, "scrollHeight", {
            configurable: true,
            get: () => 24 * currentHourHeight(),
        });
        Object.defineProperty(scroller, "scrollTop", {
            configurable: true,
            get: () => scrollTop,
            set: (value: number) => {
                scrollTop = value;
            },
        });
        scroller.getBoundingClientRect = () =>
            ({ top: GRID_TOP, left: 0 } as DOMRect);
    });

    afterEach(() => {
        act(() => {
            ReactDOM.unmountComponentAtNode(mount);
        });
        host.remove();
        mount.remove();
        setHourHeight(HOUR_HEIGHT);
        jest.useRealTimers();
    });

    it("stretches the hour and tells the stylesheet, on ctrl + wheel up", () => {
        render();
        wheel({ deltaY: -WHEEL_NOTCH_PX, ctrlKey: true });
        runFrame();

        expect(currentHourHeight()).toBeCloseTo(
            HOUR_HEIGHT * WHEEL_ZOOM_PER_NOTCH
        );
        expect(host.style.getPropertyValue("--nc-hour-height")).toBe(
            `${currentHourHeight()}px`
        );
    });

    it("leaves a plain wheel to scroll the grid, as it always has", () => {
        render();
        const event = wheel({ deltaY: -WHEEL_NOTCH_PX });
        runFrame();

        expect(currentHourHeight()).toBe(HOUR_HEIGHT);
        expect(event.defaultPrevented).toBe(false);
    });

    it("takes the gesture from the browser, which would zoom the whole window", () => {
        render();
        expect(
            wheel({ deltaY: -WHEEL_NOTCH_PX, ctrlKey: true }).defaultPrevented
        ).toBe(true);
    });

    it("keeps the hour under the cursor under the cursor", () => {
        render();
        const anchor = anchorUnderCursor();

        wheel({ deltaY: -WHEEL_NOTCH_PX, ctrlKey: true });
        runFrame();

        expect(anchorUnderCursor()).toBeCloseTo(anchor);
    });

    it("writes once per frame, however many notches arrive inside it", () => {
        const onScaleChange = jest.fn();
        render({ options: { onScaleChange } });

        wheel({ deltaY: -WHEEL_NOTCH_PX, ctrlKey: true });
        wheel({ deltaY: -WHEEL_NOTCH_PX, ctrlKey: true });
        runFrame();

        expect(onScaleChange).toHaveBeenCalledTimes(1);
        expect(currentHourHeight()).toBeCloseTo(
            HOUR_HEIGHT * WHEEL_ZOOM_PER_NOTCH ** 2
        );
    });

    it("holds the anchor still through a burst, rather than drifting per notch", () => {
        render();
        const anchor = anchorUnderCursor();

        wheel({ deltaY: -WHEEL_NOTCH_PX, ctrlKey: true });
        wheel({ deltaY: -WHEEL_NOTCH_PX, ctrlKey: true });
        runFrame();

        expect(anchorUnderCursor()).toBeCloseTo(anchor);
    });

    it("says the scale has settled only once the wheel has stopped", () => {
        const onScaleSettled = jest.fn();
        render({ options: { onScaleSettled } });

        wheel({ deltaY: -WHEEL_NOTCH_PX, ctrlKey: true });
        runFrame();
        act(() => {
            jest.advanceTimersByTime(WHEEL_ZOOM_IDLE_MS - 1);
        });
        expect(onScaleSettled).not.toHaveBeenCalled();

        wheel({ deltaY: -WHEEL_NOTCH_PX, ctrlKey: true });
        runFrame();
        act(() => {
            jest.advanceTimersByTime(WHEEL_ZOOM_IDLE_MS);
        });
        expect(onScaleSettled).toHaveBeenCalledTimes(1);
    });

    it("does nothing at all where it is not wanted", () => {
        render({ enabled: false });
        const event = wheel({ deltaY: -WHEEL_NOTCH_PX, ctrlKey: true });
        runFrame();

        expect(currentHourHeight()).toBe(HOUR_HEIGHT);
        expect(event.defaultPrevented).toBe(false);
    });

    it("puts the hour back where the stylesheet has it when it goes away", () => {
        render();
        wheel({ deltaY: -WHEEL_NOTCH_PX, ctrlKey: true });
        runFrame();

        act(() => {
            ReactDOM.unmountComponentAtNode(mount);
        });

        expect(currentHourHeight()).toBe(HOUR_HEIGHT);
        expect(host.style.getPropertyValue("--nc-hour-height")).toBe("");
        expect(
            wheel({ deltaY: -WHEEL_NOTCH_PX, ctrlKey: true }).defaultPrevented
        ).toBe(false);
    });
});
