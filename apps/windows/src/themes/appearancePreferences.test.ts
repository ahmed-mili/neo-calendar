import {
    getEffectiveThemeAppearance,
    normalizeAppearancePreferences,
    pinWallpaperId,
    resetThemeCustomization,
    resolveWallpaperId,
    setThemeCustomization,
    setWallpaperId,
    type AppearancePreferences,
} from "./appearancePreferences";
import { getTheme } from "./registry";

const base = (patch: Partial<AppearancePreferences> = {}): AppearancePreferences =>
    normalizeAppearancePreferences({ ...patch });

describe("fond d'écran global", () => {
    it("sans réglage global ni fond par thème : le défaut", () => {
        const prefs = base();
        expect(prefs.wallpaperId).toBeUndefined();
        expect(resolveWallpaperId(prefs, "catppuccin-mocha")).toBe("theme-default");
    });

    it("sans réglage global : le fond du thème actuel, jamais celui d'un autre", () => {
        const prefs = normalizeAppearancePreferences({
            themeOverrides: {
                github: { wallpaperId: "panorama-valley" },
                one: { wallpaperId: "golden-summit" },
            },
        });
        expect(resolveWallpaperId(prefs, "github")).toBe("panorama-valley");
        expect(resolveWallpaperId(prefs, "one")).toBe("golden-summit");
        expect(resolveWallpaperId(prefs, "ayu")).toBe("theme-default");
    });

    it("le réglage global l'emporte sur tout fond par thème (incohérence)", () => {
        const prefs = normalizeAppearancePreferences({
            wallpaperId: "none",
            themeOverrides: { github: { wallpaperId: "panorama-valley" } },
        });
        expect(resolveWallpaperId(prefs, "github")).toBe("none");
        expect(getEffectiveThemeAppearance(getTheme("github"), prefs).wallpaperId).toBe("none");
    });

    it("un réglage global inconnu est écarté et le repli reprend", () => {
        const prefs = normalizeAppearancePreferences({
            wallpaperId: "inexistant",
            themeOverrides: { github: { wallpaperId: "panorama-valley" } },
        });
        expect(prefs.wallpaperId).toBeUndefined();
        expect(resolveWallpaperId(prefs, "github")).toBe("panorama-valley");
    });

    it("lit le JSON d'une version plus ancienne (sans clé globale) sans rien inventer", () => {
        const old = '{"mode":"dark","translucentSidebar":true,"contrast":50,"themeOverrides":{"catppuccin-mocha":{"wallpaperId":"golden-summit"}}}';
        const prefs = normalizeAppearancePreferences(JSON.parse(old));
        expect("wallpaperId" in prefs).toBe(false);
        expect(resolveWallpaperId(prefs, "catppuccin-mocha")).toBe("golden-summit");
        expect(JSON.stringify(prefs)).toBe(old);
    });

    it("écrit la clé globale en dernier, seulement si elle est définie", () => {
        const withGlobal = setWallpaperId(base(), "none");
        expect(JSON.stringify(withGlobal)).toBe(
            '{"mode":"dark","translucentSidebar":true,"contrast":50,"themeOverrides":{},"wallpaperId":"none"}'
        );
        expect(JSON.stringify(base())).not.toContain("wallpaperId");
    });

    it("un thème retiré dans les préférences ne plante rien et ne change pas le fond lu", () => {
        const prefs = normalizeAppearancePreferences({
            wallpaperId: "none",
            themeOverrides: { "tokyo-night": { accent: "#112233", wallpaperId: "golden-summit" } },
        });
        expect(prefs.themeOverrides["tokyo-night" as never]).toBeDefined();
        expect(resolveWallpaperId(prefs, getTheme("tokyo-night").id)).toBe("none");
    });

    it("sans réglage global, un thème retiré garde son fond en passant sur Catppuccin", () => {
        const prefs = normalizeAppearancePreferences({
            themeOverrides: { "tokyo-night": { wallpaperId: "golden-summit" } },
        });
        // Le thème enregistré (même retiré) d'abord, sans passer par getTheme.
        expect(resolveWallpaperId(prefs, "tokyo-night")).toBe("golden-summit");
        expect(
            getEffectiveThemeAppearance(getTheme("tokyo-night"), prefs, "tokyo-night").wallpaperId
        ).toBe("golden-summit");
    });

    it("thème retiré sans fond propre : celui de Catppuccin, puis le défaut", () => {
        const withCatppuccin = normalizeAppearancePreferences({
            themeOverrides: { "catppuccin-mocha": { wallpaperId: "panorama-valley" } },
        });
        expect(resolveWallpaperId(withCatppuccin, "theme-inconnu")).toBe("panorama-valley");
        expect(resolveWallpaperId(base(), "theme-inconnu")).toBe("theme-default");
        // Un thème conservé sans fond ne prend pas celui de Catppuccin.
        expect(resolveWallpaperId(withCatppuccin, "github")).toBe("theme-default");
    });

    it("changer de thème fige le fond tant que rien n'est global", () => {
        const prefs = normalizeAppearancePreferences({
            themeOverrides: { github: { wallpaperId: "panorama-valley" } },
        });
        const pinned = pinWallpaperId(prefs, "github");
        expect(pinned.wallpaperId).toBe("panorama-valley");
        expect(resolveWallpaperId(pinned, "one")).toBe("panorama-valley");
        // déjà global : rien ne bouge
        expect(pinWallpaperId(pinned, "one")).toBe(pinned);
    });

    it("enregistrer les couleurs d'un thème garde son fond par thème (repli intact)", () => {
        const prefs = normalizeAppearancePreferences({
            themeOverrides: { github: { wallpaperId: "panorama-valley" } },
        });
        const saved = setThemeCustomization(prefs, "github", { accent: "#112233" });
        expect(saved.themeOverrides.github?.accent).toBe("#112233");
        expect(resolveWallpaperId(saved, "github")).toBe("panorama-valley");
    });

    it("réinitialiser un thème ne change plus le fond", () => {
        const prefs = normalizeAppearancePreferences({
            themeOverrides: { github: { accent: "#112233", wallpaperId: "panorama-valley" } },
        });
        const reset = resetThemeCustomization(prefs, "github");
        expect(reset.themeOverrides.github).toBeUndefined();
        expect(resolveWallpaperId(reset, "github")).toBe("panorama-valley");
    });
});
