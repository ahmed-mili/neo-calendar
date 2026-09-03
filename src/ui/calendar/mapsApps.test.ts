import {
    geoUrlFor,
    locationDestinationFor,
    mapsAppsFor,
    mapsUrlFor,
} from "./locationLink";

const CAMPUS = "48.7887337,2.3637327";

/*
 * Ce que le lieu vise, avant de savoir par quelle carte on l'ouvre.
 *
 * Le classement des quatre rangs ne change pas — il a été mesuré, et c'est lui
 * qui dit ce qu'on peut atteindre. Ce qui change, c'est qu'il répond
 * maintenant une destination plutôt qu'une URL Google : une adresse, un point,
 * un texte à chercher ou un lien, et chaque application se sert de ce qu'elle
 * sait lire.
 */
describe("locationDestinationFor", () => {
    it("takes a link in the place field for what it is", () => {
        expect(locationDestinationFor("https://teams.test/meet/42")).toEqual({
            kind: "link",
            value: "https://teams.test/meet/42",
        });
    });

    it("prefers the address set on the link to the feed's point", () => {
        expect(
            locationDestinationFor("Efrei Bat. C", CAMPUS, "30 av. République")
        ).toEqual({
            kind: "address",
            value: "30 av. République",
            label: "Efrei Bat. C",
        });
    });

    it("falls back to the feed's point, keeping the room as its name", () => {
        expect(locationDestinationFor("Efrei Bat. C", CAMPUS)).toEqual({
            kind: "point",
            value: CAMPUS,
            label: "Efrei Bat. C",
        });
    });

    it("reads coordinates written in the address field as a point", () => {
        expect(locationDestinationFor("Efrei", "", CAMPUS)).toEqual({
            kind: "point",
            value: CAMPUS,
            label: "Efrei",
        });
    });

    it("is left with the words when nothing better is known", () => {
        expect(locationDestinationFor("Efrei Bat. C")).toEqual({
            kind: "search",
            value: "Efrei Bat. C",
        });
    });

    it("has nowhere to go when there is no place at all", () => {
        expect(locationDestinationFor("   ")).toBeNull();
    });
});

/*
 * Quelles applications proposer.
 *
 * Une application ne figure au menu que si le lien qu'on lui donnerait mène
 * vraiment quelque part. Citymapper, Moovit et Waze ne visent qu'un point :
 * proposées sur une adresse écrite à la main, elles ouvriraient un formulaire
 * vide, ce qui est pire qu'une recherche approximative. C'est la règle qui a
 * écarté Bonjour RATP, faute d'itinéraire à lui passer.
 */
describe("mapsAppsFor", () => {
    const point = locationDestinationFor("Efrei", CAMPUS)!;
    const address = locationDestinationFor("Efrei", "", "30 av. République")!;
    const search = locationDestinationFor("Efrei Bat. C")!;

    it("offers every app that can reach a point, on the phone", () => {
        expect(
            mapsAppsFor(point, {
                native: true,
                installed: ["google", "citymapper", "moovit", "waze"],
            })
        ).toEqual(["google", "citymapper", "moovit", "waze"]);
    });

    it("shows only the apps the phone actually has", () => {
        expect(
            mapsAppsFor(point, {
                native: true,
                installed: ["google", "citymapper"],
            })
        ).toEqual(["google", "citymapper"]);
    });

    /* Moovit ne publie pas d'adresse web d'itinéraire : sur un ordinateur son
       entrée n'ouvrirait qu'une page de téléchargement. */
    it("leaves out Moovit where only websites can be opened", () => {
        expect(mapsAppsFor(point, { native: false })).toEqual([
            "google",
            "citymapper",
            "waze",
        ]);
    });

    it("keeps Google alone for an address, which the others cannot read", () => {
        expect(mapsAppsFor(address, { native: false })).toEqual(["google"]);
        expect(
            mapsAppsFor(search, {
                native: true,
                installed: ["google", "citymapper", "waze"],
            })
        ).toEqual(["google"]);
    });

    /* Un lien de visioconférence s'ouvre tel quel : aucune carte n'a son mot à
       dire, et un menu ne ferait que s'interposer. */
    it("offers nothing for a link that is already one", () => {
        expect(
            mapsAppsFor(locationDestinationFor("https://teams.test/42")!, {
                native: true,
                installed: ["google", "citymapper"],
            })
        ).toEqual([]);
    });
});

describe("mapsUrlFor", () => {
    const point = locationDestinationFor("Amphi B", CAMPUS)!;
    const address = locationDestinationFor("Efrei", "", "30 av. République")!;
    const search = locationDestinationFor("Efrei Bat. C")!;

    it("keeps the Google route it has always opened", () => {
        expect(mapsUrlFor(point, "google", { travelMode: "transit" })).toBe(
            "https://www.google.com/maps/dir/?api=1&destination=48.7887337%2C2.3637327&travelmode=transit"
        );
        expect(mapsUrlFor(address, "google", {})).toBe(
            "https://www.google.com/maps/dir/?api=1&destination=30%20av.%20R%C3%A9publique"
        );
        expect(mapsUrlFor(search, "google", {})).toBe(
            "https://www.google.com/maps/search/?api=1&query=Efrei%20Bat.%20C"
        );
    });

    /* endcoord est le seul paramètre dont Citymapper ne peut pas se passer ;
       endname n'habille que l'écran d'arrivée. */
    it("hands Citymapper the point, and the room as its name", () => {
        expect(mapsUrlFor(point, "citymapper", { native: false })).toBe(
            "https://citymapper.com/directions?endcoord=48.7887337%2C2.3637327&endname=Amphi%20B"
        );
    });

    it("uses Citymapper's own scheme once the app is there to answer it", () => {
        expect(mapsUrlFor(point, "citymapper", { native: true })).toBe(
            "citymapper://directions?endcoord=48.7887337%2C2.3637327&endname=Amphi%20B"
        );
    });

    it("splits the point in two for Moovit, which asks for it that way", () => {
        expect(mapsUrlFor(point, "moovit", { native: true })).toBe(
            "moovit://directions?dest_lat=48.7887337&dest_lon=2.3637327&dest_name=Amphi%20B"
        );
    });

    /* Waze ouvre la navigation sur-le-champ, et son lien https vaut aussi bien
       pour l'application que pour le site. */
    it("sends Waze straight into navigation", () => {
        expect(mapsUrlFor(point, "waze", { native: true })).toBe(
            "https://waze.com/ul?ll=48.7887337%2C2.3637327&navigate=yes"
        );
    });

    /* Aucune carte n'est consultée pour un lien de visioconférence : quelle
       que soit l'application réglée, c'est le lien qui s'ouvre. */
    it("opens a link as it is, whichever app is set", () => {
        const link = locationDestinationFor("https://teams.test/42")!;
        expect(mapsUrlFor(link, "citymapper", { native: true })).toBe(
            "https://teams.test/42"
        );
    });

    it("refuses to send an address to an app that only reads points", () => {
        expect(mapsUrlFor(address, "citymapper", {})).toBeNull();
        expect(mapsUrlFor(search, "waze", {})).toBeNull();
    });
});

/*
 * Le lien que toutes les cartes comprennent.
 *
 * Les quatre que l'on sait viser ont chacune leur adresse d'itinéraire ; les
 * autres — Bonjour RATP, celles qu'on ne connaît pas encore — n'en publient
 * aucune. Android, lui, sait lesquelles répondent à `geo:`, qui pose un point
 * sans dire comment y aller. C'est moins qu'un itinéraire, et c'est tout ce
 * qu'on peut promettre à une application dont on ignore tout.
 */
describe("geoUrlFor", () => {
    const CAMPUS = "48.7887337,2.3637327";

    it("points at the place, and names it", () => {
        expect(geoUrlFor(locationDestinationFor("Amphi B", CAMPUS)!)).toBe(
            "geo:48.7887337,2.3637327?q=48.7887337,2.3637327(Amphi%20B)"
        );
    });

    it("drops the name when the event does not give one", () => {
        expect(geoUrlFor(locationDestinationFor("", CAMPUS, CAMPUS)!)).toBe(
            "geo:48.7887337,2.3637327?q=48.7887337,2.3637327"
        );
    });

    /* Une adresse ou une salle écrite à la main ne se transmet pas ainsi :
       `geo:` veut des nombres, et une application inconnue n'a rien pour
       deviner le reste. */
    it("has nothing to offer without a point", () => {
        expect(
            geoUrlFor(locationDestinationFor("Efrei", "", "30 av. République")!)
        ).toBeNull();
        expect(geoUrlFor(locationDestinationFor("Efrei Bat. C")!)).toBeNull();
    });
});
