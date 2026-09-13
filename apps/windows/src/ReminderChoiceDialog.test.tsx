/** @jest-environment jsdom */
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act, Simulate } from "react-dom/test-utils";
import ReminderChoiceDialog from "./ReminderChoiceDialog";
import { applyLanguage, t } from "../../../src/ui/i18n";

describe("ReminderChoiceDialog", () => {
    let host: HTMLDivElement;
    let picked: Array<number | null>;
    let closed: number;

    beforeEach(() => {
        applyLanguage("fr");
        picked = [];
        closed = 0;
        host = document.createElement("div");
        document.body.appendChild(host);
    });

    afterEach(() => {
        act(() => {
            ReactDOM.unmountComponentAtNode(host);
        });
        host.remove();
        document
            .querySelectorAll(".nc-choice-backdrop")
            .forEach((node) => node.remove());
    });

    const render = (
        props: Partial<React.ComponentProps<typeof ReminderChoiceDialog>> = {}
    ) => {
        act(() => {
            ReactDOM.render(
                React.createElement(ReminderChoiceDialog, {
                    title: `${t("Reminder")} — Cours`,
                    mode: "calendar",
                    minutes: null,
                    inheritedMinutes: [10],
                    onPick: (value: number | number[] | null) =>
                        picked.push(value),
                    onClose: () => {
                        closed += 1;
                    },
                    ...props,
                } as React.ComponentProps<typeof ReminderChoiceDialog>),
                host
            );
        });
    };

    const options = () =>
        Array.from(
            document.querySelectorAll<HTMLElement>(
                '[role="checkbox"], [role="radio"]'
            )
        );

    const optionNamed = (text: string) => {
        const found = options().find((option) =>
            option.textContent?.includes(text)
        );
        if (!found) throw new Error(`Ligne absente du dialogue : ${text}`);
        return found;
    };

    /* Le compteur jours / heures / minutes, le même que dans le sous-menu du
       PC : trois champs nus dans une seule case, et une coche pour valider. */
    const parts = () =>
        Array.from(
            document.querySelectorAll<HTMLInputElement>(
                ".nc-cal-menu-delay__part input"
            )
        );

    const okButton = () =>
        document.querySelector<HTMLButtonElement>(".nc-cal-menu-minutes__ok");

    it("offers the app setting first, saying what it is set to", () => {
        render({ inheritedMinutes: [10] });

        expect(options()[0].textContent).toContain(t("App setting"));
        expect(options()[0].textContent).toContain("10 minutes avant");
        expect(options()[0].getAttribute("aria-checked")).toBe("true");
    });

    it("hands the calendar back to the app setting, greyed once left", () => {
        render({ minutes: [30] });

        expect(options()[0].classList.contains("nc-choice-option--muted")).toBe(
            true
        );
        act(() => {
            optionNamed(t("App setting")).click();
        });

        expect(picked).toEqual([null]);
        expect(closed).toBe(1);
    });

    /* Comme dans le sous-menu du PC : les lignes se cochent et se décochent,
       et le dialogue reste ouvert pour la suivante. */
    it("ticks and unticks delays from the list without closing", () => {
        render({ minutes: [10] });

        act(() => {
            optionNamed("30 minutes avant").click();
        });
        expect(picked).toEqual([[10, 30]]);

        render({ minutes: [10, 30] });
        act(() => {
            optionNamed("30 minutes avant").click();
        });
        expect(picked.at(-1)).toEqual([10]);
        expect(closed).toBe(0);
    });

    it("names the silence rather than a delay of zero", () => {
        render();

        act(() => {
            optionNamed(t("No reminder")).click();
        });

        expect(picked).toEqual([[]]);
        expect(closed).toBe(1);
    });

    /* Un délai que la liste ne propose pas a été écrit au compteur : il a sa
       ligne, cochée, et se décoche comme les autres. */
    it("gives a delay the list does not offer its own ticked row", () => {
        render({ minutes: [45] });

        const extra = optionNamed("45 minutes avant");
        expect(extra.getAttribute("aria-checked")).toBe("true");
        act(() => {
            extra.click();
        });
        expect(picked).toEqual([[]]);
    });

    it("adds the sum of the counter, days and minutes together", () => {
        render({ minutes: [30] });

        expect(okButton()!.disabled).toBe(true);
        const [days, , minutes] = parts();
        act(() => {
            days.value = "1";
            Simulate.change(days);
            minutes.value = "30";
            Simulate.change(minutes);
        });
        act(() => {
            okButton()!.click();
        });

        expect(picked.at(-1)).toEqual([30, 1470]);
        expect(parts().map((input) => input.value)).toEqual(["", "", ""]);
        // Le dialogue reste ouvert : on y revient pour le délai suivant.
        expect(closed).toBe(0);
    });

    /* Les Paramètres règlent ce défaut-là : pas de ligne « Réglage de
       l'application » (lui proposer de se suivre lui-même ne veut rien dire),
       mais la même liste à cocher, qui reste ouverte. */
    it("lets the app setting hold several delays too", () => {
        render({ mode: "app", minutes: [10] });

        expect(
            options().some((option) =>
                option.textContent?.includes(t("App setting"))
            )
        ).toBe(false);
        expect(
            optionNamed("10 minutes avant").getAttribute("aria-checked")
        ).toBe("true");

        act(() => {
            optionNamed("30 minutes avant").click();
        });
        expect(picked).toEqual([[10, 30]]);
        expect(closed).toBe(0);
    });

    it("writes a custom app delay from the counter, on its own row", () => {
        render({ mode: "app", minutes: [45] });

        expect(
            optionNamed("45 minutes avant").getAttribute("aria-checked")
        ).toBe("true");
        const [, hours] = parts();
        act(() => {
            hours.value = "2";
            Simulate.change(hours);
        });
        act(() => {
            okButton()!.click();
        });

        expect(picked).toEqual([[45, 120]]);
        expect(closed).toBe(0);
    });
});
