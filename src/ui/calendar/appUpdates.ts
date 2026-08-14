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

interface UpdateBridge {
    checkForUpdates?: () => void;
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
