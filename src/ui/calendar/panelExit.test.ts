import * as fs from "fs";
import * as path from "path";
import {
    PANEL_EXIT_ANIMATION,
    PANEL_EXIT_CLASS,
    panelHasLeft,
} from "./panelExit";

const css = fs.readFileSync(
    path.join(__dirname, "CalendarOverlays.css"),
    "utf8"
);

/** The declarations written on one selector, comments stripped. */
function declarationsFor(selector: string): Record<string, string> {
    const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const normalize = (value: string) => value.trim().replace(/\s+/g, " ");

    for (const rule of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (!rule[1].split(",").map(normalize).includes(selector)) continue;
        return Object.fromEntries(
            rule[2]
                .split(";")
                .map((declaration) => declaration.trim())
                .filter(Boolean)
                .map((declaration) => {
                    const separator = declaration.indexOf(":");
                    return [
                        declaration.slice(0, separator).trim(),
                        normalize(declaration.slice(separator + 1)),
                    ];
                })
        );
    }

    throw new Error(`Missing CSS selector: ${selector}`);
}

const end = {
    leaving: true,
    animationName: PANEL_EXIT_ANIMATION,
    fromPanel: true,
};

describe("the way the event panel leaves", () => {
    /*
     * The panel arrived with a 180 ms scale-and-fade and left in a single
     * frame: measured on screen, it was already gone 35 ms after the X was
     * pressed. Half a movement reads as breakage, not as speed.
     */
    it("has a way out, and not only a way in", () => {
        expect(css).toContain(`@keyframes ${PANEL_EXIT_ANIMATION}`);
    });

    it("plays it under the class the panel wears on its way out", () => {
        const leaving = declarationsFor(`.nc-event-popup.${PANEL_EXIT_CLASS}`);
        expect(leaving.animation).toContain(PANEL_EXIT_ANIMATION);
        // Without `forwards` the panel springs back to full size for the frame
        // between the animation ending and the unmount — a flash on the way
        // out, which is the very thing being fixed.
        expect(leaving.animation).toContain("forwards");
        // A panel on its way out must not answer a click meant for what is
        // underneath it.
        expect(leaving["pointer-events"]).toBe("none");
    });
});

describe("the animationend the panel disappears on", () => {
    it("is its own exit animation, once it has been asked to leave", () => {
        expect(panelHasLeft(end)).toBe(true);
    });

    // The entry animation ends 180 ms after the panel opens. Closing on it
    // would make the panel shut itself as soon as it had finished arriving.
    it("is not the entry animation finishing", () => {
        expect(
            panelHasLeft({
                ...end,
                leaving: false,
                animationName: "nc-popup-in",
            })
        ).toBe(false);
        expect(panelHasLeft({ ...end, animationName: "nc-popup-in" })).toBe(
            false
        );
    });

    // animationend bubbles, and the panel is full of animated rows, menus and
    // toggles. Any one of them finishing would otherwise close the panel.
    it("is not a row inside the panel finishing its own", () => {
        expect(panelHasLeft({ ...end, fromPanel: false })).toBe(false);
    });
});
