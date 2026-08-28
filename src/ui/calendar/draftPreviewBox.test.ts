import { draftPreviewBox, selectionBox } from "./draftPreviewBox";

const portion = { topHours: 9.5, durationHours: 0.5 };

describe("the box a draft is drawn in while it is being placed", () => {
    it("does not move or resize when the pointer is released", () => {
        expect(draftPreviewBox(portion)).toEqual(selectionBox(portion));
    });

    it.each([
        { topHours: 0, durationHours: 0.25 },
        { topHours: 9.5, durationHours: 0.5 },
        { topHours: 23.5, durationHours: 0.5 },
        { topHours: 4.25, durationHours: 3.75 },
    ])(
        "keeps the exact selected span at $topHours for $durationHours hours",
        (candidate) => {
            expect(draftPreviewBox(candidate)).toEqual(selectionBox(candidate));
        }
    );

    it("is measured in hour heights, not in fixed pixels", () => {
        expect(draftPreviewBox(portion).top).toContain("--nc-hour-height");
        expect(draftPreviewBox(portion).height).toContain("--nc-hour-height");
    });
});
