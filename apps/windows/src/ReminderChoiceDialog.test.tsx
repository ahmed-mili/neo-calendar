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
                    minutes: null,
                    inheritedMinutes: 10,
                    onPick: (value) => picked.push(value),
                    onClose: () => {
                        closed += 1;
                    },
                    ...props,
                }),
                host
            );
        });
    };

    const options = () =>
        Array.from(document.querySelectorAll<HTMLElement>('[role="radio"]'));

    const optionNamed = (text: string) => {
        const found = options().find((option) =>
            option.textContent?.includes(text)
        );
        if (!found) throw new Error(`Ligne absente du dialogue : ${text}`);
        return found;
    };

    const amountField = () =>
        document.querySelector<HTMLInputElement>(
            ".nc-reminder-custom__amount"
        )!;

    /* Trois unités se posent en boutons : un menu déroulant natif ouvre un
       popup dessiné par le système, que le thème ne sait pas habiller. */
    const unitButton = (unit: string) =>
        document.querySelector<HTMLButtonElement>(
            `.nc-reminder-custom__unit[data-unit="${unit}"]`
        )!;

    const chosenUnit = () =>
        Array.from(
            document.querySelectorAll<HTMLButtonElement>(
                ".nc-reminder-custom__unit"
            )
        ).find((button) => button.getAttribute("aria-pressed") === "true")
            ?.dataset.unit;

    it("offers the app setting first, saying what it is set to", () => {
        render({ inheritedMinutes: 10 });

        expect(options()[0].textContent).toContain(t("App setting"));
        expect(options()[0].textContent).toContain("10 minutes avant");
        expect(options()[0].getAttribute("aria-checked")).toBe("true");
    });

    it("hands the calendar back to the app setting", () => {
        render({ minutes: 30 });

        act(() => {
            optionNamed(t("App setting")).click();
        });

        expect(picked).toEqual([null]);
        expect(closed).toBe(1);
    });

    it("keeps a delay picked from the list", () => {
        render();

        act(() => {
            optionNamed("30 minutes avant").click();
        });

        expect(picked).toEqual([30]);
        expect(closed).toBe(1);
    });

    it("names the silence rather than a delay of zero", () => {
        render();

        act(() => {
            optionNamed(t("No reminder")).click();
        });

        expect(picked).toEqual([0]);
    });

    /* Un délai qui n'est pas dans la liste a été écrit dans le champ : le
       dialogue doit se rouvrir dessus, rempli, et non sur une liste où rien
       n'est coché. */
    it("opens on the custom row for a delay the list does not offer", () => {
        render({ minutes: 45 });

        expect(optionNamed(t("Custom")).getAttribute("aria-checked")).toBe(
            "true"
        );
        expect(amountField().value).toBe("45");
        expect(chosenUnit()).toBe("minutes");
    });

    it("reads a custom delay back in the unit it was written in", () => {
        render({ minutes: 120 });

        expect(amountField().value).toBe("2");
        expect(chosenUnit()).toBe("hours");
    });

    it("ranges the chosen unit into minutes", () => {
        render({ minutes: 45 });

        act(() => {
            amountField().value = "2";
            Simulate.change(amountField());
            unitButton("hours").click();
        });

        expect(picked.at(-1)).toBe(120);
        // Le champ reste ouvert : on y revient pour corriger l'unité.
        expect(closed).toBe(0);
    });

    /* Les Paramètres règlent ce défaut-là : lui proposer de se suivre
       lui-même ne veut rien dire. */
    it("leaves the app setting out when the app setting is what is being chosen", () => {
        render({ inheritedMinutes: undefined, minutes: 10 });

        expect(
            options().some((option) =>
                option.textContent?.includes(t("App setting"))
            )
        ).toBe(false);
        expect(
            optionNamed("10 minutes avant").getAttribute("aria-checked")
        ).toBe("true");
    });
});
