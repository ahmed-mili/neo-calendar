/** Une paire « latitude,longitude » telle qu'un flux la publie. */
const COORDINATES = /^-?\d{1,3}(?:\.\d+)?\s*,\s*-?\d{1,3}(?:\.\d+)?$/;

/**
 * Comment on compte s'y rendre.
 *
 * Les valeurs sont celles que la documentation Maps URLs accepte, à la lettre
 * près : un `travelmode` inconnu est ignoré sans que rien ne le signale, et
 * l'itinéraire s'ouvrirait alors dans un mode qu'on n'a pas demandé.
 *
 * « auto » n'en est pas une : c'est l'absence du paramètre, et donc le choix
 * laissé à la carte, qui connaît les habitudes de celui qui la lit.
 */
export const MAPS_TRAVEL_MODES = [
    "auto",
    "transit",
    "driving",
    "walking",
    "bicycling",
] as const;

export type MapsTravelMode = (typeof MAPS_TRAVEL_MODES)[number];

const mapsSearch = (query: string) =>
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        query
    )}`;

/**
 * L'itinéraire vers un point, depuis là où l'on est.
 *
 * `origin` est omis à dessein : la documentation Maps URLs en fait un
 * paramètre facultatif, et son absence vaut « la position de l'appareil ».
 * Aucune valeur écrite ici ne ferait mieux — une origine figée dans l'URL
 * serait fausse dès le lendemain.
 */
const mapsDirections = (destination: string, travelMode: MapsTravelMode) =>
    `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
        destination
    )}${travelMode === "auto" ? "" : `&travelmode=${travelMode}`}`;

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
 * Les rangs 2 et 3 ouvrent un itinéraire, les deux autres non, et la ligne de
 * partage est la même que celle qui classe les rangs : une adresse et un point
 * sont des destinations, un nom de salle n'en est pas une. Demander un
 * itinéraire vers « Efrei Bat. C C001 » ne donnerait pas un mauvais trajet
 * mais un formulaire vide, ce qui est pire qu'une recherche approximative.
 *
 * `null` quand il n'y a rien à ouvrir : le lieu ne se présente alors pas comme
 * un lien.
 */
export function locationLinkFor(
    location: string,
    geo?: string,
    linkAddress?: string,
    travelMode: MapsTravelMode = "auto"
): string | null {
    const place = location.trim();

    if (/^https?:\/\/\S+$/i.test(place)) return place;

    const address = (linkAddress ?? "").trim();
    if (address) return mapsDirections(address, travelMode);

    const point = (geo ?? "").trim();
    if (COORDINATES.test(point))
        return mapsDirections(point.replace(/\s+/g, ""), travelMode);

    return place ? mapsSearch(place) : null;
}
