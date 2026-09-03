import {
    MAPS_APPS,
    type GeoApp,
    type MapsApp,
} from "../../../../src/ui/calendar/locationLink";

/**
 * Ce que le téléphone répond : un nom, ou un nom et son icône.
 *
 * Le natif a d'abord rendu des noms seuls. Les deux formes se lisent, non par
 * égard pour de vieilles versions — l'application native et son JS voyagent
 * dans le même APK — mais parce qu'un appareil dont la mise à jour a échoué à
 * mi-chemin n'a pas à perdre son menu pour une icône.
 */
type Reported =
    | string
    | { id?: unknown; icon?: unknown; package?: unknown; label?: unknown };

/** Une icône ne s'affiche que si la WebView peut la lire telle quelle. */
const usableIcon = (icon: unknown): string | undefined =>
    typeof icon === "string" && icon.startsWith("data:") ? icon : undefined;

const nameOf = (entry: Reported): unknown =>
    typeof entry === "string" ? entry : entry?.id;

/**
 * Les cartes installées sur le téléphone, parmi celles qu'on sait ouvrir.
 *
 * Android ne dit pas ce qu'il a : il faut le lui demander application par
 * application, et depuis Android 11 la question elle-même doit être déclarée au
 * manifeste (`<queries>`), sans quoi le système répond « absente » pour tout.
 * Le natif fait cette demande et rend les noms courts que le menu emploie.
 *
 * Ce qui revient est filtré plutôt que cru : la commande peut manquer sur une
 * version plus ancienne de l'application native, et une carte qu'on ne sait pas
 * viser n'aurait rien à faire au menu. L'ordre est celui du menu, jamais celui
 * du téléphone.
 */
export function parseInstalledMapsApps(payload: unknown): MapsApp[] {
    if (!Array.isArray(payload)) return [];
    const named = (payload as Reported[]).map(nameOf);
    return MAPS_APPS.filter((app) => named.includes(app));
}

/**
 * L'icône de chaque carte, telle que le téléphone la dessine.
 *
 * La feuille les montre parce qu'une liste de noms nus ne ressemble à rien de
 * ce qu'Android propose. Elles arrivent en `data:` URI : une WebView n'a pas
 * accès aux fichiers d'une autre application, et il n'y a donc rien à pointer.
 *
 * Une icône qu'on ne saurait pas afficher est laissée de côté sans emporter son
 * application avec elle : la feuille sait se passer d'image, pas d'entrée.
 */
export function parseInstalledMapsIcons(
    payload: unknown
): Partial<Record<MapsApp, string>> {
    if (!Array.isArray(payload)) return {};

    const icons: Partial<Record<MapsApp, string>> = {};
    for (const entry of payload as Reported[]) {
        const name = nameOf(entry);
        const icon = usableIcon(
            typeof entry === "string" ? undefined : entry?.icon
        );
        if (!icon) continue;
        const app = MAPS_APPS.find((known) => known === name);
        if (app) icons[app] = icon;
    }
    return icons;
}

/**
 * Les autres cartes du téléphone : celles qu'on ne sait pas viser.
 *
 * Android répond quelles applications déclarent savoir ouvrir un point, et
 * c'est tout ce qu'on sait d'elles. Elles arrivent donc avec leur nom et leur
 * icône, tels que le système les donne, et recevront une épingle plutôt qu'un
 * itinéraire — c'est la seule chose qu'on puisse promettre à une application
 * dont on ignore l'adresse de destination.
 *
 * Celles que l'on connaît déjà par leur nom court sont retirées : elles ont
 * leur itinéraire, et les revoir ici les ferait figurer deux fois.
 */
export function parseGeoApps(payload: unknown): GeoApp[] {
    if (!Array.isArray(payload)) return [];

    const apps: GeoApp[] = [];
    for (const entry of payload as Reported[]) {
        if (typeof entry === "string") continue;
        if (MAPS_APPS.some((known) => known === entry?.id)) continue;

        const target = entry?.package;
        const label = entry?.label;
        if (typeof target !== "string" || !target) continue;
        if (typeof label !== "string" || !label) continue;

        const icon = usableIcon(entry?.icon);
        apps.push(
            icon ? { package: target, label, icon } : { package: target, label }
        );
    }
    return apps;
}
