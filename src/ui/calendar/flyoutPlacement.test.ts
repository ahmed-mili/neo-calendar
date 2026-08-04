import { placeFlyout } from "./flyoutPlacement";

const OPTS = { gap: 4, margin: 12, minHeight: 140 };

describe("placeFlyout", () => {
    it("ouvre sous le bouton quand la place ne manque pas", () => {
        // Bouton a 100-144 dans une fenetre de 900 : 744 px sous lui.
        const p = placeFlyout({ top: 100, bottom: 144 }, 900, OPTS);
        expect(p.side).toBe("below");
        expect(p.top).toBe(148);
        expect(p.bottom).toBeNull();
        expect(p.maxHeight).toBe(740);
    });

    // Le cas qui motivait ce module : bouton bas, clavier virtuel ouvert.
    it("bascule au-dessus quand le dessous est trop court", () => {
        // Fenetre de 420 (clavier), bouton a 340-384 : 32 px dessous,
        // 324 px dessus.
        const p = placeFlyout({ top: 340, bottom: 384 }, 420, OPTS);
        expect(p.side).toBe("above");
        expect(p.top).toBeNull();
        // Ancre par le bas : 420 - 340 + 4 = 84 px depuis le bas de l'ecran,
        // ce qui pose le bord bas du menu 4 px au-dessus du bouton.
        expect(p.bottom).toBe(84);
        expect(p.maxHeight).toBe(324);
    });

    it("ne deborde jamais du bas quand il ouvre vers le bas", () => {
        const vh = 900;
        for (const bottom of [100, 400, 700, 743, 744]) {
            const p = placeFlyout({ top: bottom - 44, bottom }, vh, OPTS);
            if (p.side !== "below") continue;
            expect(p.top! + p.maxHeight).toBeLessThanOrEqual(vh - OPTS.margin);
        }
    });

    it("reste en dessous a place egale plutot que de sauter", () => {
        // Bouton centre : autant de place des deux cotes, mais les deux sont
        // sous le plancher. Sans la comparaison stricte, le menu basculerait
        // pour rien.
        const p = placeFlyout({ top: 120, bottom: 164 }, 288, OPTS);
        expect(p.side).toBe("below");
    });

    it("garde le plancher lisible meme quand aucun cote ne suffit", () => {
        // Fenetre minuscule : les deux cotes sont trop courts, le menu defilera.
        const p = placeFlyout({ top: 90, bottom: 134 }, 200, OPTS);
        expect(p.maxHeight).toBe(OPTS.minHeight);
    });

    it("honore un plancher different (menu des calendriers)", () => {
        const opts = { gap: 5, margin: 12, minHeight: 160 };
        const p = placeFlyout({ top: 300, bottom: 344 }, 420, opts);
        expect(p.side).toBe("above");
        expect(p.maxHeight).toBe(283);
    });
});
