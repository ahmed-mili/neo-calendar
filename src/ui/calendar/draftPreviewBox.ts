import { scaledPx } from "./calendarConstants";

/** A span of one day, as the grid measures it: from the top, for so long. */
export interface DayPortion {
    topHours: number;
    durationHours: number;
}

/** The vertical box used by both the live selection and its released draft. */
export interface GridBox {
    top: string;
    height: string;
}

/**
 * The box the rectangle dragged across the grid is drawn in.
 *
 * It says which span of time is being chosen, so it covers exactly that span.
 */
export function selectionBox(portion: DayPortion): GridBox {
    return {
        top: scaledPx(portion.topHours),
        height: scaledPx(portion.durationHours),
    };
}

/**
 * The box a draft is drawn in immediately after the pointer is released.
 *
 * Releasing the pointer must not move or resize what the user just selected.
 * The old draft preview adopted the normal event gaps here: it moved down by
 * half EVENT_VGAP, became shorter by EVENT_VGAP and narrowed horizontally in
 * the caller. That made the rectangle visibly jump at pointer-up even though
 * its start/end times had not changed.
 *
 * A draft is still the placement gesture until it is actually committed, so it
 * deliberately uses the exact same geometry as that gesture. The shared CSS
 * supplies the same left/right edges for both states as well.
 */
export function draftPreviewBox(portion: DayPortion): GridBox {
    return selectionBox(portion);
}
