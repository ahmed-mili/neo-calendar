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
