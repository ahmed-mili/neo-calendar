/**
 * Demande une commande d'espacement — le raccourci clavier, un menu, ou toute
 * autre surface qui ne tient pas la molette elle-même.
 *
 * `useWheelZoom` écoute cet événement dans le même effet que sa molette, pour
 * que les deux entrées partagent une seule ancre, un seul `draw`, et les mêmes
 * rappels `onScaleChange`/`onScaleSettled`. Là où la grille horaire n'est pas
 * montée — vue mois ou liste — personne n'écoute, et l'appel ne fait rien.
 */
export const HOUR_HEIGHT_COMMAND_EVENT = "neo-hour-height-command";

export type HourHeightCommand = "reset" | "increase" | "decrease";

export function requestHourHeight(command: HourHeightCommand): void {
    window.dispatchEvent(
        new CustomEvent<HourHeightCommand>(HOUR_HEIGHT_COMMAND_EVENT, {
            detail: command,
        })
    );
}
