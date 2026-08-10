import { panelTouchGestureOwner } from "./panelTouchGesture";

describe("panelTouchGestureOwner", () => {
    it("keeps vertical and diagonal-vertical motion for list scrolling", () => {
        expect(panelTouchGestureOwner(2, 30)).toBe("scroll");
        expect(panelTouchGestureOwner(-8, -12)).toBe("scroll");
        expect(panelTouchGestureOwner(10, 10)).toBe("scroll");
    });

    it("gives a rightward horizontal motion to panel back", () => {
        expect(panelTouchGestureOwner(30, 4)).toBe("back");
    });

    it("preserves the existing leftward event drag onto the grid", () => {
        expect(panelTouchGestureOwner(-30, 4)).toBe("event-drag");
    });
});
