import { DEFAULT_THEME_ID, getTheme, THEMES } from "./registry";

describe("desktop theme registry", () => {
    it("uses Catppuccin Mocha as the first and fallback theme", () => {
        expect(DEFAULT_THEME_ID).toBe("catppuccin-mocha");
        expect(getTheme(undefined).id).toBe("catppuccin-mocha");
        expect(getTheme("unknown").id).toBe("catppuccin-mocha");
        // The first entry is what the picker opens on. Which themes follow it
        // is a matter of taste and changes freely, so this does not pin the
        // rest of the list.
        expect(THEMES[0].id).toBe("catppuccin-mocha");
    });

    it("gives every theme a distinct id", () => {
        const ids = THEMES.map((theme) => theme.id);

        expect(new Set(ids).size).toBe(ids.length);
    });

    it("resolves every registered theme by its own id", () => {
        for (const theme of THEMES) {
            expect(getTheme(theme.id).id).toBe(theme.id);
        }
    });
});
