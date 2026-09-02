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
 * Les coordonnées d'abord, le texte à défaut. Mesuré sur l'émulateur : envoyer
 * « Efrei Bat. C C001 » en recherche ouvre Maps sur une page de résultats dont
 * les premiers sont des annonces — deux écoles sans rapport. Une paire de
 * coordonnées pose un point, et rien d'autre. Le flux en publie une par
 * évènement ; elle vaut pour le site et non pour le bâtiment, mais elle dépose
 * devant la porte, ce que la recherche ne fait pas.
 *
 * Un lieu écrit à la main n'a pas de coordonnées : son texte part alors en
 * recherche, ce qui est exactement ce qu'il faut pour une adresse.
 *
 * `null` quand il n'y a rien à ouvrir : le lieu ne se présente alors pas comme
 * un lien.
 */
export function locationLinkFor(location: string, geo?: string): string | null {
    const place = location.trim();

    // Un lien mis dans le champ « lieu » — une visioconférence, le plus
    // souvent — s'ouvre tel quel : le chercher sur une carte ne mènerait nulle
    // part, alors qu'il mène déjà exactement où il faut.
    if (/^https?:\/\/\S+$/i.test(place)) return place;

    const point = (geo ?? "").trim();
    if (COORDINATES.test(point)) return mapsSearch(point.replace(/\s+/g, ""));

    return place ? mapsSearch(place) : null;
}
