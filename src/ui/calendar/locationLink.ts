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

/**
 * Les applications par lesquelles un lieu peut s'ouvrir.
 *
 * Bonjour RATP n'y figure pas : elle ne publie aucun lien d'itinéraire, et son
 * entrée n'aurait ouvert qu'un planificateur vide, la destination à retaper.
 * C'est la règle qui décide de cette liste — une application n'y a sa place que
 * si le lien qu'on lui donne mène vraiment quelque part.
 */
export const MAPS_APPS = ["google", "citymapper", "moovit", "waze"] as const;

export type MapsApp = (typeof MAPS_APPS)[number];

/** L'application réglée, ou le menu quand rien n'est réglé. */
export type MapsAppChoice = "ask" | MapsApp;

/**
 * Celles qui savent s'ouvrir dans un navigateur.
 *
 * Moovit n'en est pas : sa documentation ne donne qu'un lien de téléchargement
 * pour qui n'a pas l'application, jamais une adresse d'itinéraire. Sur un
 * ordinateur, son entrée mènerait donc à une page de magasin.
 */
const WEB_MAPS_APPS: readonly MapsApp[] = ["google", "citymapper", "waze"];

/**
 * Ce que le lieu vise, une fois les quatre rangs départagés.
 *
 * La distinction porte le partage qui compte : un point et une adresse sont des
 * destinations, un nom de salle n'en est pas une, et un lien n'a rien à faire
 * sur une carte. Chaque application se sert ensuite de ce qu'elle sait lire.
 *
 * `label` est le lieu tel qu'il est écrit dans l'évènement. Il ne sert pas à
 * viser — le point s'en charge — mais à nommer l'arrivée sur l'écran de
 * l'application, qui affiche « Amphi B » plutôt qu'une paire de nombres.
 */
export type LocationDestination =
    | { kind: "link"; value: string }
    | { kind: "point"; value: string; label?: string }
    | { kind: "address"; value: string; label?: string }
    | { kind: "search"; value: string };

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

/** Une paire de coordonnées, ramenée à ce qu'une URL en attend. */
const asPoint = (value: string) => value.replace(/\s+/g, "");

/**
 * Où mène le lieu d'un évènement, avant qu'une application s'en saisisse.
 *
 * Les quatre rangs sont ceux de `locationLinkFor`, à une chose près, mesurée
 * depuis : une paire de coordonnées écrite à la main dans le champ « adresse »
 * du lien ICS est lue comme un point, et non comme une adresse. C'est ce qui
 * ouvre Citymapper et les autres sur un cours de l'Efrei, dont le flux ne
 * publie qu'un point à quelques rues du campus.
 */
export function locationDestinationFor(
    location: string,
    geo?: string,
    linkAddress?: string
): LocationDestination | null {
    const place = location.trim();

    if (/^https?:\/\/\S+$/i.test(place)) return { kind: "link", value: place };

    const label = place || undefined;

    const address = (linkAddress ?? "").trim();
    if (address)
        return COORDINATES.test(address)
            ? { kind: "point", value: asPoint(address), label }
            : { kind: "address", value: address, label };

    const point = (geo ?? "").trim();
    if (COORDINATES.test(point))
        return { kind: "point", value: asPoint(point), label };

    return place ? { kind: "search", value: place } : null;
}

/** Ce qu'on ajoute à une URL pour nommer l'arrivée, quand on sait la nommer. */
const named = (parameter: string, label?: string) =>
    label ? `&${parameter}=${encodeURIComponent(label)}` : "";

/**
 * Les applications à proposer pour cette destination, dans l'ordre du menu.
 *
 * Trois des quatre ne visent qu'un point : leur passer une adresse écrite à la
 * main ouvrirait un formulaire vide, ce qui est pire qu'une recherche
 * approximative. Elles ne sont donc pas grisées mais absentes — un menu ne
 * propose que ce qui mène quelque part.
 *
 * `installed` est la liste que le téléphone a répondue. Absente, rien n'est
 * filtré : c'est le cas de l'ordinateur, où l'on ouvre des sites et où la
 * question de ce qui est installé ne se pose pas.
 */
export function mapsAppsFor(
    destination: LocationDestination,
    {
        native = false,
        installed,
    }: { native?: boolean; installed?: readonly MapsApp[] }
): MapsApp[] {
    if (destination.kind === "link") return [];

    const candidates: readonly MapsApp[] =
        destination.kind === "point" ? MAPS_APPS : ["google"];

    return candidates.filter((app) => {
        // Les deux filtres sont indépendants : le premier dit ce qui s'ouvre
        // dans un navigateur, le second ce que cette machine a sous la main.
        if (!native && !WEB_MAPS_APPS.includes(app)) return false;
        return installed ? installed.includes(app) : true;
    });
}

/**
 * L'adresse à ouvrir pour joindre cette destination par cette application.
 *
 * `native` dit qu'une application est là pour répondre : on emploie alors son
 * propre schéma, qui la vise à coup sûr, plutôt qu'un lien https dont rien ne
 * garantit qu'Android le lui remettra. Waze fait exception et garde son lien
 * https, que son application comme son site savent lire.
 *
 * `null` quand l'application ne saurait pas quoi faire de la destination. Le
 * menu ne devrait alors pas l'avoir proposée (voir `mapsAppsFor`), mais la
 * question se repose ici : un réglage garde une application choisie un jour où
 * elle convenait, et un évènement sans point n'est pas son affaire.
 */
export function mapsUrlFor(
    destination: LocationDestination,
    app: MapsApp,
    {
        travelMode = "auto",
        native = false,
    }: { travelMode?: MapsTravelMode; native?: boolean }
): string | null {
    if (destination.kind === "link") return destination.value;

    if (app === "google")
        return destination.kind === "search"
            ? mapsSearch(destination.value)
            : mapsDirections(destination.value, travelMode);

    if (destination.kind !== "point") return null;

    const point = encodeURIComponent(destination.value);

    if (app === "citymapper") {
        const base = native
            ? "citymapper://directions"
            : "https://citymapper.com/directions";
        return `${base}?endcoord=${point}${named(
            "endname",
            destination.label
        )}`;
    }

    if (app === "moovit") {
        const [latitude, longitude] = destination.value.split(",");
        return `moovit://directions?dest_lat=${latitude}&dest_lon=${longitude}${named(
            "dest_name",
            destination.label
        )}`;
    }

    return `https://waze.com/ul?ll=${point}&navigate=yes`;
}
