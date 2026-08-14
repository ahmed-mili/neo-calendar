/*
 * What the app knows about its own version, and how it asks for a newer one.
 *
 * The version number is stamped in at build time by both Vite configs
 * (`__NEO_VERSION__`). The check itself belongs to the Android shell — it is
 * the side that can download an APK and hand it to the package installer — so
 * this module only reaches for the bridge and reports whether it is there.
 * Everywhere else (the desktop, which updates itself through Tauri) the version
 * is a label and nothing more.
 */

/** Stamped by Vite's `define`. Absent in any build that does not set it, which
    is why every read goes through the guard below rather than naming it. */
declare const __NEO_VERSION__: string | undefined;

/** The running version, or "" where the build did not stamp one.
 *
 *  `typeof` on a name the bundler may never have defined is safe in JavaScript
 *  — it is the one operator that does not throw on an undeclared identifier —
 *  and where Vite DID define it the whole expression folds to a constant. */
export function appVersion(): string {
    try {
        return typeof __NEO_VERSION__ === "string" ? __NEO_VERSION__ : "";
    } catch {
        return "";
    }
}

/** Fired on `window` by the Android shell the moment a check finds something
 *  newer, so the badge appears without anyone waiting for a poll. */
export const UPDATE_EVENT = "neo-update-available";

/** Fired with `detail.status` once a check asked for BY HAND has finished:
 *  "current" when nothing is newer, "failed" when the look could not be taken.
 *  A check that finds something opens the prompt instead, and says so through
 *  UPDATE_EVENT — so there is no "found" here. */
export const CHECK_RESULT_EVENT = "neo-update-checked";

export type CheckResult = "current" | "failed";

/** Fired while an update downloads, with `detail.percent`:
 *  0..100 as it goes, -1 when the server declined to say how big the file is
 *  (nothing honest to count, so the control spins instead), and -2 when it is
 *  over either way. The same figure the notification draws — one number, two
 *  places, so they cannot disagree. */
export const UPDATE_PROGRESS_EVENT = "neo-update-progress";

interface UpdateBridge {
    checkForUpdates?: () => void;
    pendingUpdate?: () => string;
}

function bridge(): UpdateBridge | null {
    if (typeof window === "undefined") return null;
    const host = (window as Window & { NeoAndroid?: UpdateBridge }).NeoAndroid;
    return host ?? null;
}

/** Whether asking for a check would reach anything.
 *
 *  Feature-detected on the method, not on the platform: an older APK carries a
 *  bridge without it, and calling a method that is not there throws inside the
 *  WebView rather than doing nothing quietly. */
export function canCheckForUpdates(): boolean {
    return typeof bridge()?.checkForUpdates === "function";
}

/** The version the shell has found and is holding, or "" for none.
 *
 *  It outlives "Later": the prompt goes away, the fact does not, and that is
 *  what the badge on the menu button is drawn from. Reading it costs one call
 *  across the bridge and returns a string the shell already has. */
export function pendingUpdateVersion(): string {
    const host = bridge();
    if (typeof host?.pendingUpdate !== "function") return "";
    try {
        return host.pendingUpdate() || "";
    } catch {
        return "";
    }
}

/** Ask the shell to look now. It owns what happens next — the prompt if there
 *  is something newer, a word if there is not — because it is the side that
 *  knows, and a second answer rendered in here could only disagree with it. */
export function requestUpdateCheck(): boolean {
    const host = bridge();
    if (typeof host?.checkForUpdates !== "function") return false;
    try {
        host.checkForUpdates();
        return true;
    } catch {
        return false;
    }
}
