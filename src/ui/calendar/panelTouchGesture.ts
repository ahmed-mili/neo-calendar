export type PanelTouchGestureOwner = "scroll" | "back" | "event-drag";

/** Decides which interaction owns a touch that began on an event card. */
export function panelTouchGestureOwner(
    dx: number,
    dy: number
): PanelTouchGestureOwner {
    if (Math.abs(dy) >= Math.abs(dx)) return "scroll";
    // The panel comes in over the drawer, from the left edge, so it is pushed
    // back the way it came. The grid it drags an event onto is on the other
    // side, which leaves each direction with exactly one meaning.
    return dx < 0 ? "back" : "event-drag";
}
