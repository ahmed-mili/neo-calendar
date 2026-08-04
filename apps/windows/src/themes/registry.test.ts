import { DEFAULT_THEME_ID, getTheme, THEMES } from "./registry";

describe("desktop theme registry", () => {
    it("uses Catppuccin Mocha as the first and fallback theme", () => {
        expect(DEFAULT_THEME_ID).toBe("catppuccin-mocha");
        expect(getTheme(undefined).id).toBe("catppuccin-mocha");
        expect(getTheme("unknown").id).toBe("catppuccin-mocha");
        expect(THEMES.map((theme) => theme.id)).toEqual(["catppuccin-mocha"]);
    });
});
