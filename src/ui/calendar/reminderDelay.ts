/**
 * Une durée de rappel, dans l'unité où on l'a écrite.
 *
 * Les rappels sont rangés en minutes, parce qu'ils partent tels quels dans un
 * calcul de date. Mais personne ne choisit « 4320 minutes » : on choisit trois
 * jours. Ce module fait l'aller-retour entre les deux — un nombre et une unité
 * d'un côté, des minutes de l'autre — et donne à un délai le nom qu'on lui
 * donnerait à voix haute.
 */

import { t } from "../i18n";

/** Quatre semaines, la borne que les préférences acceptent. */
const MAX_MINUTES = 40320;

export type ReminderUnit = "minutes" | "hours" | "days";

/** De la plus fine à la plus large, l'ordre du menu déroulant. */
export const REMINDER_UNITS: ReminderUnit[] = ["minutes", "hours", "days"];

const MINUTES_PER: Record<ReminderUnit, number> = {
    minutes: 1,
    hours: 60,
    days: 1440,
};

export interface ReminderDelay {
    amount: number;
    unit: ReminderUnit;
}

/**
 * Le délai relu dans l'unité la plus large qui tombe juste : 120 minutes sont
 * deux heures, 150 restent 150 minutes. Zéro veut dire « aucun rappel » et
 * n'est donc pas une durée : le champ personnalisé s'ouvre sur dix minutes,
 * une valeur qu'on peut enregistrer, plutôt que sur un zéro qu'il refuserait.
 */
export function splitReminderDelay(minutes: number): ReminderDelay {
    if (minutes <= 0) return { amount: 10, unit: "minutes" };
    for (const unit of [...REMINDER_UNITS].reverse()) {
        const size = MINUTES_PER[unit];
        if (minutes % size === 0) return { amount: minutes / size, unit };
    }
    return { amount: minutes, unit: "minutes" };
}

/** Le chemin inverse, tenu entre une minute et la borne des préférences : un
 *  champ que l'on vide ne doit pas enregistrer « aucun rappel » par accident,
 *  ce choix-là ayant sa propre ligne. */
export function reminderMinutesFrom(
    amount: number,
    unit: ReminderUnit
): number {
    const whole = Math.floor(Number.isFinite(amount) ? amount : 1);
    const minutes = Math.max(1, whole) * MINUTES_PER[unit];
    return Math.min(MAX_MINUTES, Math.max(1, minutes));
}

function unitWord(amount: number, unit: ReminderUnit): string {
    if (unit === "minutes") return t(amount === 1 ? "minute" : "minutes");
    if (unit === "hours") return t(amount === 1 ? "hour" : "hours");
    return t(amount === 1 ? "day" : "days");
}

/** Plusieurs délais en un souffle : « 5 minutes, 1 heure avant ». Vide, c'est
 *  le silence. */
export function reminderListLabel(minutes: readonly number[]): string {
    if (minutes.length === 0) return t("No reminder");
    const before = ` ${t("before")}`;
    return (
        minutes
            .map((value) => reminderDelayLabel(value).slice(0, -before.length))
            .join(", ") + before
    );
}

/** Les délais d'un rappel de prière, où zéro est « à l'heure » et non le
 *  silence : « À l'heure de la prière, 10 minutes avant ». */
export function prayerReminderListLabel(minutes: readonly number[]): string {
    if (minutes.length === 0) return t("No reminder");
    const before = minutes.filter((value) => value > 0);
    return [
        ...(minutes.includes(0) ? [t("At the prayer")] : []),
        ...(before.length > 0 ? [reminderListLabel(before)] : []),
    ].join(", ");
}

/** « 45 minutes avant », « 2 jours avant » — et le silence nommé pour ce
 *  qu'il est, puisqu'un « 0 minute avant » ne dit rien à personne. */
export function reminderDelayLabel(minutes: number): string {
    if (minutes <= 0) return t("No reminder");
    // Un délai composé se lit en toutes ses parts : « 1 jour 30 minutes
    // avant », pas « 1470 minutes avant ».
    const parts: string[] = [];
    let rest = minutes;
    for (const unit of [...REMINDER_UNITS].reverse()) {
        const amount = Math.floor(rest / MINUTES_PER[unit]);
        if (amount > 0) {
            parts.push(`${amount} ${unitWord(amount, unit)}`);
            rest -= amount * MINUTES_PER[unit];
        }
    }
    return `${parts.join(" ")} ${t("before")}`;
}

/**
 * Le délai en abrégé, tel qu'on le dirait à voix haute : « 1 h 30 », pas
 * « 90 min ».
 *
 * `reminderDelayLabel` écrit la même durée en toutes lettres pour les réglages
 * (« 1 heure 30 minutes avant ») ; celle-ci en est la forme courte, pour la
 * ligne d'une notification qu'on lit d'un coup d'œil. Les deux découpent la
 * durée de la même manière — c'est ce qui fait que l'application ne dit pas
 * deux choses différentes du même délai.
 *
 * Le reste des heures est écrit sur deux chiffres et sans unité, comme on lit
 * une heure : « 2 h 05 », et non « 2 h 5 min ».
 */
export function relativeDelayLabel(minutes: number): string {
    if (minutes <= 0) return t("Starting now");
    if (minutes < MINUTES_PER.hours) return `${minutes} min`;

    if (minutes < MINUTES_PER.days) {
        const hours = Math.floor(minutes / MINUTES_PER.hours);
        const rest = minutes % MINUTES_PER.hours;
        if (rest === 0) return `${hours} ${t("h")}`;
        return `${hours} ${t("h")} ${String(rest).padStart(2, "0")}`;
    }

    const days = Math.floor(minutes / MINUTES_PER.days);
    const rest = minutes % MINUTES_PER.days;
    // Le reste repasse par la même règle : un jour et demi se dit « 1 j 12 h »,
    // une journée et demi-heure « 1 j 30 min ».
    if (rest === 0) return `${days} ${t("j")}`;
    return `${days} ${t("j")} ${relativeDelayLabel(rest)}`;
}
