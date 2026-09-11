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

/** « 45 minutes avant », « 2 jours avant » — et le silence nommé pour ce
 *  qu'il est, puisqu'un « 0 minute avant » ne dit rien à personne. */
export function reminderDelayLabel(minutes: number): string {
    if (minutes <= 0) return t("No reminder");
    const { amount, unit } = splitReminderDelay(minutes);
    return `${amount} ${unitWord(amount, unit)} ${t("before")}`;
}
