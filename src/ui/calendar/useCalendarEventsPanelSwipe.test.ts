import {
    calendarPanelSwipeProgress,
    calendarPanelVisualProgress,
    shouldCloseCalendarPanel,
    PANEL_SWIPE_CLOSE_THRESHOLD,
    PANEL_SWIPE_VELOCITY_THRESHOLD,
} from "./useCalendarEventsPanelSwipe";

const WIDTH = 300;

describe("calendarPanelSwipeProgress", () => {
    it("follows a rightward drag proportionally", () => {
        expect(
            calendarPanelSwipeProgress({
                startProgress: 0,
                startX: 100,
                currentX: 190,
                panelWidth: WIDTH,
            })
        ).toBeCloseTo(0.3);
    });

    it("continues from an interrupted partial settle", () => {
        expect(
            calendarPanelSwipeProgress({
                startProgress: 0.4,
                startX: 100,
                currentX: 130,
                panelWidth: WIDTH,
            })
        ).toBeCloseTo(0.5);
    });

    it("clamps leftward movement and overshoot", () => {
        expect(
            calendarPanelSwipeProgress({
                startProgress: 0,
                startX: 100,
                currentX: 0,
                panelWidth: WIDTH,
            })
        ).toBe(0);
        expect(
            calendarPanelSwipeProgress({
                startProgress: 0.8,
                startX: 100,
                currentX: 300,
                panelWidth: WIDTH,
            })
        ).toBe(1);
    });
});

describe("calendarPanelVisualProgress", () => {
    it("reads open, partial and closed composited positions", () => {
        expect(calendarPanelVisualProgress(400, 400, WIDTH)).toBe(0);
        expect(calendarPanelVisualProgress(550, 400, WIDTH)).toBe(0.5);
        expect(calendarPanelVisualProgress(700, 400, WIDTH)).toBe(1);
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

    it("accepts a short fast flick to the right", () => {
        expect(
            shouldCloseCalendarPanel({
                progress: 0.1,
                velocity: PANEL_SWIPE_VELOCITY_THRESHOLD + 0.01,
            })
        ).toBe(true);
    });

    it("lets a fast reversal cancel even after a long drag", () => {
        expect(
            shouldCloseCalendarPanel({
                progress: 0.8,
                velocity: -PANEL_SWIPE_VELOCITY_THRESHOLD - 0.01,
            })
        ).toBe(false);
    });
});
