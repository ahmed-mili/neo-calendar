import { DateTime } from "luxon";
import { NeoEvent } from "../../types";
import { DAY_ORDER, DayCode } from "./recurrence";
import { parseOccurrenceId } from "../tasks";
import { seriesRrule } from "./recurrenceDeletion";

/**
 * D'une occurrence d'une série à la suivante, ou à la précédente.
 *
 * Le panneau montre UNE date d'une série, et jusqu'ici la seule façon d'en voir
 * une autre était de retrouver le jour à la main dans la grille. Une série qui
 * revient tous les ans demandait douze coups de flèche dans le calendrier pour
 * lire la fiche d'à côté.
 *
 * Les dates ne sont pas prises dans ce qui est affiché : la voisine tombe
 * souvent hors de la fenêtre visible, et elle serait alors introuvable. Elles
 * sont recalculées depuis la règle, exactement comme l'expansion et la
 * suppression le font — même ancrage UTC pour une rrule, même index de jour
 * pour une série hebdomadaire — sans quoi les trois lectures dériveraient l'une
 * de l'autre d'un jour.
 */

const dayIndexOf = (code: DayCode): number => DAY_ORDER.indexOf(code);

/** Sens de la marche : la date d'après, ou celle d'avant. */
export type SeriesDirection = 1 | -1;

/**
 * La date de l'occurrence voisine, ou null quand il n'y en a pas — série
 * terminée, série pas encore commencée, ou évènement qui ne se répète pas.
 *
 * Les dates retirées de la série (`skipDates`) sont enjambées, pas rendues :
 * elles n'ont plus de fiche à ouvrir.
 */
export function adjacentOccurrenceDate(
    event: NeoEvent | null | undefined,
    fromDate: string,
    direction: SeriesDirection
): string | null {
    if (!event || !fromDate) return null;

    if (event.type === "rrule") {
        const rule = seriesRrule(event);
        if (!rule) return null;
        const skip = new Set(event.skipDates || []);
        let cursor = DateTime.fromISO(fromDate, { zone: "utc" }).toJSDate();
        if (Number.isNaN(cursor.getTime())) return null;
        // Chaque tour consomme une date sautée, donc un tour de plus qu'il n'y
        // en a atteint toujours une occurrence ou le bout de la série.
        for (let attempt = 0; attempt <= skip.size; attempt++) {
            const found =
                direction > 0
                    ? rule.after(cursor, false)
                    : rule.before(cursor, false);
            if (!found) return null;
            const iso = DateTime.fromJSDate(found, { zone: "utc" }).toISODate();
            if (!iso) return null;
            if (!skip.has(iso)) return iso;
            cursor = found;
        }
        return null;
    }

    if (event.type === "recurring") {
        const days = new Set(
            (event.daysOfWeek as DayCode[])
                .map(dayIndexOf)
                .filter((index) => index >= 0)
        );
        if (days.size === 0) return null;
        const skip = new Set(event.skipDates || []);
        const start = event.startRecur ?? null;
        const end = event.endRecur ?? null;
        // Une série hebdomadaire rencontre un de ses jours dans n'importe
        // quels sept jours consécutifs : sept jours par date sautée couvrent
        // donc toute la recherche.
        const limit = 7 * (skip.size + 1);
        let day = DateTime.fromISO(fromDate, { zone: "local" });
        if (!day.isValid) return null;
        for (let step = 0; step < limit; step++) {
            day = day.plus({ days: direction });
            const iso = day.toISODate();
            if (!iso) return null;
            if (direction > 0 && end && iso > end) return null;
            if (direction < 0 && start && iso < start) return null;
            if (days.has(day.weekday % 7) && !skip.has(iso)) return iso;
        }
        return null;
    }

    return null;
}

/**
 * L'identifiant d'affichage de l'occurrence voisine, prêt à être ouvert.
 *
 * Rien n'est rendu quand le panneau ne regarde pas une occurrence datée : une
 * série ouverte depuis la liste des tâches n'a pas de jour d'où partir.
 */
export function adjacentOccurrenceId(
    event: NeoEvent | null | undefined,
    displayId: string | null,
    direction: SeriesDirection
): { id: string; date: string } | null {
    if (!displayId) return null;
    const parsed = parseOccurrenceId(displayId);
    if (!parsed) return null;
    const date = adjacentOccurrenceDate(event, parsed.date, direction);
    if (!date) return null;
    return { id: `${parsed.storedId}_${date}`, date };
}
