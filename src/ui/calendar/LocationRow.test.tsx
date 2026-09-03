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

/*
 * Sur le téléphone, le menu prend la forme qu'Android donne aux siens.
 *
 * Un menu ancré sur sa rangée est une forme d'ordinateur : sur un écran tenu à
 * la main, ce qui propose un choix monte du bas, sous le pouce, et se ferme en
 * touchant à côté. Les icônes viennent du téléphone lui-même — on reconnaît
 * Citymapper à son rond bleu avant d'avoir lu son nom.
 */
describe("LocationRow — la feuille du téléphone", () => {
    const CAMPUS = "48.7887337,2.3637327";
    const ICON = "data:image/png;base64,AAAA";
    let host: HTMLDivElement;

    beforeEach(() => {
        applyLanguage("fr");
        document.body.classList.add("nc-platform-android");
        host = document.createElement("div");
        document.body.appendChild(host);
    });

    afterEach(() => {
        act(() => {
            ReactDOM.unmountComponentAtNode(host);
        });
        document.body.classList.remove("nc-platform-android");
        document.body.innerHTML = "";
    });

    const openMenu = (
        props: Partial<React.ComponentProps<typeof LocationRow>> = {}
    ) => {
        act(() => {
            ReactDOM.render(
                <LocationRow
                    location="Amphi B"
                    geo={CAMPUS}
                    editable={false}
                    setLocation={jest.fn()}
                    onAutoSave={jest.fn()}
                    onOpenLocation={jest.fn()}
                    mapsApps={["google", "citymapper", "waze"]}
                    nativeMapsApps
                    {...props}
                />,
                host
            );
        });
        act(() => {
            document
                .querySelector<HTMLElement>("[data-nc-location-open]")
                ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        return document.querySelector(".nc-panel-maps-menu");
    };

    it("rises from the bottom instead of hanging off the row", () => {
        expect(openMenu()?.classList.contains("nc-panel-maps-sheet")).toBe(
            true
        );
    });

    /* Le voile est porté sur le body comme la feuille : sans la marque, le
       toucher qui ferme le menu fermerait la fiche avec. */
    it("lays a veil that closes it, and belongs to the panel", () => {
        openMenu();
        const veil = document.querySelector(".nc-panel-maps-veil");

        expect(veil?.getAttribute("data-nc-popup-portal")).toBe("true");

        act(() => {
            veil?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        expect(document.querySelector(".nc-panel-maps-menu")).toBeNull();
    });

    it("shows each app as the phone draws it", () => {
        openMenu({ mapsAppIcons: { citymapper: ICON } });
        const image = document.querySelector<HTMLImageElement>(
            '[data-nc-maps-app="citymapper"] img'
        );

        expect(image?.getAttribute("src")).toBe(ICON);
        expect(image?.getAttribute("alt")).toBe("");
    });

    /* Une carte sans icône garde son entrée : la feuille sait se passer
       d'image, pas d'entrée. */
    it("keeps an app whose icon never came", () => {
        openMenu({ mapsAppIcons: { citymapper: ICON } });

        expect(
            document.querySelector('[data-nc-maps-app="waze"]')
        ).not.toBeNull();
        expect(
            document.querySelector('[data-nc-maps-app="waze"] img')
        ).toBeNull();
    });

    /* Sur un ordinateur, rien ne change : le menu reste ancré sur la rangée. */
    it("stays anchored to the row on a computer", () => {
        document.body.classList.remove("nc-platform-android");
        const menu = openMenu({ nativeMapsApps: false });

        expect(menu?.classList.contains("nc-panel-maps-sheet")).toBe(false);
        expect(document.querySelector(".nc-panel-maps-veil")).toBeNull();
    });
});

/*
 * Les autres cartes du téléphone.
 *
 * Bonjour RATP et les suivantes : on ne connaît pas leur adresse d'itinéraire,
 * mais Android sait qu'elles ouvrent un point. Elles prennent donc leur place
 * au menu, après celles qu'on sait viser, et reçoivent une épingle.
 */
describe("LocationRow — les cartes que le système signale", () => {
    const CAMPUS = "48.7887337,2.3637327";
    const RATP = {
        package: "com.fabernovel.ratp",
        label: "Bonjour RATP",
        icon: "data:image/png;base64,AAAA",
    };
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
                    mapsApps={["google"]}
                    geoApps={[RATP]}
                    nativeMapsApps
                    {...props}
                />,
                host
            );
        });
        act(() => {
            document
                .querySelector<HTMLElement>("[data-nc-location-open]")
                ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
    };

    it("names them as the system named them", () => {
        show({});

        expect(
            document.querySelector(`[data-nc-maps-package="${RATP.package}"]`)
                ?.textContent
        ).toContain("Bonjour RATP");
    });

    /* Le paquet part avec le lien : sans lui, Android rouvrirait son propre
       sélecteur par-dessus la feuille qu'on vient de fermer. */
    it("opens the one that was picked, and no other", () => {
        show({});
        act(() => {
            document
                .querySelector<HTMLElement>(
                    `[data-nc-maps-package="${RATP.package}"]`
                )
                ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(onOpen).toHaveBeenCalledWith(
            "geo:48.7887337,2.3637327?q=48.7887337,2.3637327(Amphi%20B)",
            RATP.package
        );
    });

    /* Une épingle veut des nombres : sur une salle écrite à la main, elles
       n'ont rien à recevoir et le menu retombe sur Maps seule. */
    it("keeps them out when the place is not a point", () => {
        show({ location: "Efrei Bat. C C001", geo: "" });

        expect(document.querySelector(".nc-panel-maps-menu")).toBeNull();
        expect(onOpen).toHaveBeenCalledWith(
            expect.stringContaining("google.com/maps/search/")
        );
    });

    /* Une carte connue et une carte signalée font deux : le menu s'ouvre, là
       où une seule entrée s'ouvrirait directement. */
    it("counts them when deciding whether a menu is worth showing", () => {
        show({});

        expect(document.querySelector(".nc-panel-maps-menu")).not.toBeNull();
        expect(onOpen).not.toHaveBeenCalled();
    });
});
