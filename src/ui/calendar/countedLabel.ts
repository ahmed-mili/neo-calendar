import { t } from "../i18n";

/**
 * "Duplicate", or "Duplicate 3 events" — the label of a menu entry that acts on
 * whatever is selected.
 *
 * The count is spelled into the label rather than left to the entry's wording,
 * because the same entry serves one event and twelve, and a menu that says
 * "Delete" over a dozen selected events is a menu that deletes twelve things on
 * a word meant for one.
 *
 * The verb and the noun are looked up separately: the two words sit in the same
 * order in both languages, and a dictionary entry per count would be a phrase
 * per number.
 */
export function countedLabel(verb: string, count: number): string {
    if (count <= 1) return t(verb);
    return `${t(verb)} ${count} ${t("events")}`;
}
