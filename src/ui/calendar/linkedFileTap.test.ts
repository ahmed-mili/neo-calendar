import {
    LINK_DOUBLE_TAP_WINDOW_MS,
    LinkedFileTapDecision,
    decideLinkedFileTap,
} from "./linkedFileTap";

const show = (itemId: string, at: number): LinkedFileTapDecision => ({
    action: "show-preview",
    nextTap: { itemId, at },
});

describe("linked file taps on Android", () => {
    it("uses a first tap only to show the address preview", () => {
        expect(decideLinkedFileTap(null, "link-a", 1_000, false)).toEqual(
            show("link-a", 1_000)
        );
    });

    it("opens when the second tap completes a double tap", () => {
        expect(
            decideLinkedFileTap(
                { itemId: "link-a", at: 1_000 },
                "link-a",
                1_000 + LINK_DOUBLE_TAP_WINDOW_MS,
                true
            )
        ).toEqual({ action: "open", nextTap: null });
    });

    it("hides the preview instead of opening on a later second tap", () => {
        const tapAt = 1_000 + LINK_DOUBLE_TAP_WINDOW_MS + 1;
        expect(
            decideLinkedFileTap(
                { itemId: "link-a", at: 1_000 },
                "link-a",
                tapAt,
                true
            )
        ).toEqual({
            action: "hide-preview",
            nextTap: { itemId: "link-a", at: tapAt },
        });
    });

    it("shows the preview again after it was hidden", () => {
        expect(
            decideLinkedFileTap(
                { itemId: "link-a", at: 1_000 },
                "link-a",
                2_000,
                false
            )
        ).toEqual(show("link-a", 2_000));
    });

    it("does not combine taps made on different links", () => {
        expect(
            decideLinkedFileTap(
                { itemId: "link-a", at: 1_000 },
                "link-b",
                1_100,
                false
            )
        ).toEqual(show("link-b", 1_100));
    });

    it("does not mistake a reset clock for a double tap", () => {
        expect(
            decideLinkedFileTap(
                { itemId: "link-a", at: 2_000 },
                "link-a",
                1_000,
                false
            )
        ).toEqual(show("link-a", 1_000));
    });
});
