import type { Reminder } from "./androidReminders";
import {
    prayersOn,
    type PrayerMoment,
    type PrayerName,
    type PrayerTimetable,
} from "../../../../src/ui/calendar/prayerTimes";
import { formatTime } from "../../../../src/ui/calendar/calendarFormatters";
import { relativeDelayLabel } from "../../../../src/ui/calendar/reminderDelay";
import { t } from "../../../../src/ui/i18n";

/**
 * Les rappels des prières, pour le PC qui n'a pas d'application de mosquée.
 *
 * Le téléphone a Mawaqit ; l'ordinateur n'a que ce calendrier. Chaque prière
 * de la table devient un rappel comme un autre, remis au même planificateur
 * que ceux des évènements : rien ici ne sait poster une notification, ça sait
 * seulement dire à quelle minute et avec quels mots.
 *
 * Aujourd'hui et demain suffisent : la liste est réécrite toutes les heures,
 * et passé Isha ce qui compte est le Fajr du lendemain, pas la semaine.
 */

const DAYS_AHEAD = 2;

const PRAYER_LABELS: Record<PrayerName, string> = {
    fajr: "Fajr",
    dhuhr: "Dhuhr",
    jumua: "Jumu'a",
    asr: "Asr",
    maghrib: "Maghrib",
    isha: "Isha",
};

/** Zéro veut dire à l'heure de la prière, à la différence des évènements. */
function bodyFor(
    offsetMinutes: number,
    start: Date,
    mosque: string,
    timeFormat24h: boolean
): string {
    const when = `${formatTime(start, timeFormat24h)} · ${mosque}`;
    if (offsetMinutes <= 0) return `${t("It is time")} · ${when}`;
    return `${t("In")} ${relativeDelayLabel(offsetMinutes)} · ${when}`;
}

function startOf(prayer: PrayerMoment): Date {
    const start = new Date(prayer.date);
    start.setHours(0, prayer.minutes, 0, 0);
    return start;
}

export function prayerRemindersFor({
    timetable,
    minutes,
    now,
    timeFormat24h,
}: {
    timetable: PrayerTimetable;
    /** Les délais avant chaque prière ; vide, aucun rappel. */
    minutes: readonly number[];
    now: Date;
    timeFormat24h: boolean;
}): Reminder[] {
    if (minutes.length === 0) return [];

    const reminders: Reminder[] = [];
    for (let ahead = 0; ahead < DAYS_AHEAD; ahead++) {
        const day = new Date(now);
        day.setDate(day.getDate() + ahead);
        // Deux séances de Jumu'a portent le même nom : leur rang les distingue.
        prayersOn(timetable, day).forEach((prayer, index) => {
            const start = startOf(prayer);
            const stamp = start.toISOString().slice(0, 10);
            for (const offset of minutes) {
                const id = `prayer:${stamp}:${index}:${prayer.name}`;
                reminders.push({
                    id,
                    key: `${id}:${offset}`,
                    atMs: +start - offset * 60_000,
                    title: PRAYER_LABELS[prayer.name],
                    body: bodyFor(offset, start, timetable.name, timeFormat24h),
                    details: timetable.name,
                });
            }
        });
    }
    return reminders;
}
