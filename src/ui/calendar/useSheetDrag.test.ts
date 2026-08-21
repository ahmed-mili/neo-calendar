import {
    isDragHandleTarget,
    nextAnchorOnTap,
    offsetForAnchor,
    restOffsetFor,
    settleSheet,
    sheetHandleGlyph,
    dragsSheetFromBody,
    rubberBand,
} from "./useSheetDrag";

/** A sheet 600px tall whose lowest open anchor is 240px down from the top. */
const SHEET = { height: 600, restOffset: 240 };

describe("settleSheet", () => {
    it("settles back to rest when barely moved", () => {
        expect(settleSheet({ ...SHEET, offset: 250, velocity: 0 })).toBe("low");
    });

    // The middle anchor is the one the bar stands for: half way between filling
    // the screen and standing at rest.
    it("settles on the middle anchor when left near it", () => {
        expect(settleSheet({ ...SHEET, offset: 130, velocity: 0 })).toBe(
            "half"
        );
    });

    it("fills the screen when pulled most of the way up", () => {
        expect(settleSheet({ ...SHEET, offset: 40, velocity: 0 })).toBe("full");
    });

    it("dismisses when dragged past halfway to the bottom", () => {
        expect(settleSheet({ ...SHEET, offset: 500, velocity: 0 })).toBe(
            "closed"
        );
    });

    it("stays open when dragged down but not far enough", () => {
        expect(settleSheet({ ...SHEET, offset: 330, velocity: 0 })).toBe("low");
    });

    // A flick moves the sheet one step in the direction it was thrown. Throwing
    // it down from the top must not dismiss it: that is how a sheet loses work.
    it("steps down one anchor on a downward flick from the top", () => {
        expect(settleSheet({ ...SHEET, offset: 30, velocity: 2 })).toBe("half");
    });

    it("steps down one anchor on a downward flick from the middle", () => {
        expect(settleSheet({ ...SHEET, offset: 125, velocity: 2 })).toBe("low");
    });

    it("dismisses on a downward flick from rest", () => {
        expect(settleSheet({ ...SHEET, offset: 250, velocity: 2 })).toBe(
            "closed"
        );
    });

    it("fills the screen on an upward flick from rest", () => {
        expect(settleSheet({ ...SHEET, offset: 250, velocity: -2 })).toBe(
            "half"
        );
    });

    it("fills the screen on an upward flick from near the top", () => {
        expect(settleSheet({ ...SHEET, offset: 80, velocity: -2 })).toBe(
            "full"
        );
    });

    it("ignores a slow drift that never reaches the flick threshold", () => {
        expect(settleSheet({ ...SHEET, offset: 560, velocity: 0.2 })).toBe(
            "closed"
        );
    });

    // A sheet already laid out at its full height has a single resting anchor,
    // so the gesture degrades to pull-down-to-dismiss without special-casing.
    it("has only rest and dismissed when there is no half anchor", () => {
        // With the rest anchor at the top, all three open anchors collapse onto
        // it: there is one place to be open and one to be gone.
        const full = { height: 600, restOffset: 0 };
        expect(settleSheet({ ...full, offset: 120, velocity: 0 })).toBe("full");
        expect(settleSheet({ ...full, offset: 400, velocity: 0 })).toBe(
            "closed"
        );
    });
});

describe("offsetForAnchor", () => {
    it("places each anchor at its own translation", () => {
        expect(offsetForAnchor({ ...SHEET, anchor: "full" })).toBe(0);
        expect(offsetForAnchor({ ...SHEET, anchor: "half" })).toBe(120);
        expect(offsetForAnchor({ ...SHEET, anchor: "low" })).toBe(240);
        expect(offsetForAnchor({ ...SHEET, anchor: "closed" })).toBe(600);
    });
});

/*
 * The three places the sheet can stand, and the one control that says which.
 *
 * Google Calendar draws a bar across the top of its sheet and turns it into a
 * chevron at the ends of the range: pointing up when there is room to grow,
 * down when there is room to shrink. Pressing it moves the sheet, so the mark
 * is both the state and the way out of it.
 */
describe("what pressing the handle does", () => {
    it("grows a sheet standing at its lowest", () => {
        expect(nextAnchorOnTap("low")).toBe("half");
    });

    it("grows it again, to fill the screen", () => {
        expect(nextAnchorOnTap("half")).toBe("full");
    });

    /*
     * And from there it comes back to the middle rather than all the way down.
     * Pressing settles into an alternation between the middle and the top: the
     * lowest anchor is somewhere you drag to, not somewhere a press can strand
     * you.
     */
    it("brings a full sheet back to the middle, not to the bottom", () => {
        expect(nextAnchorOnTap("full")).toBe("half");
        expect(nextAnchorOnTap(nextAnchorOnTap("full"))).toBe("full");
    });
});

describe("what the handle is drawn as", () => {
    it("points up when the sheet can only grow", () => {
        expect(sheetHandleGlyph("low")).toBe("up");
    });

    it("is a bar in the middle, where it can go either way", () => {
        expect(sheetHandleGlyph("half")).toBe("bar");
    });

    it("points down when the sheet fills the screen", () => {
        expect(sheetHandleGlyph("full")).toBe("down");
    });
});

describe("isDragHandleTarget", () => {
    /** Stands in for a DOM node: only `closest` is consulted. */
    const node = (control: boolean, handle = false) => ({
        closest: (selector: string) => {
            if (selector.includes("nc-sheet-handle")) return handle ? {} : null;
            return control && selector.includes("button") ? {} : null;
        },
    });

    it("lets the sheet take a touch on its bare header", () => {
        expect(isDragHandleTarget(node(false) as unknown as EventTarget)).toBe(
            true
        );
    });

    // The close and menu buttons live in the header: a touch on one of them is
    // that button's, or the sheet would swallow every tap on its own controls.
    it("leaves a touch on a control to the control", () => {
        expect(isDragHandleTarget(node(true) as unknown as EventTarget)).toBe(
            false
        );
    });

    it("ignores a touch that has no element behind it", () => {
        expect(isDragHandleTarget(null)).toBe(false);
        expect(isDragHandleTarget({} as unknown as EventTarget)).toBe(false);
    });

    /*
     * Except the handle, which is a button and is also the one thing on the
     * header everybody reaches for to drag. It answers a press by moving the
     * sheet one anchor and a drag by following the finger; refusing the drag
     * because it happens to be a <button> would take away the gesture the bar
     * has always advertised.
     */
    it("keeps the sheet's own handle draggable, button or not", () => {
        expect(
            isDragHandleTarget(node(true, true) as unknown as EventTarget)
        ).toBe(true);
    });
});

describe("restOffsetFor", () => {
    // A share of the sheet's own height, never of the screen's: the sheet is
    // sized in dvh, which the keyboard shrinks, while window.innerHeight is not.
    it("stands a sheet at its share of its own height", () => {
        expect(restOffsetFor({ height: 800, variant: "sheet" })).toBe(320);
    });

    it("stands a draft lower than an event", () => {
        const sheet = restOffsetFor({ height: 800, variant: "sheet" });
        const draft = restOffsetFor({ height: 800, variant: "draft" });

        expect(draft).toBeGreaterThan(sheet);
    });

    // A tall screen would otherwise rest the sheet at two thirds of a very
    // large surface, which is a wall of empty form rather than a sheet.
    it("caps the resting height on a large screen", () => {
        expect(restOffsetFor({ height: 1600, variant: "sheet" })).toBe(1120);
    });

    /*
     * The bug this replaced: with the keyboard up the sheet measured 340px
     * while the screen still reported 904, so the resting height came out
     * taller than the sheet and clamped to zero — the top anchor. The sheet
     * sprang open instead of staying where it was.
     */
    it("never lands on the top anchor just because the sheet is short", () => {
        expect(restOffsetFor({ height: 340, variant: "draft" })).toBe(170);
        expect(restOffsetFor({ height: 340, variant: "sheet" })).toBeCloseTo(
            132.6
        );
    });

    it("never pushes the sheet further than its own height", () => {
        const offset = restOffsetFor({ height: 300, variant: "sheet" });

        expect(offset).toBeGreaterThanOrEqual(0);
        expect(offset).toBeLessThanOrEqual(300);
    });
});

// ── Tirer la feuille depuis son corps ──────────────────────

describe("dragsSheetFromBody", () => {
    it("tire la feuille quand la liste est deja en haut", () => {
        // Plus rien a remonter : le doigt voulait la feuille.
        expect(dragsSheetFromBody(0, 20)).toBe(true);
    });

    it("laisse defiler quand la liste a du contenu au-dessus", () => {
        // Voler ce geste, c'est rendre la liste impossible a remonter.
        expect(dragsSheetFromBody(120, 20)).toBe(false);
    });

    it("ne prend jamais un geste vers le haut", () => {
        // Vers le haut, on lit la suite de la liste.
        expect(dragsSheetFromBody(0, -20)).toBe(false);
    });

    it("tolere un scrollTop negatif du rebond elastique", () => {
        expect(dragsSheetFromBody(-8, 20)).toBe(true);
    });
});

// ── La resistance elastique ────────────────────────────────

describe("rubberBand", () => {
    it("ne bouge pas tant qu'on ne depasse pas", () => {
        expect(rubberBand(0, 800)).toBe(0);
        expect(rubberBand(-30, 800)).toBe(0);
    });

    it("suit le doigt, mais moins loin que lui", () => {
        // C'est toute la sensation : ca cede, mais pas autant qu'on tire.
        const moved = rubberBand(100, 800);
        expect(moved).toBeGreaterThan(0);
        expect(moved).toBeLessThan(100);
    });

    it("cede de moins en moins a mesure qu'on force", () => {
        // Le deuxieme centimetre doit rendre moins que le premier, sinon la
        // resistance ne se sent pas.
        const premier = rubberBand(100, 800);
        const second = rubberBand(200, 800) - premier;
        expect(second).toBeLessThan(premier);
    });

    it("n'atteint jamais la dimension, meme tire tres loin", () => {
        // C'est ce qui fait qu'on sent toujours tirer contre quelque chose.
        expect(rubberBand(100000, 800)).toBeLessThan(800);
    });

    it("reste sur une dimension nulle", () => {
        expect(rubberBand(100, 0)).toBe(0);
    });
});
