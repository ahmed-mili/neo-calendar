/** @jest-environment jsdom */
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { restOffsetFor, useSheetDrag } from "./useSheetDrag";

describe("Android draft sheet", () => {
    let host: HTMLDivElement;
    let height: number;
    let onClose: jest.Mock;
    let sheet: HTMLElement;
    let resize: () => void;

    function Harness({ variant = "draft" }: { variant?: "draft" | "sheet" }) {
        const sheetRef = React.useRef<HTMLDivElement>(null);
        const handleRef = React.useRef<HTMLDivElement>(null);
        const controls = useSheetDrag({
            enabled: true,
            sheetRef,
            handleRef,
            variant,
            onClose,
        });
        return (
            <div ref={sheetRef} data-anchor={controls.anchor}>
                <div ref={handleRef}>
                    <button onClick={controls.pressHandle}>Expand</button>
                </div>
                <input aria-label="Title" />
                <button onClick={controls.requestClose}>Close</button>
            </div>
        );
    }

    beforeEach(() => {
        jest.useFakeTimers();
        host = document.createElement("div");
        document.body.append(host);
        height = 780;
        onClose = jest.fn();
        jest.spyOn(
            HTMLElement.prototype,
            "getBoundingClientRect"
        ).mockImplementation(() => ({ height } as DOMRect));
        Object.defineProperty(window, "matchMedia", {
            configurable: true,
            value: () => ({ matches: false }),
        });
        Object.defineProperty(window, "ResizeObserver", {
            configurable: true,
            value: class {
                constructor(callback: () => void) {
                    resize = callback;
                }
                observe() {}
                disconnect() {}
            },
        });
    });

    afterEach(() => {
        act(() => ReactDOM.unmountComponentAtNode(host));
        host.remove();
        jest.restoreAllMocks();
        jest.useRealTimers();
    });

    const render = (variant: "draft" | "sheet" = "draft") => {
        act(() => ReactDOM.render(<Harness variant={variant} />, host));
        sheet = host.firstElementChild as HTMLElement;
    };

    it("opens a draft at a compact anchor with the title keyboard closed", () => {
        render();
        const offset = Number.parseFloat(
            sheet.style.getPropertyValue("--nc-sheet-offset")
        );
        expect(sheet.dataset.anchor).toBe("half");
        expect(height - offset).toBeGreaterThanOrEqual(190);
        expect(height - offset).toBeLessThanOrEqual(230);
        expect(document.activeElement).not.toBe(host.querySelector("input"));
    });

    /*
     * La feuille est déjà sous l'écran quand on la mesure pour la première
     * fois.
     *
     * Lire sa géométrie fige la valeur calculée de son `transform`, et c'est
     * de cette valeur-là que part la transition d'ouverture. Mesurée avant
     * que `--nc-sheet-offset` ne soit écrit, elle se fige sur le repli de la
     * feuille de style (39 % de la hauteur) : l'ouverture partait donc de la
     * mi-hauteur et DESCENDAIT vers son ancre. Relevé image par image sur le
     * brouillon, 780 px de haut : 304 → 570 px, la feuille apparaissait trop
     * haut puis se remettait en place.
     *
     * L'ordre est donc ce qu'on vérifie, pas la valeur finale — celle-ci
     * était déjà juste quand l'ouverture était fausse.
     */
    it("stands off-screen before anything measures it", () => {
        const offsetWhenMeasured: string[] = [];
        jest.spyOn(
            HTMLElement.prototype,
            "getBoundingClientRect"
        ).mockImplementation(function (this: HTMLElement) {
            if (this === host.firstElementChild) {
                offsetWhenMeasured.push(
                    this.style.getPropertyValue("--nc-sheet-offset") || "(rien)"
                );
            }
            return { height } as DOMRect;
        });

        render();

        expect(offsetWhenMeasured[0]).toBe("100%");
    });

    it("still opens an existing event fully", () => {
        render("sheet");
        expect(sheet.dataset.anchor).toBe("full");
        expect(sheet.style.getPropertyValue("--nc-sheet-offset")).toBe("0px");
    });

    /** Ce que fait un doigt : il touche le champ, puis le champ prend le focus. */
    const tapInto = (field: HTMLElement) => {
        field.dispatchEvent(new Event("pointerdown", { bubbles: true }));
        field.focus();
    };

    it("expands when the title receives focus, and stays expanded as the keyboard resizes it", () => {
        render();
        act(() => tapInto(host.querySelector("input")!));
        expect(sheet.dataset.anchor).toBe("full");
        height = 420;
        act(() => resize());
        expect(sheet.style.getPropertyValue("--nc-sheet-offset")).toBe("0px");
    });

    /* La WebView pose le focus sur le premier champ des que la feuille
       apparait. Ce focus-la n'est de personne : il montait la feuille en plein
       ecran, et rien ne l'en faisait redescendre. */
    it("ignores a focus nobody asked for", () => {
        render();
        const resting = sheet.style.getPropertyValue("--nc-sheet-offset");
        act(() => host.querySelector("input")!.focus());
        expect(sheet.dataset.anchor).toBe("half");
        expect(sheet.style.getPropertyValue("--nc-sheet-offset")).toBe(resting);
    });

    it("keeps the compact anchor attached to the bottom after a resize", () => {
        render();
        height = 660;
        act(() => resize());
        expect(sheet.style.getPropertyValue("--nc-sheet-offset")).toBe(
            restOffsetFor({ height, variant: "draft" }) + "px"
        );
    });

    it("closes even if the viewport resizes during the exit", () => {
        render();
        act(() => host.querySelectorAll("button")[1].click());
        height = 660;
        act(() => resize());
        act(() => jest.advanceTimersByTime(300));
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
