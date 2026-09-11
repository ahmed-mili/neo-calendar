/** @jest-environment jsdom */
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act, Simulate } from "react-dom/test-utils";
import CalendarItemMenu, { CalendarMenuItem } from "./CalendarItemMenu";

/*
 * Le menu d'un calendrier sait ouvrir un sous-menu : au survol après un court
 * délai d'intention, au clic, au clavier. Passer de la ligne à son sous-menu
 * ne le referme pas, et une ligne cochée le dit.
 */
describe("CalendarItemMenu en cascade", () => {
    let host: HTMLDivElement;
    const anchor = {
        top: 100,
        left: 100,
        right: 130,
        bottom: 120,
        width: 30,
        height: 20,
    } as DOMRect;

    beforeEach(() => {
        jest.useFakeTimers();
        host = document.createElement("div");
        document.body.appendChild(host);
    });

    afterEach(() => {
        act(() => {
            ReactDOM.unmountComponentAtNode(host);
        });
        host.remove();
        document
            .querySelectorAll(".nc-cal-menu, .nc-cal-menu-overlay")
            .forEach((node) => node.remove());
        jest.useRealTimers();
    });

    const render = (items: CalendarMenuItem[], onClose = jest.fn()) => {
        act(() => {
            ReactDOM.render(
                <CalendarItemMenu
                    items={items}
                    anchorRect={anchor}
                    onClose={onClose}
                />,
                host
            );
        });
        return onClose;
    };

    const row = (label: string) =>
        Array.from(
            document.querySelectorAll<HTMLButtonElement>(
                '.nc-cal-menu-item[role="menuitem"]'
            )
        ).find((button) => button.textContent?.includes(label))!;

    const submenus = () => document.querySelectorAll(".nc-cal-menu--sub");

    const items = (
        extra: Partial<CalendarMenuItem> = {}
    ): CalendarMenuItem[] => [
        { key: "plain", label: "Couleur", onClick: jest.fn() },
        {
            key: "reminder",
            label: "Rappel",
            children: [
                {
                    key: "app",
                    label: "Réglage de l'application",
                    note: "5 minutes avant",
                    checked: true,
                    onClick: jest.fn(),
                },
                { key: "30", label: "30 minutes avant", onClick: jest.fn() },
            ],
            ...extra,
        },
    ];

    it("ouvre le sous-menu au survol, après le délai d'intention", () => {
        render(items());
        act(() => {
            Simulate.mouseEnter(row("Rappel"));
        });
        expect(submenus()).toHaveLength(0);
        act(() => {
            jest.advanceTimersByTime(150);
        });
        expect(submenus()).toHaveLength(1);
        expect(row("Rappel").getAttribute("aria-expanded")).toBe("true");
    });

    it("ouvre le sous-menu au clic sans refermer le menu", () => {
        const onClose = render(items());
        act(() => {
            row("Rappel").click();
        });
        expect(submenus()).toHaveLength(1);
        expect(onClose).not.toHaveBeenCalled();
    });

    it("ne referme pas le sous-menu quand la souris passe de la ligne au sous-menu", () => {
        render(items());
        act(() => {
            Simulate.mouseEnter(row("Rappel"));
            jest.advanceTimersByTime(150);
        });
        act(() => {
            Simulate.mouseLeave(row("Rappel"));
            Simulate.mouseEnter(submenus()[0]);
            jest.advanceTimersByTime(400);
        });
        expect(submenus()).toHaveLength(1);
    });

    it("referme le sous-menu quand la souris le quitte pour de bon", () => {
        render(items());
        act(() => {
            Simulate.mouseEnter(row("Rappel"));
            jest.advanceTimersByTime(150);
        });
        act(() => {
            Simulate.mouseLeave(row("Rappel"));
            jest.advanceTimersByTime(320);
        });
        expect(submenus()).toHaveLength(0);
    });

    it("coche la ligne en cours et écrit sa note", () => {
        render(items());
        act(() => {
            row("Rappel").click();
        });
        const app = row("Réglage de l'application");
        expect(app.getAttribute("aria-checked")).toBe("true");
        expect(app.querySelector(".nc-cal-menu-check")).not.toBeNull();
        expect(app.querySelector(".nc-cal-menu-note")?.textContent).toBe(
            "5 minutes avant"
        );
        expect(row("30 minutes avant").getAttribute("aria-checked")).toBe(
            "false"
        );
    });

    it("agit et referme tout au clic sur une ligne du sous-menu", () => {
        const list = items();
        const onClose = render(list);
        act(() => {
            row("Rappel").click();
        });
        act(() => {
            row("30 minutes avant").click();
        });
        expect(list[1].children![1].onClick).toHaveBeenCalled();
        expect(onClose).toHaveBeenCalled();
    });

    it("laisse le menu ouvert sur une ligne keepOpen et rend son bloc libre", () => {
        const list = items({
            content: <input className="nc-test-field" aria-label="champ" />,
        });
        list[1].children!.push({
            key: "custom",
            label: "Personnalisé",
            keepOpen: true,
            onClick: jest.fn(),
        });
        const onClose = render(list);
        act(() => {
            row("Rappel").click();
        });
        expect(
            document.querySelector(".nc-cal-menu-content .nc-test-field")
        ).not.toBeNull();
        act(() => {
            row("Personnalisé").click();
        });
        expect(onClose).not.toHaveBeenCalled();
        expect(submenus()).toHaveLength(1);
    });

    it("ouvre au clavier par flèche droite et referme par flèche gauche", () => {
        render(items());
        act(() => {
            Simulate.keyDown(row("Rappel"), { key: "ArrowRight" });
        });
        expect(submenus()).toHaveLength(1);
        act(() => {
            Simulate.keyDown(row("30 minutes avant"), { key: "ArrowLeft" });
        });
        expect(submenus()).toHaveLength(0);
    });

    it("referme le sous-menu par Échap, puis le menu", () => {
        const onClose = render(items());
        act(() => {
            row("Rappel").click();
        });
        act(() => {
            Simulate.keyDown(row("30 minutes avant"), { key: "Escape" });
        });
        expect(submenus()).toHaveLength(0);
        expect(onClose).not.toHaveBeenCalled();
        act(() => {
            Simulate.keyDown(row("Rappel"), { key: "Escape" });
        });
        expect(onClose).toHaveBeenCalled();
    });

    it("n'ouvre rien sur une ligne désactivée", () => {
        const list = items({ disabled: true });
        render(list);
        act(() => {
            Simulate.mouseEnter(row("Rappel"));
            jest.advanceTimersByTime(150);
        });
        expect(submenus()).toHaveLength(0);
    });

    /* Le sous-menu se pose à droite de sa ligne, première ligne alignée sur
       elle ; quand la fenêtre manque de place à droite, il bascule à gauche. */
    it("bascule à gauche quand la place manque à droite", () => {
        const widthSpy = jest
            .spyOn(HTMLElement.prototype, "offsetWidth", "get")
            .mockReturnValue(230);
        const innerWidth = window.innerWidth;
        Object.defineProperty(window, "innerWidth", {
            value: 400,
            configurable: true,
        });
        render(items());
        act(() => {
            row("Rappel").click();
        });
        const sub = submenus()[0] as HTMLElement;
        const left = parseFloat(sub.style.left);
        // À droite il déborderait (la racine est calée à droite de l'ancre,
        // vers 130 px, plus 230 px de menu, plus 230 px de sous-menu > 400).
        expect(left).toBeLessThan(130);
        widthSpy.mockRestore();
        Object.defineProperty(window, "innerWidth", {
            value: innerWidth,
            configurable: true,
        });
    });
});
