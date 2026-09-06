/** @jest-environment jsdom */
import * as fs from "fs";
import * as path from "path";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import TooltipLayer, { placeTooltip, TOOLTIP_DELAY_MS } from "./Tooltip";

const bubble = () => document.body.querySelector(".nc-tooltip");

const overlaysCss = fs.readFileSync(
    path.join(__dirname, "CalendarOverlays.css"),
    "utf8"
);

describe("la règle .nc-tooltip", () => {
    const rule = overlaysCss.slice(
        overlaysCss.indexOf(".nc-tooltip {"),
        overlaysCss.indexOf("@keyframes nc-tooltip-in")
    );

    // jsdom n'applique aucune feuille de style : la garantie se lit ici.
    it("ne prend jamais le pointeur", () => {
        expect(rule).toContain("pointer-events: none");
    });

    it("prend ses couleurs des variables de thème, pas d'une couleur en dur", () => {
        expect(rule).toContain("var(--nc-bg-crust");
        expect(rule).toContain("var(--nc-text-primary");
        expect(rule).not.toContain("backdrop-filter");
    });
});

describe("placeTooltip", () => {
    const viewport = { width: 1000, height: 800 };
    const size = { width: 100, height: 24 };

    it("centre la bulle au-dessus du déclencheur", () => {
        const place = placeTooltip(
            { left: 400, top: 300, width: 40, height: 20 },
            size,
            viewport
        );

        expect(place.side).toBe("above");
        // 300 - 6 (espace) - 24 (hauteur)
        expect(place.top).toBe(270);
        expect(place.left).toBe(370);
    });

    it("bascule en dessous quand le haut manque de place", () => {
        const place = placeTooltip(
            { left: 400, top: 4, width: 40, height: 20 },
            size,
            viewport
        );

        expect(place.side).toBe("below");
        expect(place.top).toBe(30);
    });

    it("ne sort jamais de l'écran sur les côtés", () => {
        expect(
            placeTooltip(
                { left: 0, top: 300, width: 20, height: 20 },
                size,
                viewport
            ).left
        ).toBe(8);
        expect(
            placeTooltip(
                { left: 990, top: 300, width: 20, height: 20 },
                size,
                viewport
            ).left
        ).toBe(892);
    });
});

describe("TooltipLayer", () => {
    let host: HTMLDivElement;
    let trigger: HTMLButtonElement;

    const over = (from?: Element) => {
        act(() => {
            trigger.dispatchEvent(
                new MouseEvent("mouseover", {
                    bubbles: true,
                    relatedTarget: from,
                })
            );
        });
    };
    const out = (to?: Element) => {
        act(() => {
            trigger.dispatchEvent(
                new MouseEvent("mouseout", { bubbles: true, relatedTarget: to })
            );
        });
    };

    beforeEach(() => {
        jest.useFakeTimers();
        host = document.createElement("div");
        document.body.appendChild(host);
        trigger = document.createElement("button");
        trigger.setAttribute("data-nc-tooltip", "Réduire les événements");
        document.body.appendChild(trigger);
        act(() => {
            ReactDOM.render(<TooltipLayer />, host);
        });
    });

    afterEach(() => {
        act(() => {
            ReactDOM.unmountComponentAtNode(host);
        });
        host.remove();
        trigger.remove();
        jest.useRealTimers();
    });

    it("n'apparaît qu'après le délai de survol", () => {
        over();
        expect(bubble()).toBeNull();

        act(() => {
            jest.advanceTimersByTime(TOOLTIP_DELAY_MS);
        });

        expect(bubble()?.textContent).toBe("Réduire les événements");
    });

    it("ne s'affiche pas si la souris repart avant le délai", () => {
        over();
        act(() => {
            jest.advanceTimersByTime(TOOLTIP_DELAY_MS / 2);
        });
        out();
        act(() => {
            jest.advanceTimersByTime(TOOLTIP_DELAY_MS);
        });

        expect(bubble()).toBeNull();
    });

    it("disparaît dès que la souris quitte le déclencheur", () => {
        over();
        act(() => {
            jest.advanceTimersByTime(TOOLTIP_DELAY_MS);
        });
        expect(bubble()).not.toBeNull();

        out();

        expect(bubble()).toBeNull();
    });

    it("reste affichée quand la souris passe sur un enfant du déclencheur", () => {
        const child = document.createElement("span");
        trigger.appendChild(child);
        over();
        act(() => {
            jest.advanceTimersByTime(TOOLTIP_DELAY_MS);
        });

        out(child);

        expect(bubble()).not.toBeNull();
    });

    it("s'affiche sans délai au focus clavier", () => {
        act(() => {
            trigger.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
        });

        expect(bubble()).not.toBeNull();
    });

    /*
     * Une bulle qui prend le pointeur se pose sous la souris, vole le survol du
     * bouton qu'elle décrit, puis son clic : elle ne doit jamais être une cible.
     */
    it("ne peut pas intercepter le pointeur", () => {
        over();
        act(() => {
            jest.advanceTimersByTime(TOOLTIP_DELAY_MS);
        });

        expect(bubble()?.className).toBe("nc-tooltip");
        expect(bubble()?.getAttribute("role")).toBe("tooltip");
        // Portée sur le body : marquée comme appartenant au panneau, sinon
        // usePopupDismiss lit un appui dessus comme un appui au dehors.
        expect(bubble()?.getAttribute("data-nc-popup-portal")).toBe("true");
    });

    it("part avec le premier appui", () => {
        over();
        act(() => {
            jest.advanceTimersByTime(TOOLTIP_DELAY_MS);
        });

        act(() => {
            document.dispatchEvent(new Event("pointerdown", { bubbles: true }));
        });

        expect(bubble()).toBeNull();
    });

    it("ne fait rien sur téléphone", () => {
        act(() => {
            ReactDOM.unmountComponentAtNode(host);
        });
        document.body.classList.add("nc-platform-android");
        act(() => {
            ReactDOM.render(<TooltipLayer />, host);
        });

        over();
        act(() => {
            jest.advanceTimersByTime(TOOLTIP_DELAY_MS);
        });

        expect(bubble()).toBeNull();
        document.body.classList.remove("nc-platform-android");
    });
});
