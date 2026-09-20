/**
 * Les mosquées dont l'application connaît le calendrier.
 *
 * Une de plus se fait en deux gestes : importer son PDF avec
 * `scripts/import-prayer-calendar.mjs`, puis l'ajouter à cette liste. L'ordre
 * est celui des réglages, donc il compte un peu : le plus proche d'abord.
 */
import type { PrayerTimetable } from "../prayerTimes";
import alkitabWaSunnah from "./alkitab-wa-sunnah";
import foiEtUnicite from "./foi-et-unicite";
import kremlinBicetre from "./kremlin-bicetre";
import villejuif from "./villejuif";

export const PRAYER_TIMETABLES: PrayerTimetable[] = [
    villejuif,
    kremlinBicetre,
    foiEtUnicite,
    alkitabWaSunnah,
];

export function prayerTimetableById(
    id: string | null | undefined
): PrayerTimetable | null {
    if (!id) return null;
    return PRAYER_TIMETABLES.find((timetable) => timetable.id === id) ?? null;
}

/** Une séance de Jumu'a qu'on peut choisir, et les mosquées qui la tiennent. */
export interface JumuaChoice {
    /** « HH:MM ». */
    time: string;
    mosques: string[];
}

/**
 * Les séances de Jumu'a parmi lesquelles choisir : celles des mosquées
 * enregistrées, et rien d'autre. Une heure que deux mosquées partagent n'est
 * proposée qu'une fois, avec les deux noms.
 */
export function jumuaChoices(): JumuaChoice[] {
    const byTime = new Map<string, string[]>();
    for (const timetable of PRAYER_TIMETABLES) {
        for (const time of timetable.jumua) {
            byTime.set(time, [...(byTime.get(time) ?? []), timetable.name]);
        }
    }
    return [...byTime.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([time, mosques]) => ({ time, mosques }));
}
