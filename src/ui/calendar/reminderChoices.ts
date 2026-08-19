import { t } from "../i18n";

/**
 * When an event can ask to be announced, in minutes before it starts.
 *
 * The same five choices Notion Calendar offers, in the same order: the event's
 * own start, then four delays. Anything an imported file happens to carry is
 * kept and shown as it is — the list is what can be PICKED, not what can exist.
 */
export const REMINDER_CHOICES = [0, 5, 10, 30, 60];

/**
 * A delay in two parts, because they are not written alike: the delay carries
 * the weight, and the word after it trails behind in grey. "At the start of the
 * event" is a sentence on its own, so nothing trails it.
 */
export function reminderLabelParts(minutes: number): {
    amount: string;
    suffix: string;
} {
    if (minutes <= 0) return { amount: t("At start of event"), suffix: "" };

    const amount =
        minutes % 60 === 0
            ? `${minutes / 60} ${minutes === 60 ? t("hour") : t("hours")}`
            : `${minutes} min`;

    return { amount, suffix: t("before") };
}
