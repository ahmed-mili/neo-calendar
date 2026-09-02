import { locationLinkFor } from "./locationLink";

/*
 * Où mène le lieu d'un évènement.
 *
 * Savoir qu'un cours est « Efrei Bat. C C001 » ne dit pas comment y aller :
 * le lieu s'ouvre donc dans Google Maps. Le flux Efrei publie bien des
 * coordonnées, mais elles valent pour le site et non pour le bâtiment —
 * mesuré sur le flux : « Efrei Bat. C C001 » et « Efrei Bat. E E001 » portent
 * le même point. C'est donc le texte du lieu qui part en recherche, parce que
 * c'est lui qui nomme le bâtiment.
 */
describe("locationLinkFor", () => {
    it("searches Google Maps for the place as it is written", () => {
        expect(locationLinkFor("Efrei Bat. C C001")).toBe(
            "https://www.google.com/maps/search/?api=1&query=Efrei%20Bat.%20C%20C001"
        );
    });

    it("encodes what a URL cannot carry as is", () => {
        expect(locationLinkFor("Salle Café & Thé")).toContain(
            encodeURIComponent("Salle Café & Thé")
        );
    });

    it("has nowhere to go when there is no place", () => {
        expect(locationLinkFor("")).toBeNull();
        expect(locationLinkFor("   ")).toBeNull();
    });

    it("ignores the spaces around a place", () => {
        expect(locationLinkFor("  Efrei  ")).toBe(
            "https://www.google.com/maps/search/?api=1&query=Efrei"
        );
    });

    /*
     * Certains flux mettent un lien de visioconférence dans le champ « lieu » :
     * le chercher sur une carte ne mènerait nulle part, alors que l'ouvrir tel
     * quel mène exactement où il faut.
     */
    it("opens a link that is already one, rather than looking for it on a map", () => {
        expect(locationLinkFor("https://teams.microsoft.com/l/meetup/42")).toBe(
            "https://teams.microsoft.com/l/meetup/42"
        );
        expect(locationLinkFor("http://exemple.test/salle")).toBe(
            "http://exemple.test/salle"
        );
    });

    it("does not treat a place that merely mentions a scheme as a link", () => {
        expect(locationLinkFor("Salle https du bâtiment")).toContain(
            "google.com/maps"
        );
    });

    it("hands coordinates to the map as they are", () => {
        // Une paire de coordonnées est déjà ce que la carte comprend le mieux.
        expect(locationLinkFor("48.7887337,2.3637327")).toBe(
            "https://www.google.com/maps/search/?api=1&query=48.7887337%2C2.3637327"
        );
    });
});

/*
 * Les coordonnées passent avant le texte.
 *
 * Mesuré sur l'émulateur : « Efrei Bat. C C001 » envoyé en recherche ouvre
 * Maps sur une page de résultats dont les premiers sont des annonces — deux
 * écoles qui n'ont rien à voir. Les coordonnées, elles, posent un point et
 * rien d'autre. Le flux en publie pour chaque évènement ; c'est donc elles
 * qu'on suit quand il y en a, et le texte seulement à défaut.
 */
describe("locationLinkFor, coordonnées en main", () => {
    it("points at the coordinates the feed gives, rather than searching", () => {
        expect(
            locationLinkFor("Efrei Bat. C C001", "48.7887337,2.3637327")
        ).toBe(
            "https://www.google.com/maps/search/?api=1&query=48.7887337%2C2.3637327"
        );
    });

    it("falls back to the words when there are no coordinates", () => {
        expect(locationLinkFor("Efrei Bat. C C001", undefined)).toContain(
            "query=Efrei"
        );
        expect(locationLinkFor("Efrei Bat. C C001", "")).toContain(
            "query=Efrei"
        );
    });

    it("refuses coordinates that are not a pair of numbers", () => {
        // Une valeur bricolée à la main dans la note ne doit pas partir telle
        // quelle dans une URL : on retombe sur le texte, qui mène quelque part.
        expect(locationLinkFor("Efrei", "quelque part")).toContain(
            "query=Efrei"
        );
        expect(locationLinkFor("Efrei", "48.78")).toContain("query=Efrei");
    });

    it("still opens a meeting link before looking at any coordinates", () => {
        expect(
            locationLinkFor("https://teams.microsoft.com/l/42", "48.78,2.36")
        ).toBe("https://teams.microsoft.com/l/42");
    });

    it("opens the coordinates even when the place has no name", () => {
        expect(locationLinkFor("", "48.7887337,2.3637327")).toBe(
            "https://www.google.com/maps/search/?api=1&query=48.7887337%2C2.3637327"
        );
    });
});
