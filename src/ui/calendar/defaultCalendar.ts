import { CalendarSource } from "../types";

/**
 * Picks the calendar the "default calendar" (where new events land) should fall
 * back to once `hidden` has been applied.
 *
 * Hiding the default calendar would otherwise leave new events landing in a
 * calendar the user can't see. So we walk the list top-down — the order shown in
 * the sidebar, reordering included — and take the first calendar that is both
 * visible and editable (remote calendars can't receive new events).
 *
 * Returns null when nothing needs to change: the current default is still
 * visible, or no candidate exists at all (everything hidden or read-only), in
 * which case keeping the current default beats clearing it.
 */
export function pickDefaultCalendarAfterHide(
    sources: CalendarSource[],
    hidden: Set<string>,
    currentDefaultId: string
): string | null {
    if (!hidden.has(currentDefaultId)) return null;
    const next = sources.find((s) => s.editable && !hidden.has(s.id));
    if (!next || next.id === currentDefaultId) return null;
    return next.id;
}
