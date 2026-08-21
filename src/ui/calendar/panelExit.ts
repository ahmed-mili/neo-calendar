/**
 * How the event panel leaves, on the desktop.
 *
 * On Android the sheet slides back down the way a finger would push it
 * (`useSheetDrag`). The desktop popup had no such thing: it faded and scaled in
 * over 180 ms, then vanished between two frames the moment the X was pressed,
 * because the panel is unmounted as soon as the calendar clears its state.
 *
 * So it plays the reverse of its entrance and is unmounted when that animation
 * reports itself finished — rather than after a duration written down a second
 * time here, which would drift from the stylesheet and would ignore the
 * `prefers-reduced-motion` rule that collapses every animation to 1 ms.
 */

/** The class the panel wears while it is on its way out. */
export const PANEL_EXIT_CLASS = "nc-popup-leaving";

/** The animation that class plays, declared in CalendarOverlays.css. */
export const PANEL_EXIT_ANIMATION = "nc-popup-out";

/** One `animationend`, as the panel needs to judge it. */
export interface PanelExitEnd {
    /** Whether the panel has been asked to leave. */
    leaving: boolean;
    /** `animationName` of the event that just arrived. */
    animationName: string;
    /** Whether it came from the panel itself and not from a row inside it. */
    fromPanel: boolean;
}

/**
 * Whether this is the `animationend` the panel disappears on.
 *
 * Three things end animations on that element. Its own entrance, 180 ms after
 * opening — closing on that one would make the panel shut itself as soon as it
 * had finished arriving. Its rows, menus and toggles, whose events bubble up to
 * the same handler. And the exit itself, which is the only one that means the
 * panel is done leaving.
 */
export function panelHasLeft(end: PanelExitEnd): boolean {
    if (!end.leaving || !end.fromPanel) return false;
    return end.animationName === PANEL_EXIT_ANIMATION;
}
