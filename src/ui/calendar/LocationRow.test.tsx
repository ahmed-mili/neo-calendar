/** @jest-environment jsdom */

import * as React from "react";
import * as ReactDOM from "react-dom";
import { act, Simulate } from "react-dom/test-utils";
import { LocationRow } from "./EventPanelRows";
import { applyLanguage, t } from "../i18n";

/*
 * Où se tient l'évènement.
 *
 * Le lieu était lu du flux et écrit dans la note — « Efrei Bat. C C001 » y
 * était depuis toujours — mais la fiche ne le montrait nulle part : la salle
 * d'un cours ne se lisait qu'en ouvrant le fichier. Il prend donc sa rangée
 * juste au-dessus de la description, comme dans Notion Calendar.
 */
describe("LocationRow", () => {
    let host: HTMLDivElement;
    let setLocation: jest.Mock;
    let onAutoSave: jest.Mock;

    beforeEach(() => {
        applyLanguage("fr");
        host = document.createElement("div");
        document.body.appendChild(host);
        setLocation = jest.fn();
        onAutoSave = jest.fn();
    });

    afterEach(() => {
        act(() => {
            ReactDOM.unmountComponentAtNode(host);
        });
        document.body.innerHTML = "";
    });

    const render = (location: string, editable = true) => {
        act(() => {
            ReactDOM.render(
                <LocationRow
                    location={location}
                    editable={editable}
                    setLocation={setLocation}
                    onAutoSave={onAutoSave}
                />,
                host
            );
        });
    };

    const field = () => host.querySelector<HTMLInputElement>("input");

    it("shows the room an event is held in", () => {
        render("Efrei Bat. C C001", false);
        expect(host.textContent).toContain("Efrei Bat. C C001");
    });

    it("offers the place to write one when the event is editable", () => {
        render("");
        expect(field()).not.toBeNull();
        expect(field()?.placeholder).toBe(t("Location"));
    });

    it("hands back what is typed, and asks for a save", () => {
        render("");
        const input = field();
        act(() => {
            if (input) {
                input.value = "Efrei Bat. H H305";
                Simulate.change(input);
            }
        });
        expect(setLocation).toHaveBeenCalledWith("Efrei Bat. H H305");

        act(() => {
            if (input) Simulate.blur(input);
        });
        expect(onAutoSave).toHaveBeenCalled();
    });

    it("takes no field on an event nothing can change", () => {
        // Un évènement venu d'un lien ICS ne se modifie pas : lui offrir un
        // champ inviterait à une chose impossible.
        render("Efrei Bat. C C001", false);
        expect(field()).toBeNull();
    });

    it("says nothing at all when it is empty and locked", () => {
        // Même règle que la description : sans lieu et sans droit d'écrire, la
        // rangée n'a rien à dire et ne prend pas une ligne pour le dire.
        render("", false);
        expect(host.textContent).toBe("");
    });

    it("carries the pin in the panel's single icon column", () => {
        render("Efrei Bat. C C001", false);
        expect(host.querySelector(".nc-panel-row-icon")).not.toBeNull();
        expect(host.querySelector(".nc-panel-row")).not.toBeNull();
    });
});

/*
 * Suivre le lieu jusqu'à la carte.
 *
 * Quatre états, quatre contrats : verrouillé et vide (rien du tout, déjà
 * couvert plus haut), verrouillé avec un lieu (le texte est le lien),
 * modifiable et vide (un champ, rien à ouvrir), modifiable avec un lieu (le
 * champ reste pour écrire, et un bouton mène à la carte).
 */
describe("LocationRow — jusqu'à la carte", () => {
    let host: HTMLDivElement;
    let onOpen: jest.Mock;

    beforeEach(() => {
        applyLanguage("fr");
        host = document.createElement("div");
        document.body.appendChild(host);
        onOpen = jest.fn();
    });

    afterEach(() => {
        act(() => {
            ReactDOM.unmountComponentAtNode(host);
        });
        document.body.innerHTML = "";
    });

    const render = (location: string, editable: boolean) => {
        act(() => {
            ReactDOM.render(
                <LocationRow
                    location={location}
                    editable={editable}
                    setLocation={jest.fn()}
                    onAutoSave={jest.fn()}
                    onOpenLocation={onOpen}
                />,
                host
            );
        });
    };

    const opener = () =>
        host.querySelector<HTMLElement>("[data-nc-location-open]");

    it("makes a locked place the link itself", () => {
        render("Efrei Bat. C C001", false);
        const link = opener();
        expect(link).not.toBeNull();
        act(() => {
            link?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        expect(onOpen).toHaveBeenCalledWith(
            "https://www.google.com/maps/search/?api=1&query=Efrei%20Bat.%20C%20C001"
        );
    });

    it("keeps the field to write in, and adds a way to the map", () => {
        render("Efrei Bat. H H305", true);
        expect(host.querySelector("input")).not.toBeNull();
        expect(opener()).not.toBeNull();
    });

    it("offers no way to a map that has nothing to show", () => {
        render("", true);
        expect(opener()).toBeNull();
    });

    it("says where it goes, for whoever cannot see it", () => {
        render("Efrei Bat. C C001", false);
        expect(opener()?.getAttribute("aria-label")).toBe(t("Open in Maps"));
    });

    it("goes nowhere when nobody is listening", () => {
        // Le plugin Obsidian ne passe pas de gestionnaire : la rangée doit
        // alors se lire sans se presenter comme un lien.
        act(() => {
            ReactDOM.render(
                <LocationRow
                    location="Efrei Bat. C C001"
                    editable={false}
                    setLocation={jest.fn()}
                    onAutoSave={jest.fn()}
                />,
                host
            );
        });
        expect(opener()).toBeNull();
        expect(host.textContent).toContain("Efrei Bat. C C001");
    });
});
