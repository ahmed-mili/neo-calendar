import * as React from "react";

/**
 * Les liens ICS dont la synchronisation est en cours, à l'instant où l'on
 * regarde.
 *
 * Un contexte plutôt qu'une propriété portée par chaque évènement : l'état est
 * transitoire et transversal, il change deux fois par cycle et il intéresse une
 * feuille de l'arbre, le bloc d'évènement. Le faire descendre de vue en vue
 * aurait demandé de traverser la grille, le mois, la liste et les tâches pour
 * une information qu'aucune d'elles n'utilise elle-même.
 *
 * Vide par défaut : hors de l'application de bureau, rien ne se synchronise et
 * rien ne clignote.
 */
export const SyncingFeedsContext = React.createContext<ReadonlySet<string>>(
    new Set<string>()
);

/** Un évènement d'un lien en cours de rafraîchissement se signale : ce qui est
 *  déjà écrit reste lisible, mais on voit qu'il est en train d'être repris. */
export function useIsSyncing(icsFeedId: string | undefined): boolean {
    const syncing = React.useContext(SyncingFeedsContext);
    return icsFeedId !== undefined && syncing.has(icsFeedId);
}
