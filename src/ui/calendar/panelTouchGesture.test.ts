import { panelTouchGestureOwner } from "./panelTouchGesture";

describe("panelTouchGestureOwner", () => {
    it("keeps vertical and diagonal-vertical motion for list scrolling", () => {
        expect(panelTouchGestureOwner(2, 30)).toBe("scroll");
        expect(panelTouchGestureOwner(-8, -12)).toBe("scroll");
        expect(panelTouchGestureOwner(10, 10)).toBe("scroll");
    });

    it("gives a leftward horizontal motion to panel back", () => {
        expect(panelTouchGestureOwner(-30, 4)).toBe("back");
    });

    it("drags an event onto the grid rightward, away from the panel", () => {
        expect(panelTouchGestureOwner(30, 4)).toBe("event-drag");
    });
});
