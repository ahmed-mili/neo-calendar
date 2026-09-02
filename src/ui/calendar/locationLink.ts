/** Une paire « latitude,longitude » telle qu'un flux la publie. */
const COORDINATES = /^-?\d{1,3}(?:\.\d+)?\s*,\s*-?\d{1,3}(?:\.\d+)?$/;

const mapsSearch = (query: string) =>
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        query
    )}`;

/**
 * Où mène le lieu d'un évènement, quand on le suit.
 *
 * Savoir qu'un cours se tient « Efrei Bat. C C001 » ne dit pas comment y
 * aller : le lieu s'ouvre donc dans une carte, qui sait ce que l'application
 * ne sait pas.
 *
 * L'ordre compte, et chaque rang a été mesuré plutôt que supposé :
 *
 * 1. Un lien mis dans le champ « lieu » — une visioconférence, le plus
 *    souvent. Il passe avant tout : la réunion n'a pas lieu sur le campus.
 * 2. L'adresse réglée sur le lien ICS. Elle a été écrite à la main précisément
 *    parce que ce que le flux publie ne mène pas au bon endroit : le flux
 *    Efrei donne un point unique pour toutes les salles, et il tombe à
 *    quelques rues du campus.
 * 3. Les coordonnées du flux, à défaut d'adresse : elles posent un point, ce
 *    qui vaut toujours mieux qu'une recherche.
 * 4. Le texte du lieu, en dernier. C'est exactement ce qu'il faut pour une
 *    adresse écrite à la main, et exactement ce qu'il ne faut pas pour un nom
 *    de salle : mesuré sur l'émulateur, chercher « Efrei Bat. C C001 » ouvre
 *    une page de résultats dont les premiers sont des annonces pour deux
 *    écoles sans rapport.
 *
 * `null` quand il n'y a rien à ouvrir : le lieu ne se présente alors pas comme
 * un lien.
 */
export function locationLinkFor(
    location: string,
    geo?: string,
    linkAddress?: string
): string | null {
    const place = location.trim();

    if (/^https?:\/\/\S+$/i.test(place)) return place;

    const address = (linkAddress ?? "").trim();
    if (address) return mapsSearch(address);

    const point = (geo ?? "").trim();
    if (COORDINATES.test(point)) return mapsSearch(point.replace(/\s+/g, ""));

    return place ? mapsSearch(place) : null;
}
