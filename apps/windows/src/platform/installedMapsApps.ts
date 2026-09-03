import {
    MAPS_APPS,
    type MapsApp,
} from "../../../../src/ui/calendar/locationLink";

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
    return MAPS_APPS.filter((app) => payload.includes(app));
}
