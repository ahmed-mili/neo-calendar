import { t } from "../i18n";

/**
 * The single letter a weekday is chosen by, in the language being spoken.
 *
 * The row of circles on the recurrence screen was labelled from letters written
 * into the source in English — M T W T F S S in a French interface, which is
 * how a translated app gives itself away. They are cut from the short day names
 * the rest of the calendar already uses, so there is one list of day names and
 * not two.
 *
 * Keyed by the codes an RRULE uses (U for Sunday, R for Thursday), in the order
 * `days.min` is written: Sunday first.
 */
export function dayInitialsFrom(minNames: string): Record<string, string> {
    const [sunday, monday, tuesday, wednesday, thursday, friday, saturday] =
        minNames.split(",").map((name) => name.trim().charAt(0).toUpperCase());
    return {
        U: sunday,
        M: monday,
        T: tuesday,
        W: wednesday,
        R: thursday,
        F: friday,
        S: saturday,
    };
}

/**
 * The letters as they stand for this run.
 *
 * The language is read once at start-up and applied for the run (see i18n), so
 * this is worked out once with it rather than on every render.
 */
export const DAY_INITIALS = dayInitialsFrom(t("days.min"));
