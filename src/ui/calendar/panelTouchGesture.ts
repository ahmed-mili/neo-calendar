export type PanelTouchGestureOwner = "scroll" | "back" | "event-drag";

/** Decides which interaction owns a touch that began on an event card. */
export function panelTouchGestureOwner(
    dx: number,
    dy: number
): PanelTouchGestureOwner {
    if (Math.abs(dy) >= Math.abs(dx)) return "scroll";
    return dx > 0 ? "back" : "event-drag";
}
