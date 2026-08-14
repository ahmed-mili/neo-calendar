/*
 * Faire entrer un abonnement distant dans un calendrier déjà affiché.
 *
 * Les abonnements ne retiennent plus le premier affichage : le calendrier se
 * dessine avec ce qui est sur le disque, et ce qui vient du réseau arrive
 * après, parfois trente secondes après sur une mauvaise connexion. Pendant ce
 * temps l'application est vivante — on a pu créer un événement, en supprimer un
 * autre. La fusion doit donc composer avec l'état du moment, et pas écraser
 * l'écran avec une liste préparée avant.
 */

/** Le peu qu'il faut savoir d'un événement pour le ranger. */
interface Placed {
    calendarId: string;
}

/**
 * Remplace les événements des abonnements rafraîchis, et rien d'autre.
 *
 * Chaque abonnement ne remplace que les siens : un flux qui échoue laisse les
 * autres en place, et surtout les événements locaux ne sont jamais touchés —
 * ce qui vient d'être écrit sur le disque n'a pas à disparaître parce qu'un
 * calendrier de jours fériés a fini de se télécharger.
 */
export function mergeRemoteEvents<T extends Placed>(
    current: readonly T[],
    refreshedCalendarIds: Iterable<string>,
    arrived: readonly T[]
): T[] {
    const refreshed = new Set(refreshedCalendarIds);
    return [
        ...current.filter((record) => !refreshed.has(record.calendarId)),
        ...arrived,
    ];
}
