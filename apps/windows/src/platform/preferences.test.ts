import { normalizeDesktopPreferences } from "./preferences";

describe("normalizeDesktopPreferences", () => {
    it("uses safe defaults for missing settings", () => {
        expect(normalizeDesktopPreferences(null)).toEqual({
            dataFolder: null,
            themeId: "catppuccin-mocha",
        });
    });

    it("keeps a selected folder", () => {
        expect(
            normalizeDesktopPreferences({
                dataFolder: "C:\\Neo Calendar",
                themeId: "catppuccin-mocha",
            })
        ).toEqual({
            dataFolder: "C:\\Neo Calendar",
            themeId: "catppuccin-mocha",
        });
    });

    it("rejects blank folders and unknown themes", () => {
        expect(
            normalizeDesktopPreferences({
                dataFolder: "   ",
                themeId: "unknown",
            })
        ).toEqual({
            dataFolder: null,
            themeId: "catppuccin-mocha",
        });
    });
});
