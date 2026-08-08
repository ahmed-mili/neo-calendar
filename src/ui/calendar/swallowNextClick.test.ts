import { swallowNextClick } from "./swallowNextClick";

/**
 * The guard only ever talks to `document`, so a bare EventTarget stands in for
 * the page — this suite runs in Node, where there is none.
 */
const page = new EventTarget();
(globalThis as { document?: unknown }).document = page;

function click(): Event {
    const event = new Event("click", { cancelable: true, bubbles: true });
    page.dispatchEvent(event);
    return event;
}

describe("swallowNextClick", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it("eats the click the press still owed", () => {
        swallowNextClick();
        expect(click().defaultPrevented).toBe(true);
    });

    // The guard exists for one stray click. Left armed, it would swallow the
    // user's next real tap — the tap they meant, on whatever they aimed at.
    it("lets the one after that through", () => {
        swallowNextClick();
        click();
        expect(click().defaultPrevented).toBe(false);
    });

    // A press does not always produce a click: a drag, a cancelled touch.
    it("disarms itself when no click arrives", () => {
        swallowNextClick(350);
        jest.advanceTimersByTime(350);
        expect(click().defaultPrevented).toBe(false);
    });

    it("stays armed until the window elapses", () => {
        swallowNextClick(350);
        jest.advanceTimersByTime(349);
        expect(click().defaultPrevented).toBe(true);
    });

    it("disarms on demand", () => {
        const disarm = swallowNextClick();
        disarm();
        expect(click().defaultPrevented).toBe(false);
    });
});
