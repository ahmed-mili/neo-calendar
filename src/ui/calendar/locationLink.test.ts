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
});

/*
 * Un point qu'on sait atteindre ouvre un itinéraire, pas une épingle.
 *
 * Une épingle laisse encore tout à faire : lire l'adresse, ouvrir l'itinéraire,
 * dire d'où l'on part. Or un évènement de l'emploi du temps se lit toujours
 * pour la même raison — y aller. `origin` est donc laissé vide à dessein :
 * omis, Google Maps part de la position de l'appareil, ce qu'aucune valeur
 * écrite dans l'URL ne saurait faire aussi bien.
 */
describe("locationLinkFor — l'itinéraire", () => {
    it("routes to the coordinates the feed gives, from wherever the device is", () => {
        expect(
            locationLinkFor("Efrei Bat. C C001", "48.7887337,2.3637327")
        ).toBe(
            "https://www.google.com/maps/dir/?api=1&destination=48.7887337%2C2.3637327"
        );
    });

    it("names no origin, so that Maps starts from the device", () => {
        expect(locationLinkFor("", "48.7887337,2.3637327")).not.toContain(
            "origin"
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
});

/*
 * L'adresse réglée sur le lien passe avant tout le reste.
 *
 * Le flux Efrei donne un point unique pour toutes les salles, et il tombe à
 * quelques rues du campus. Aucune donnée du flux ne permet de faire mieux :
 * c'est donc l'adresse que l'on règle une fois sur le lien qui fait foi, et
 * les évènements de ce lien y mènent tous.
 */
describe("locationLinkFor — l'adresse du lien", () => {
    const CAMPUS = "Efrei, 30-32 avenue de la République, 94800 Villejuif";

    it("routes to the address set on the link rather than the feed's point", () => {
        expect(
            locationLinkFor("Efrei Bat. C C001", "48.7887337,2.3637327", CAMPUS)
        ).toBe(
            `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                CAMPUS
            )}`
        );
    });

    it("goes there even when the event names no room at all", () => {
        expect(locationLinkFor("", undefined, CAMPUS)).toContain(
            encodeURIComponent("30-32 avenue")
        );
    });

    it("ignores an address made of spaces", () => {
        expect(
            locationLinkFor("Efrei Bat. C C001", "48.7887337,2.3637327", "   ")
        ).toContain("destination=48.7887337");
    });

    it("still opens a meeting link first: it is where the event happens", () => {
        expect(
            locationLinkFor(
                "https://teams.microsoft.com/l/42",
                undefined,
                CAMPUS
            )
        ).toBe("https://teams.microsoft.com/l/42");
    });

    it("falls back to the feed's point, then to the words, without an address", () => {
        expect(locationLinkFor("Salle", "48.78,2.36")).toContain(
            "destination=48.78%2C2.36"
        );
        expect(locationLinkFor("Salle")).toContain("query=Salle");
    });
});

/*
 * Le mode de trajet est un réglage, parce qu'il ne se devine pas.
 *
 * Le même campus se rejoint en métro depuis chez soi et en voiture depuis
 * ailleurs, et Google Maps sait déjà proposer le plus vraisemblable quand on
 * ne lui dit rien. « auto » est donc le repos : aucun `travelmode` dans l'URL,
 * la carte tranche. Les autres valeurs sont celles que la documentation Maps
 * URLs accepte, à la lettre près — une valeur inventée y serait ignorée sans
 * que rien ne le signale.
 */
describe("locationLinkFor — le mode de trajet", () => {
    const CAMPUS = "Efrei, 30-32 avenue de la République, 94800 Villejuif";

    it("asks for the mode that was set", () => {
        expect(
            locationLinkFor("Efrei", undefined, CAMPUS, "transit")
        ).toContain("&travelmode=transit");
        expect(
            locationLinkFor("Efrei", "48.78,2.36", undefined, "driving")
        ).toBe(
            "https://www.google.com/maps/dir/?api=1&destination=48.78%2C2.36&travelmode=driving"
        );
    });

    it("leaves the choice to Maps at rest", () => {
        expect(locationLinkFor("Efrei", undefined, CAMPUS)).not.toContain(
            "travelmode"
        );
        expect(
            locationLinkFor("Efrei", undefined, CAMPUS, "auto")
        ).not.toContain("travelmode");
    });

    /* Une recherche n'est pas un trajet : le mode n'y aurait aucun sens, et
       Maps ignorerait le paramètre. Autant ne pas l'écrire. */
    it("says nothing of the mode when there is only a place to search for", () => {
        expect(
            locationLinkFor(
                "Efrei Bat. C C001",
                undefined,
                undefined,
                "transit"
            )
        ).toBe(
            "https://www.google.com/maps/search/?api=1&query=Efrei%20Bat.%20C%20C001"
        );
    });

    it("leaves a meeting link untouched", () => {
        expect(
            locationLinkFor(
                "https://teams.microsoft.com/l/42",
                undefined,
                CAMPUS,
                "transit"
            )
        ).toBe("https://teams.microsoft.com/l/42");
    });
});
