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

/*
 * La rangée ne décide de rien : elle transmet.
 *
 * L'adresse du lien et le mode de trajet viennent tous deux d'ailleurs — le
 * panneau des liens ICS pour l'une, les réglages pour l'autre — et se
 * rejoignent ici, au seul endroit où l'on sait de quel évènement il s'agit.
 * Ce qui se vérifie est donc l'URL ouverte, pas la façon dont elle est bâtie.
 */
describe("LocationRow — l'itinéraire ouvert", () => {
    const CAMPUS = "Efrei, 30-32 avenue de la République, 94800 Villejuif";
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

    const follow = (
        props: Partial<React.ComponentProps<typeof LocationRow>>
    ) => {
        act(() => {
            ReactDOM.render(
                <LocationRow
                    location="Efrei Bat. C C001"
                    editable={false}
                    setLocation={jest.fn()}
                    onAutoSave={jest.fn()}
                    onOpenLocation={onOpen}
                    {...props}
                />,
                host
            );
        });
        act(() => {
            host.querySelector<HTMLElement>(
                "[data-nc-location-open]"
            )?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        return onOpen.mock.calls[0]?.[0] as string | undefined;
    };

    it("opens the way to the address set on the link", () => {
        expect(follow({ linkAddress: CAMPUS })).toBe(
            `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                CAMPUS
            )}`
        );
    });

    it("carries the travel mode that was set", () => {
        expect(
            follow({ linkAddress: CAMPUS, travelMode: "transit" })
        ).toContain("&travelmode=transit");
    });

    it("says nothing of a mode nobody chose", () => {
        expect(follow({ linkAddress: CAMPUS })).not.toContain("travelmode");
    });
});

/*
 * Par quelle carte le lieu s'ouvre.
 *
 * Le lieu partait droit dans Google Maps, ce qui va bien à une adresse et mal
 * à un trajet en métro : le RER se lit dans Citymapper, pas dans Maps. Le clic
 * ouvre donc un menu, sauf si un réglage a tranché — et sauf s'il n'y a qu'une
 * carte à proposer, un menu d'une seule entrée n'étant qu'un clic de plus.
 */
describe("LocationRow — le choix de la carte", () => {
    const CAMPUS = "48.7887337,2.3637327";
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

    const show = (props: Partial<React.ComponentProps<typeof LocationRow>>) => {
        act(() => {
            ReactDOM.render(
                <LocationRow
                    location="Amphi B"
                    geo={CAMPUS}
                    editable={false}
                    setLocation={jest.fn()}
                    onAutoSave={jest.fn()}
                    onOpenLocation={onOpen}
                    mapsApps={["google", "citymapper", "waze"]}
                    {...props}
                />,
                host
            );
        });
    };

    const press = (selector: string) =>
        act(() => {
            document
                .querySelector<HTMLElement>(selector)
                ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

    const menu = () => document.querySelector(".nc-panel-maps-menu");

    it("opens a menu rather than a map when nothing is set", () => {
        show({});
        press("[data-nc-location-open]");

        expect(menu()).not.toBeNull();
        expect(onOpen).not.toHaveBeenCalled();
        expect(menu()?.textContent).toContain("Citymapper");
    });

    it("follows the app that was picked in the menu", () => {
        show({});
        press("[data-nc-location-open]");
        press('[data-nc-maps-app="citymapper"]');

        expect(onOpen).toHaveBeenCalledWith(
            expect.stringContaining("citymapper.com/directions?endcoord=")
        );
        expect(menu()).toBeNull();
    });

    /* Le menu est porté sur le body : sans cette marque, le premier appui
       dessus refermerait la fiche sous lui (voir usePopupDismiss). */
    it("marks its menu as belonging to the panel", () => {
        show({});
        press("[data-nc-location-open]");

        expect(menu()?.getAttribute("data-nc-popup-portal")).toBe("true");
    });

    it("goes straight there when an app has been set", () => {
        show({ mapsApp: "waze" });
        press("[data-nc-location-open]");

        expect(menu()).toBeNull();
        expect(onOpen).toHaveBeenCalledWith(
            expect.stringContaining("waze.com/ul?ll=")
        );
    });

    /* Un menu d'une seule entrée ne demande rien : il fait attendre. */
    it("skips the menu when only one app can be offered", () => {
        show({ mapsApps: ["google"] });
        press("[data-nc-location-open]");

        expect(menu()).toBeNull();
        expect(onOpen).toHaveBeenCalledWith(
            expect.stringContaining("google.com/maps/dir/")
        );
    });

    /*
     * Le réglage garde une application choisie un jour où elle convenait.
     * Sur un évènement sans point — une salle écrite à la main — Citymapper
     * n'ouvrirait qu'un formulaire vide, alors que Maps sait encore chercher.
     */
    it("falls back to Maps when the set app cannot read the place", () => {
        show({ location: "Efrei Bat. C C001", geo: "", mapsApp: "citymapper" });
        press("[data-nc-location-open]");

        expect(onOpen).toHaveBeenCalledWith(
            expect.stringContaining("google.com/maps/search/")
        );
    });

    /* Une visioconférence n'a rien à faire sur une carte : le lien s'ouvre. */
    it("opens a meeting link without asking anything", () => {
        show({ location: "https://teams.test/42", geo: "" });
        press("[data-nc-location-open]");

        expect(menu()).toBeNull();
        expect(onOpen).toHaveBeenCalledWith("https://teams.test/42");
    });
});
