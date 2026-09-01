/**
 * Les horaires de prière d'une mosquée, tels qu'elle les publie.
 *
 * Rien n'est calculé ici : aucune position du soleil, aucune convention
 * d'angle, aucun arrondi. Une mosquée imprime un calendrier annuel et c'est
 * lui qui fait foi — deux mosquées de la même ville n'annoncent pas la même
 * minute, et c'est celle de la sienne qu'on veut. Les tables sont produites à
 * partir des PDF par `scripts/import-prayer-calendar.mjs`.
 *
 * Ce module ne connaît ni le DOM ni le calendrier : il répond à deux questions,
 * quelles prières un jour donné, et quelle est la prochaine.
 */

/** Une prière, dans l'ordre du jour. `jumua` remplace `dhuhr` le vendredi. */
export type PrayerName =
    | "fajr"
    | "dhuhr"
    | "jumua"
    | "asr"
    | "maghrib"
    | "isha";

export interface PrayerTimetable {
    id: string;
    /** Le nom que la mosquée se donne, affiché tel quel dans les réglages. */
    name: string;
    /** L'année que la table couvre, et la seule. */
    year: number;
    /** Les séances de Jumu'a, « HH:MM », annoncées pour l'année entière. */
    jumua: string[];
    /** Par jour « MM-JJ », les minutes depuis minuit de
     *  [fajr, chourouk, dhuhr, asr, maghrib, isha]. */
    days: Record<string, number[]>;
}

/** Une prière posée dans le temps. */
export interface PrayerMoment {
    name: PrayerName;
    /** Minutes depuis minuit, dans le fuseau de l'appareil — la table est
     *  imprimée en heure locale, changements d'heure compris. */
    minutes: number;
    /** Le jour où elle tombe. Utile parce que la prochaine prière, passée
     *  Isha, est le Fajr du lendemain. */
    date: Date;
}

/** L'ordre des colonnes du PDF. Chourouk n'est pas une prière : c'est le lever
 *  du soleil, la fin du temps de Fajr. Il est lu et gardé pour rien d'autre. */
const FAJR = 0;
const DHUHR = 2;
const ASR = 3;
const MAGHRIB = 4;
const ISHA = 5;

const pad = (value: number) => String(value).padStart(2, "0");

/** La clé « MM-JJ » d'une date, dans le fuseau de l'appareil. */
export function dayKey(date: Date): string {
    return `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function minutesOfTime(time: string): number {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
}

function startOfDay(date: Date): Date {
    const copy = new Date(date);
    copy.setHours(0, 0, 0, 0);
    return copy;
}

/**
 * Les prières d'un jour, dans l'ordre.
 *
 * Le vendredi, Dhuhr laisse la place à Jumu'a : la prière de midi y est
 * remplacée par la prière commune, et l'afficher en plus dirait qu'il y en a
 * deux. Une mosquée qui annonce deux séances de Jumu'a en a bien deux — deux
 * prêches successifs faute de place —, donc les deux sont rendues.
 *
 * Hors de l'année que la table couvre, la liste est vide : mieux vaut ne rien
 * montrer qu'une heure inventée.
 */
export function prayersOn(
    timetable: PrayerTimetable,
    date: Date
): PrayerMoment[] {
    if (date.getFullYear() !== timetable.year) return [];

    const minutes = timetable.days[dayKey(date)];
    if (!minutes) return [];

    const day = startOfDay(date);
    const at = (name: PrayerName, value: number): PrayerMoment => ({
        name,
        minutes: value,
        date: day,
    });

    const isFriday = date.getDay() === 5;
    const midday: PrayerMoment[] = isFriday
        ? timetable.jumua.map((time) => at("jumua", minutesOfTime(time)))
        : [at("dhuhr", minutes[DHUHR])];

    return [
        at("fajr", minutes[FAJR]),
        ...midday,
        at("asr", minutes[ASR]),
        at("maghrib", minutes[MAGHRIB]),
        at("isha", minutes[ISHA]),
    ].sort((left, right) => left.minutes - right.minutes);
}

/**
 * La prochaine prière, à la minute où l'on regarde.
 *
 * Après Isha il n'y a plus rien à attendre du jour : la suivante est le Fajr du
 * lendemain, et le trait doit donc pouvoir désigner une autre colonne que
 * celle d'aujourd'hui. Renvoie `null` quand la table ne couvre pas le jour
 * qu'il faudrait lire — le 31 décembre après Isha, par exemple, tant que le
 * calendrier de l'année suivante n'est pas importé.
 */
export function nextPrayer(
    timetable: PrayerTimetable,
    now: Date
): PrayerMoment | null {
    const minutesNow = now.getHours() * 60 + now.getMinutes();
    const today = prayersOn(timetable, now);
    const upcoming = today.find((prayer) => prayer.minutes > minutesNow);
    if (upcoming) return upcoming;

    const tomorrow = new Date(startOfDay(now));
    tomorrow.setDate(tomorrow.getDate() + 1);
    return prayersOn(timetable, tomorrow)[0] ?? null;
}

/** L'heure d'une prière en heures décimales, l'unité dans laquelle la grille
 *  place ses traits. */
export function prayerHours(prayer: PrayerMoment): number {
    return prayer.minutes / 60;
}

/** Un trait à poser dans la grille. Même forme que `PrayerLine` de
 *  TimeGrid.types, redite ici pour que ce module ne dépende de rien. */
export interface PrayerLineSpec {
    date: Date;
    hours: number;
    /** Minutes depuis minuit : le trait dit à quelle hauteur tombe la prière,
     *  ce chiffre dit à quelle minute, et c'est lui que la gouttière imprime. */
    minutes: number;
    next: boolean;
}

/**
 * Les traits à poser, à la minute où l'on regarde.
 *
 * Celui de la prochaine prière est toujours là — c'est le seul que le téléphone
 * montre, Mawaqit y faisant déjà le reste. `showAll` y ajoute les autres heures
 * du jour, tant que l'on tient la touche sur ordinateur.
 *
 * La prochaine prière n'est pas répétée dans le lot : deux traits à la même
 * hauteur se disputeraient la même rangée, et c'est elle qui doit gagner.
 */
export function prayerLinesFor({
    timetable,
    now,
    showAll,
}: {
    timetable: PrayerTimetable | null;
    now: Date;
    showAll: boolean;
}): PrayerLineSpec[] {
    if (!timetable) return [];

    const next = nextPrayer(timetable, now);
    const lineFor = (
        prayer: PrayerMoment,
        isNext: boolean
    ): PrayerLineSpec => ({
        date: prayer.date,
        hours: prayerHours(prayer),
        minutes: prayer.minutes,
        next: isNext,
    });

    if (!showAll) return next ? [lineFor(next, true)] : [];

    // Tenue, la touche montre la journée qu'on regarde et rien d'autre. Passé
    // Isha la prochaine prière est le Fajr du lendemain : la garder ici posait
    // un trait dans la colonne d'à côté, à quelques minutes de ceux
    // d'aujourd'hui, et les deux se lisaient comme une seule barre brisée.
    const today = startOfDay(now).getTime();
    return prayersOn(timetable, now).map((prayer) =>
        lineFor(
            prayer,
            next !== null &&
                next.minutes === prayer.minutes &&
                next.date.getTime() === today
        )
    );
}
