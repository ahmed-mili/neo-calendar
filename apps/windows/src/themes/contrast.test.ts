import {
    contrastRatio,
    mixSrgb,
    over,
    parseColor,
    readableOn,
    relativeLuminance,
    withAlpha,
} from "./contrast";

describe("contraste WCAG", () => {
    it("noir sur blanc vaut 21", () => {
        expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
        expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    });

    it("le gris de référence #767676 passe 4,5 sur blanc, #777777 non", () => {
        expect(contrastRatio("#767676", "#ffffff")).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio("#777777", "#ffffff")).toBeLessThan(4.5);
    });

    it("lit l'hexadécimal, rgb() et rgba()", () => {
        expect(parseColor("#1e1e2e")).toEqual({ rgb: [30, 30, 46], alpha: 1 });
        expect(parseColor("rgb(30, 30, 46)")).toEqual({ rgb: [30, 30, 46], alpha: 1 });
        expect(parseColor("rgba(255, 255, 255, 0.22)")).toEqual({ rgb: [255, 255, 255], alpha: 0.22 });
        expect(() => parseColor("bleu")).toThrow();
    });

    it("mélange en sRGB comme color-mix, arrondi au plus proche", () => {
        expect(mixSrgb("#000000", "#ffffff", 0.5)).toBe("#808080");
        expect(mixSrgb("#000000", "#ffffff", 0)).toBe("#000000");
        expect(mixSrgb("#000000", "#ffffff", 1)).toBe("#ffffff");
    });

    it("compose un premier plan translucide sur son fond", () => {
        expect(over(withAlpha("#ffffff", 0.5), "#000000")).toBe("#808080");
        expect(contrastRatio(withAlpha("#ffffff", 0.5), "#000000")).toBeCloseTo(
            contrastRatio("#808080", "#000000"),
            5
        );
    });

    it("choisit du noir ou du blanc selon le fond", () => {
        expect(readableOn("#ffffff")).toBe("#000000");
        expect(readableOn("#000000")).toBe("#ffffff");
        expect(relativeLuminance("#000000")).toBe(0);
    });
});
