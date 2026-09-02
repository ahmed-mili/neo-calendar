/** @jest-environment jsdom */
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import ColorPicker from "./ColorPicker";

/*
 * Choisir une couleur au doigt.
 *
 * Les deux surfaces qui font le sélecteur — le carré saturation/valeur et la
 * barre de teinte — se manœuvrent en glissant. Elles n'écoutaient que la
 * souris : sur un téléphone, une tape produit encore un événement souris de
 * compatibilité, mais un glissement n'en produit aucun. On pouvait donc poser
 * un point et rien de plus, ce qui est à peu près tout ce qu'un sélecteur de
 * couleur sert à faire. Les événements pointeur couvrent la souris, le doigt
 * et le stylet d'un seul tenant.
 */
describe("dragging the colour picker with a finger", () => {
    let host: HTMLDivElement;
    let emitted: string[];

    const anchor = {
        top: 100,
        bottom: 130,
        left: 40,
        right: 120,
        width: 80,
        height: 30,
        x: 40,
        y: 100,
        toJSON: () => ({}),
    } as DOMRect;

    beforeEach(() => {
        emitted = [];
        host = document.createElement("div");
        document.body.appendChild(host);
        act(() => {
            ReactDOM.render(
                <ColorPicker
                    color="#4ca8df"
                    anchorRect={anchor}
                    onChange={(hex) => emitted.push(hex)}
                    onClose={() => {}}
                />,
                host
            );
        });
    });

    afterEach(() => {
        act(() => {
            ReactDOM.unmountComponentAtNode(host);
        });
        host.remove();
        document.body.innerHTML = "";
    });

    const surface = (selector: string): HTMLElement => {
        const found = document.querySelector<HTMLElement>(selector);
        if (!found) throw new Error(`Surface absente : ${selector}`);
        return found;
    };

    /** Un vrai PointerEvent n'existe pas dans jsdom : on en fabrique un qui
     *  porte ce que le code lit, `clientX` et `clientY`. */
    const pointer = (type: string, x: number, y: number): Event => {
        const event = new MouseEvent(type, {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
        });
        return event;
    };

    it("takes the saturation square by pointer, not by mouse alone", () => {
        const square = surface(".nc-cp-sv");
        square.getBoundingClientRect = () =>
            ({ left: 0, top: 0, width: 200, height: 150 } as DOMRect);

        act(() => {
            square.dispatchEvent(pointer("pointerdown", 100, 75));
        });
        expect(emitted.length).toBeGreaterThan(0);

        const afterPress = emitted.length;
        act(() => {
            window.dispatchEvent(pointer("pointermove", 160, 20));
        });
        expect(emitted.length).toBeGreaterThan(afterPress);
    });

    it("takes the hue bar by pointer too", () => {
        const bar = surface(".nc-cp-hue");
        bar.getBoundingClientRect = () =>
            ({ left: 0, top: 0, width: 200, height: 12 } as DOMRect);

        act(() => {
            bar.dispatchEvent(pointer("pointerdown", 50, 6));
        });
        const afterPress = emitted.length;
        expect(afterPress).toBeGreaterThan(0);

        act(() => {
            window.dispatchEvent(pointer("pointermove", 150, 6));
        });
        expect(emitted.length).toBeGreaterThan(afterPress);
    });

    it("lets go on pointerup, so the colour stops following the finger", () => {
        const bar = surface(".nc-cp-hue");
        bar.getBoundingClientRect = () =>
            ({ left: 0, top: 0, width: 200, height: 12 } as DOMRect);

        act(() => {
            bar.dispatchEvent(pointer("pointerdown", 50, 6));
            window.dispatchEvent(pointer("pointerup", 50, 6));
        });
        const afterRelease = emitted.length;

        act(() => {
            window.dispatchEvent(pointer("pointermove", 190, 6));
        });
        expect(emitted).toHaveLength(afterRelease);
    });

    it("keeps the browser from stealing the gesture for a scroll", () => {
        // Sans `touch-action: none`, le navigateur interprete le glissement
        // comme un defilement et le sélecteur ne recoit plus rien.
        const css = require("fs").readFileSync(
            require("path").join(__dirname, "ColorPicker.css"),
            "utf8"
        ) as string;
        for (const selector of [".nc-cp-sv", ".nc-cp-hue"]) {
            const at = css.indexOf(`${selector} {`);
            expect(at).toBeGreaterThan(-1);
            const rule = css.slice(at, css.indexOf("}", at));
            expect(rule).toContain("touch-action: none");
        }
    });
});
