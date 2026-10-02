import { readFileSync } from "fs";
import { join } from "path";
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

    it("ne garde que les six thèmes choisis, Catppuccin en premier", () => {
        expect(THEMES.map((theme) => theme.id)).toEqual([
            "catppuccin-mocha",
            "github",
            "one",
            "ayu",
            "rose-pine",
            "vercel",
        ]);
    });

    it("un thème retiré retombe sur Catppuccin sans rien lever", () => {
        for (const retired of [
            "tokyo-night",
            "absolutely",
            "linear",
            "lobster",
            "matrix",
            "oscurange",
            "raycast",
            "vscode-plus",
        ]) {
            expect(getTheme(retired).id).toBe("catppuccin-mocha");
        }
    });

    it("chaque thème a son bloc CSS, et aucun thème retiré n'en garde un", () => {
        const css = ["codex-themes.css", "catppuccin-mocha.css"]
            .map((file) => readFileSync(join(__dirname, file), "utf8"))
            .join("\n");
        const declared = new Set(
            [...css.matchAll(/\.nc-theme-([a-z-]+)(?=[\s,{])/g)]
                .map((match) => match[1])
                .filter((name) => !["accent", "ink", "surface"].includes(name))
        );
        expect([...declared].sort()).toEqual(
            THEMES.map((theme) => theme.id).sort()
        );
    });
});
