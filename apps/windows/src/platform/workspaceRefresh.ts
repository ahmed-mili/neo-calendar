/**
 * When to re-read the vault after the app comes back into view.
 *
 * The data folder is synced by an outside tool, so files can change while the
 * app is in the background — an event created on the desktop lands on the phone
 * with no notice at all. Coming back to the foreground is the moment it has to
 * appear, and until now nothing triggered a read there: the desktop reloads on
 * `window.focus`, which an Android WebView never fires when its activity
 * resumes. The only way to see the event was to quit and relaunch.
 */

/** Wakes closer together than this are treated as one. Returning to the
    foreground can fire both `visibilitychange` and `focus`, and re-reading the
    whole vault twice for a single wake is pure waste. */
export const WAKE_RELOAD_GAP_MS = 400;

export function shouldReloadOnWake({
    lastReloadAt,
    now,
}: {
    lastReloadAt: number | null;
    now: number;
}): boolean {
    if (lastReloadAt === null) return true;

    // A clock that jumped backwards — a timezone change, a correction from the
    // network — would otherwise lock reloading out until real time caught up.
    if (now < lastReloadAt) return true;

    return now - lastReloadAt > WAKE_RELOAD_GAP_MS;
}
