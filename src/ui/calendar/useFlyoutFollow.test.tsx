/** @jest-environment jsdom */
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { useFlyoutFollow } from "./useFlyoutFollow";

describe("un menu ouvert suit le champ qui l'a ouvert", () => {
    let host: HTMLDivElement;
    let top: number;
    let frames: FrameRequestCallback[];

    function Harness({ open }: { open: boolean }) {
        const anchorRef = React.useRef<HTMLDivElement>(null);
        useFlyoutFollow(open, anchorRef, placed);
        return <div ref={anchorRef} />;
    }

    const placed = jest.fn();

    const tick = () => {
        const due = frames;
        frames = [];
        act(() => {
            due.forEach((frame) => frame(0));
        });
    };

    beforeEach(() => {
        placed.mockClear();
        frames = [];
        top = 100;
        host = document.createElement("div");
        document.body.append(host);
        jest.spyOn(window, "requestAnimationFrame").mockImplementation(
            (frame: FrameRequestCallback) => {
                frames.push(frame);
                return frames.length;
            }
        );
        jest.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
        jest.spyOn(
            HTMLElement.prototype,
            "getBoundingClientRect"
        ).mockImplementation(
            () => ({ top, left: 0, width: 200, height: 40 } as DOMRect)
        );
    });

    afterEach(() => {
        act(() => ReactDOM.unmountComponentAtNode(host));
        host.remove();
        jest.restoreAllMocks();
    });

    it("replace le menu quand la fiche glisse sous lui", () => {
        act(() => ReactDOM.render(<Harness open />, host));
        tick();
        expect(placed).not.toHaveBeenCalled(); // rien n'a bougé

        top = 380; // la feuille a glissé vers son ancre
        tick();
        expect(placed).toHaveBeenCalledTimes(1);
    });

    it("ne mesure rien tant qu'aucun menu n'est ouvert", () => {
        act(() => ReactDOM.render(<Harness open={false} />, host));
        top = 380;
        tick();
        expect(placed).not.toHaveBeenCalled();
        expect(frames).toHaveLength(0);
    });
});
