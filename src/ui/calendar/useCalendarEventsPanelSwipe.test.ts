import {
    calendarPanelSwipeProgress,
    calendarPanelVisualProgress,
    shouldCloseCalendarPanel,
    PANEL_SWIPE_CLOSE_THRESHOLD,
    PANEL_SWIPE_VELOCITY_THRESHOLD,
} from "./useCalendarEventsPanelSwipe";

const WIDTH = 300;

describe("calendarPanelSwipeProgress", () => {
    it("follows a leftward drag proportionally", () => {
        expect(
            calendarPanelSwipeProgress({
                startProgress: 0,
                startX: 190,
                currentX: 100,
                panelWidth: WIDTH,
            })
        ).toBeCloseTo(0.3);
    });

    it("continues from an interrupted partial settle", () => {
        expect(
            calendarPanelSwipeProgress({
                startProgress: 0.4,
                startX: 130,
                currentX: 100,
                panelWidth: WIDTH,
            })
        ).toBeCloseTo(0.5);
    });

    it("clamps rightward movement and overshoot", () => {
        expect(
            calendarPanelSwipeProgress({
                startProgress: 0,
                startX: 100,
                currentX: 200,
                panelWidth: WIDTH,
            })
        ).toBe(0);
        expect(
            calendarPanelSwipeProgress({
                startProgress: 0.8,
                startX: 300,
                currentX: 100,
                panelWidth: WIDTH,
            })
        ).toBe(1);
    });
});

describe("calendarPanelVisualProgress", () => {
    it("reads open, partial and closed composited positions", () => {
        expect(calendarPanelVisualProgress(0, WIDTH)).toBe(0);
        expect(calendarPanelVisualProgress(-150, WIDTH)).toBe(0.5);
        expect(calendarPanelVisualProgress(-300, WIDTH)).toBe(1);
    });
});

describe("shouldCloseCalendarPanel", () => {
    it("closes past the distance threshold", () => {
        expect(
            shouldCloseCalendarPanel({
                progress: PANEL_SWIPE_CLOSE_THRESHOLD + 0.01,
                velocity: 0,
            })
        ).toBe(true);
    });

    it("snaps back before the threshold", () => {
        expect(
            shouldCloseCalendarPanel({
                progress: PANEL_SWIPE_CLOSE_THRESHOLD - 0.01,
                velocity: 0,
            })
        ).toBe(false);
    });

    it("accepts a short fast flick to the left", () => {
        expect(
            shouldCloseCalendarPanel({
                progress: 0.1,
                velocity: -PANEL_SWIPE_VELOCITY_THRESHOLD - 0.01,
            })
        ).toBe(true);
    });

    it("lets a fast reversal cancel even after a long drag", () => {
        expect(
            shouldCloseCalendarPanel({
                progress: 0.8,
                velocity: PANEL_SWIPE_VELOCITY_THRESHOLD + 0.01,
            })
        ).toBe(false);
    });
});
