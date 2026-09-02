// Layout constants for the calendar time grid
export const HOUR_HEIGHT = 60; // px per hour, at rest
export const SLOT_HEIGHT = 30; // px per 30-min slot

/* ── How tall an hour is right now ───────────────────────────────
   Pinching the grid on the phone changes it, so this is a value and not a
   constant. There is exactly one of it, and the stylesheet reads the same
   number through `--nc-hour-height`: the two used to be set apart — 60 in
   JavaScript, 84 in the Android CSS — and the visual day came out longer than
   the logical one, with phantom hours after midnight. Anything that measures
   the grid must go through here.

   The bounds are where the grid stops being a calendar: the whole day barely
   fits at the bottom, one hour fills the screen at the top. */
/**
 * La hauteur d'heure au repos sur telephone.
 *
 * Une colonne de telephone est etroite : un titre d'evenement y tient souvent
 * sur trois lignes. Mesure dans l'application, a 60 px par heure, un evenement
 * d'une heure offre 46 px a son contenu alors qu'il en faut 57 — trois lignes
 * de titre a 14,3 px, plus la ligne d'horaire. La troisieme ligne etait donc
 * coupee en deux dans la hauteur, ce qui se lit comme un defaut d'affichage et
 * non comme un texte trop long.
 *
 * 72 px laissent 58 px de contenu : la mesure passe, avec un pixel de reste.
 * C'est une valeur de repos et non un plancher — le pincement descend toujours
 * jusqu'a MIN_HOUR_HEIGHT.
 */
export const ANDROID_HOUR_HEIGHT = 72;

export const MIN_HOUR_HEIGHT = 32;
export const MAX_HOUR_HEIGHT = 320;

export function clampHourHeight(px: number): number {
    return Math.min(Math.max(px, MIN_HOUR_HEIGHT), MAX_HOUR_HEIGHT);
}

/**
 * La hauteur d'heure au repos, telle que la feuille de style la declare.
 *
 * Le nombre vit dans le CSS — 60 px partout, 72 px sur telephone — et le
 * JavaScript le lit plutot que d'en garder une copie. C'est la seule facon de
 * tenir la promesse du commentaire ci-dessus : les deux ont deja diverge, 60
 * d'un cote et 84 de l'autre, et le jour visible etait alors plus long que le
 * jour logique, avec des heures fantomes apres minuit.
 *
 * Retombe sur HOUR_HEIGHT hors navigateur, ou tant que rien n'est declare.
 */
export function restingHourHeight(): number {
    if (typeof document === "undefined" || !document.body) return HOUR_HEIGHT;
    const declared = parseFloat(
        getComputedStyle(document.body).getPropertyValue("--nc-hour-height")
    );
    return Number.isFinite(declared) && declared > 0
        ? clampHourHeight(declared)
        : HOUR_HEIGHT;
}

let hourHeight: number = HOUR_HEIGHT;

export const currentHourHeight = (): number => hourHeight;

/** Returns what was actually set, which may be a bound rather than the ask. */
export function setHourHeight(px: number): number {
    hourHeight = clampHourHeight(px);
    return hourHeight;
}

/**
 * A vertical measure written in hours, so it follows the zoom on its own.
 *
 * Anything laid out this way is re-measured by the browser when the variable
 * changes — no re-render, nothing to keep in step. That is what makes a pinch
 * cost one number per frame instead of a React pass over every event.
 */
export function scaledPx(hours: number, offsetPx = 0): string {
    const offset =
        offsetPx === 0
            ? ""
            : offsetPx > 0
            ? ` + ${offsetPx}px`
            : ` - ${-offsetPx}px`;
    return `calc(var(--nc-hour-height, ${HOUR_HEIGHT}px) * ${hours}${offset})`;
}

/** Same, for a height that must not collapse below `minPx`. */
export function scaledHeightPx(
    hours: number,
    offsetPx = 0,
    minPx = SLOT_HEIGHT
): string {
    return `calc(max(${minPx}px, var(--nc-hour-height, ${HOUR_HEIGHT}px) * ${hours})${
        offsetPx === 0
            ? ""
            : offsetPx > 0
            ? ` + ${offsetPx}px`
            : ` - ${-offsetPx}px`
    })`;
}
export const OVERLAP_COL_GAP = 16; // px right-trim on every event
export const EVENT_VGAP = 4; // px vertical gap between back-to-back events

// All-day section: each all-day event occupies one stacked "lane" row. The
// section grows up to ALLDAY_MAX_ROWS rows, then scrolls internally (Notion-
// style). ALLDAY_ROW_HEIGHT must match the .nc-allday-lane-bar height math in
// CalendarOverlays.css.
export const ALLDAY_ROW_HEIGHT = 24; // px per all-day lane row
export const ALLDAY_MAX_ROWS = 4; // visible rows before the section scrolls

/**
 * How long the all-day band takes to grow by a row, or give one back.
 *
 * A row appearing from one frame to the next reads as the whole grid jumping,
 * because that is what it does: everything below the band moves down by 24px at
 * once.
 *
 * The band's own height is driven from JS (TimeGrid), on `easeOutCubic`, in the
 * same frame as the scroll correction that keeps the grid still underneath it —
 * one clock for the whole gesture. This constant is also published to the
 * stylesheet as `--nc-allday-grow`, for the pieces that are CSS's to move and
 * that have to arrive with the band: a bar sliding to a new lane, and a bar
 * appearing in the room the band has just made. Their curve
 * (`cubic-bezier(0.215, 0.61, 0.355, 1)`) is that same easeOutCubic.
 */
export const ALLDAY_GROW_MS = 220;

// Day/month names, in the language the calendar is set to. Written out in the
// dictionary rather than taken from toLocaleDateString so the grid reads the
// same whatever locale the machine happens to be set to.
import { tList } from "../i18n";

export const DAYS_SHORT = tList("days.short", [
    "Sun",
    "Mon",
    "Tue",
    "Wed",
    "Thu",
    "Fri",
    "Sat",
]);
export const DAYS_MIN = tList("days.min", [
    "Su",
    "Mo",
    "Tu",
    "We",
    "Th",
    "Fr",
    "Sa",
]);
export const MONTHS_SHORT = tList("months.short", [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
]);
export const MONTHS = tList("months.long", [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
]);
