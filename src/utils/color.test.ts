import {
    parseColor,
    normalizeColor,
    withAlpha,
    readableTextColor,
    rgbToHex,
    FALLBACK_COLOR,
} from "./color";

describe("parseColor", () => {
    it("lit un hex a 6 chiffres", () => {
        expect(parseColor("#3264ff")).toEqual({ r: 0x32, g: 0x64, b: 0xff });
    });

    it("lit un hex a 3 chiffres en doublant chaque chiffre", () => {
        expect(parseColor("#f0a")).toEqual({ r: 255, g: 0, b: 170 });
    });

    it("ignore l'alpha d'un hex a 8 chiffres", () => {
        expect(parseColor("#3264ff80")).toEqual({ r: 0x32, g: 0x64, b: 0xff });
    });

    it("accepte la casse et les espaces", () => {
        expect(parseColor("  #3264FF ")).toEqual({ r: 0x32, g: 0x64, b: 0xff });
    });

    // Le cas qui cassait tout : --interactive-accent resolu par le theme.
    it("lit la forme rgb() rendue par getComputedStyle", () => {
        expect(parseColor("rgb(101,143,242)")).toEqual({
            r: 101,
            g: 143,
            b: 242,
        });
    });

    it("lit rgba() en ignorant l'alpha", () => {
        expect(parseColor("rgba(101, 143, 242, 0.5)")).toEqual({
            r: 101,
            g: 143,
            b: 242,
        });
    });

    it("lit la syntaxe moderne a espaces et slash", () => {
        expect(parseColor("rgb(101 143 242 / 50%)")).toEqual({
            r: 101,
            g: 143,
            b: 242,
        });
    });

    it("lit hsl()", () => {
        // hsl(0, 100%, 50%) est le rouge pur.
        expect(parseColor("hsl(0, 100%, 50%)")).toEqual({ r: 255, g: 0, b: 0 });
        // hsl(120, 100%, 50%) est le vert pur.
        expect(parseColor("hsl(120, 100%, 50%)")).toEqual({
            r: 0,
            g: 255,
            b: 0,
        });
    });

    it("lit hsla() en ignorant l'alpha", () => {
        expect(parseColor("hsla(240, 100%, 50%, 0.3)")).toEqual({
            r: 0,
            g: 0,
            b: 255,
        });
    });

    it("rend null sur une chaine illisible plutot qu'une couleur inventee", () => {
        expect(parseColor("")).toBeNull();
        expect(parseColor(null)).toBeNull();
        expect(parseColor(undefined)).toBeNull();
        expect(parseColor("chartreuse")).toBeNull();
        expect(parseColor("#12345")).toBeNull();
        expect(parseColor("#gggggg")).toBeNull();
        expect(parseColor("rgb(1,2)")).toBeNull();
    });
});

describe("normalizeColor", () => {
    it("laisse un hex valide intact", () => {
        expect(normalizeColor("#3264ff")).toBe("#3264ff");
    });

    it("convertit la couleur d'accent du theme en hex", () => {
        expect(normalizeColor("rgb(101,143,242)")).toBe("#658ff2");
    });

    it("retombe sur la couleur de repli quand rien n'est lisible", () => {
        expect(normalizeColor("nope")).toBe(FALLBACK_COLOR);
    });

    it("est idempotent", () => {
        const once = normalizeColor("hsl(210, 80%, 60%)");
        expect(normalizeColor(once)).toBe(once);
    });
});

describe("withAlpha", () => {
    it("produit un rgba() valide depuis un hex", () => {
        expect(withAlpha("#3264ff", 0.15)).toBe("rgba(50, 100, 255, 0.15)");
    });

    // Regression : `color + "99"` produisait "rgb(101,143,242)99", ignore par le
    // moteur CSS, donc un ghost de drag sans fond.
    it("produit un rgba() valide depuis une couleur rgb()", () => {
        expect(withAlpha("rgb(101,143,242)", 0.6)).toBe(
            "rgba(101, 143, 242, 0.6)"
        );
    });

    it("ne produit jamais de NaN", () => {
        expect(withAlpha("garbage", 0.2)).not.toContain("NaN");
    });
});

describe("readableTextColor", () => {
    it("met du texte sombre sur un fond clair", () => {
        expect(readableTextColor("#ffffff")).toBe("#1a1a1a");
        expect(readableTextColor("rgb(255,255,255)")).toBe("#1a1a1a");
    });

    it("met du texte clair sur un fond sombre", () => {
        expect(readableTextColor("#101010")).toBe("#ffffff");
        expect(readableTextColor("rgb(16,16,16)")).toBe("#ffffff");
    });

    // Avant le fix, une couleur rgb() donnait NaN > 0.6 === false, donc du blanc
    // par accident — juste pour du jaune vif, illisible.
    it("choisit du texte sombre sur un jaune vif donne en rgb()", () => {
        expect(readableTextColor("rgb(244,190,64)")).toBe("#1a1a1a");
    });
});

describe("rgbToHex", () => {
    it("borne et arrondit les composantes hors plage", () => {
        expect(rgbToHex({ r: -5, g: 300, b: 127.6 })).toBe("#00ff80");
    });
});
