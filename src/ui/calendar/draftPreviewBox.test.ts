import { draftPreviewBox, selectionBox } from "./draftPreviewBox";
import { EVENT_VGAP, OVERLAP_COL_GAP } from "./calendarConstants";

const portion = { topHours: 9.5, durationHours: 0.5 };

describe("the box a draft is drawn in while it is being placed", () => {
    /*
     * A draft is an event that does not exist yet, so it stands where the event
     * will stand. It did not: it filled its slot edge to edge, so it ran onto
     * the hour line at its foot and out to the day's own rule on either side,
     * while every event on the grid stops short of both.
     */
    it("stops short of the hour line, exactly as an event does", () => {
        const box = draftPreviewBox(portion);
        expect(box.top).toContain(`+ ${EVENT_VGAP / 2}px`);
        expect(box.height).toContain(`- ${EVENT_VGAP}px`);
    });

    it("leaves the same room on its right as an event does", () => {
        expect(draftPreviewBox(portion).width).toBe(
            `calc(100% - ${OVERLAP_COL_GAP}px)`
        );
        expect(draftPreviewBox(portion).left).toBe("0px");
    });

    /*
     * The rectangle dragged out across the grid is not a draft: it says which
     * span of time is being chosen, so it covers exactly that span. Trimming it
     * would make the selection read as shorter than it is.
     */
    it("is not the rectangle a drag across the grid leaves behind", () => {
        const selection = selectionBox(portion);
        // The spaces matter: every one of these values names
        // --nc-hour-height, so a bare "-" would match the variable itself.
        expect(selection.top).not.toContain(" + ");
        expect(selection.height).not.toContain(" - ");
    });

    // Both are laid out against the same hour height, so a change of zoom moves
    // them together rather than only one of them.
    it("is measured in hour heights, not in fixed pixels", () => {
        expect(draftPreviewBox(portion).top).toContain("--nc-hour-height");
        expect(draftPreviewBox(portion).height).toContain("--nc-hour-height");
    });
});
