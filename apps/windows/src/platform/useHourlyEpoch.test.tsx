/** @jest-environment jsdom */

import * as React from "react";
import * as ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { useHourlyEpoch } from "./useHourlyEpoch";

const HOUR_MS = 60 * 60 * 1000;

describe("useHourlyEpoch", () => {
    let host: HTMLDivElement;
    let seen: number[];

    function Probe(): JSX.Element {
        seen.push(useHourlyEpoch());
        return <span />;
    }

    beforeEach(() => {
        jest.useFakeTimers();
        seen = [];
        host = document.createElement("div");
        document.body.appendChild(host);
    });

    afterEach(() => {
        act(() => {
            ReactDOM.unmountComponentAtNode(host);
        });
        host.remove();
        jest.useRealTimers();
    });

    /* Ce que l'application residente a revele : `reminderEvents` ecrit
       `new Date()` dans un `useMemo` dont les dependances sont des evenements.
       Ce compteur est ce qui fait bouger son maintenant. */
    it("changes once an hour, and not before", () => {
        act(() => {
            ReactDOM.render(<Probe />, host);
        });
        expect(seen[seen.length - 1]).toBe(0);

        act(() => {
            jest.advanceTimersByTime(HOUR_MS - 1000);
        });
        expect(seen[seen.length - 1]).toBe(0);

        act(() => {
            jest.advanceTimersByTime(1000);
        });
        expect(seen[seen.length - 1]).toBe(1);

        act(() => {
            jest.advanceTimersByTime(2 * HOUR_MS);
        });
        expect(seen[seen.length - 1]).toBe(3);
    });

    it("stops counting once the page is gone", () => {
        act(() => {
            ReactDOM.render(<Probe />, host);
        });
        act(() => {
            ReactDOM.unmountComponentAtNode(host);
        });
        const after = seen.length;

        act(() => {
            jest.advanceTimersByTime(5 * HOUR_MS);
        });
        expect(seen.length).toBe(after);
    });
});
