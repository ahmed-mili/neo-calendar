import {
    EVENT_VGAP,
    OVERLAP_COL_GAP,
    scaledHeightPx,
    scaledPx,
} from "./calendarConstants";

/** A span of one day, as the grid measures it: from the top, for so long. */
export interface DayPortion {
    topHours: number;
    durationHours: number;
}

/** Where something sits in its day column. */
export interface GridBox {
    top: string;
    height: string;
    left: string;
    width: string;
}

/**
 * The box a draft is drawn in while it is being placed.
 *
 * A draft is an event that does not exist yet, so it stands exactly where the
 * event will stand once it does. It did not: it filled its slot edge to edge,
 * running onto the hour line at its foot and out to the day's rule on either
 * side, while every event on the grid stops short of both. Dropping the draft
 * therefore moved it — the bar shifted the moment it became real, which reads
 * as the calendar correcting a mistake rather than as a placement being kept.
 *
 * The numbers are the ones the blocks themselves use, not copies: half the
 * vertical gap above, the whole of it taken out of the height, and the same
 * trim on the right that leaves room for the next column.
 */
export function draftPreviewBox(portion: DayPortion): GridBox {
    return {
        top: scaledPx(portion.topHours, EVENT_VGAP / 2),
        height: scaledHeightPx(portion.durationHours, -EVENT_VGAP),
        left: "0px",
        width: `calc(100% - ${OVERLAP_COL_GAP}px)`,
    };
}

/**
 * The box the rectangle dragged across the grid is drawn in.
 *
 * Not a draft: it says which span of time is being chosen, so it covers exactly
 * that span. Trimmed like an event, it would show a selection shorter than the
 * one being made.
 */
export function selectionBox(
    portion: DayPortion
): Pick<GridBox, "top" | "height"> {
    return {
        top: scaledPx(portion.topHours),
        height: scaledPx(portion.durationHours),
    };
}
