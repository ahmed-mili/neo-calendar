/** @jest-environment jsdom */
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import AddCalendarDialog from "./AddCalendarDialog";
import { applyLanguage } from "../../../src/ui/i18n";

describe("AddCalendarDialog", () => {
    let host: HTMLDivElement;

    beforeEach(() => {
        applyLanguage("fr");
        host = document.createElement("div");
        document.body.appendChild(host);
    });

    afterEach(() => {
        act(() => {
            ReactDOM.unmountComponentAtNode(host);
        });
        host.remove();
        document
            .querySelectorAll(".nc-add-calendar-dialog")
            .forEach((node) => node.remove());
        applyLanguage("fr");
    });

    const render = () => {
        act(() => {
            ReactDOM.render(
                React.createElement(AddCalendarDialog, {
                    open: true,
                    rootFolder: "C:/Calendrier",
                    existingNames: [],
                    onClose: () => {},
                    onCreate: async () => {},
                }),
                host
            );
        });
    };

    it("offers only the Full Note and automatic calendar types", () => {
        render();
        const cards = Array.from(
            document.querySelectorAll('[role="radiogroup"] [role="radio"]')
        ).map((node) => node.textContent);
        expect(cards).toHaveLength(2);
    });

    it("never offers an online subscription card", () => {
        render();
        expect(document.body.textContent).not.toContain("Online subscription");
        expect(document.body.textContent).not.toContain("Abonnement en ligne");
    });

    /*
     * Le champ d'adresse était absent, et sa raison — « un calendrier local n'a
     * pas de flux à lui » — a cessé d'être vraie avec la 1.57.0 : un calendrier
     * de notes reçoit désormais des liens ICS. Ce qui reste vrai, et que le test
     * au-dessus garde, c'est qu'un lien n'est pas un TYPE de calendrier : deux
     * cartes, pas trois. Le champ, lui, appartient à la carte « dossier de
     * notes », d'où l'on ne pouvait jusqu'ici pas poser de lien sans ressortir
     * du dialogue, créer le calendrier, le retrouver dans la barre latérale et
     * ouvrir son menu à trois points.
     */
    const urlField = () =>
        document.querySelector<HTMLInputElement>(
            'input[name="calendar-ics-url"]'
        );

    /** Écrire dans un champ contrôlé par React : passer par le setter du
     *  prototype, sinon React voit une valeur qu'il croit inchangée et
     *  n'appelle pas onChange. Même recette que IcsFeedsPanel.test. */
    const type = (field: HTMLInputElement, value: string) => {
        const setter = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value"
        )?.set;
        setter?.call(field, value);
        field.dispatchEvent(new Event("input", { bubbles: true }));
    };

    it("offers an optional ICS link on the notes-folder card", () => {
        render();
        const field = urlField();
        expect(field).not.toBeNull();
        expect(field?.placeholder).toContain("facultatif");
    });

    it("says where links are managed afterwards", () => {
        render();
        expect(document.body.textContent).toContain("Liens ICS");
        expect(document.body.textContent).toContain("lecture seule");
    });

    it("has no ICS link field on a holiday calendar", () => {
        render();
        act(() => {
            const cards = Array.from(
                document.querySelectorAll('[role="radio"]')
            );
            (cards[1] as HTMLButtonElement).click();
        });
        expect(urlField()).toBeNull();
    });

    it("hands the typed address back with the calendar", async () => {
        const requests: unknown[] = [];
        act(() => {
            ReactDOM.render(
                React.createElement(AddCalendarDialog, {
                    open: true,
                    rootFolder: "C:/Calendrier",
                    existingNames: [],
                    onClose: () => {},
                    onCreate: async (request) => {
                        requests.push(request);
                    },
                }),
                host
            );
        });

        const [nameField] = Array.from(
            document.querySelectorAll<HTMLInputElement>(
                ".nc-add-calendar-dialog__input-row input"
            )
        );
        act(() => {
            type(nameField, "Études");
            type(
                urlField() as HTMLInputElement,
                "webcal://exemple.fr/planning.ics"
            );
        });
        await act(async () => {
            document
                .querySelector("form")
                ?.dispatchEvent(
                    new Event("submit", { bubbles: true, cancelable: true })
                );
        });

        // webcal:// est réécrit en https:// avant d'être posé : c'est ce que la
        // synchro sait aller chercher.
        expect(requests).toEqual([
            {
                type: "local",
                name: "Études",
                icsUrl: "https://exemple.fr/planning.ics",
            },
        ]);
    });

    it("refuses an address the sync could never follow", async () => {
        const requests: unknown[] = [];
        act(() => {
            ReactDOM.render(
                React.createElement(AddCalendarDialog, {
                    open: true,
                    rootFolder: "C:/Calendrier",
                    existingNames: [],
                    onClose: () => {},
                    onCreate: async (request) => {
                        requests.push(request);
                    },
                }),
                host
            );
        });

        const [nameField] = Array.from(
            document.querySelectorAll<HTMLInputElement>(
                ".nc-add-calendar-dialog__input-row input"
            )
        );
        act(() => {
            type(nameField, "Études");
            type(urlField() as HTMLInputElement, "pas une adresse");
        });
        await act(async () => {
            document
                .querySelector("form")
                ?.dispatchEvent(
                    new Event("submit", { bubbles: true, cancelable: true })
                );
        });

        expect(requests).toEqual([]);
        expect(document.querySelector('[role="alert"]')?.textContent).toContain(
            "adresse"
        );
    });
});
