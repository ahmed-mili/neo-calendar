/*
 * What the app knows about its own version, and how it asks for a newer one.
 *
 * The version number is stamped in at build time by both Vite configs
 * (`__NEO_VERSION__`), and is a label: nothing in the interface asks for a
 * check any more. Both shells look on their own — at launch, on coming back to
 * the app, and on a timer — so the only thing left to say across the bridge is
 * what has been downloaded, and to ask for it to be installed.
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

/** Fired while an update downloads, with `detail.percent`:
 *  0..100 as it goes, -1 when the server declined to say how big the file is
 *  (nothing honest to count, so the control spins instead), and -2 when it is
 *  over either way. The same figure the notification draws — one number, two
 *  places, so they cannot disagree. */
export const UPDATE_PROGRESS_EVENT = "neo-update-progress";

/**
 * Fired by the desktop bridge when Windows could not hand the downloaded
 * package to the updater installer. A successful Windows install intentionally
 * never fires a matching "done": Tauri launches the installer and exits this
 * process, then the installer relaunches the freshly updated app.
 */
export const UPDATE_INSTALL_ERROR_EVENT = "neo-update-install-error";

export interface UpdateInstallErrorDetail {
    message: string;
}

interface UpdateBridge {
    pendingUpdate?: () => string;
    installPendingUpdate?: () => void;
}

function bridge(): UpdateBridge | null {
    if (typeof window === "undefined") return null;
    const host = (window as Window & { NeoAndroid?: UpdateBridge }).NeoAndroid;
    return host ?? null;
}

/**
 * Turns a rejected native install into a DOM event the shared React surface can
 * hear without importing Tauri. This is deliberately one-way: success ends the
 * current Windows process, so there is no honest success callback to wait for.
 */
export function reportUpdateInstallError(error: unknown): void {
    if (typeof window === "undefined") return;
    const message =
        error instanceof Error
            ? error.message
            : typeof error === "string"
            ? error
            : "Update installation failed.";
    window.dispatchEvent(
        new CustomEvent<UpdateInstallErrorDetail>(UPDATE_INSTALL_ERROR_EVENT, {
            detail: { message },
        })
    );
}

/**
 * La version déjà téléchargée, quand c'est le bureau qui l'a ramenée.
 *
 * Le téléphone garde la sienne dans sa coque et répond par le pont ; le bureau
 * n'a pas de pont, alors ce qu'il rapporte se pose ici. Une seule question est
 * ainsi posée par la fenêtre — « qu'est-ce qui attend ? » — et les deux camps y
 * répondent chacun à leur manière.
 */
let downloadedVersion = "";

/** Dit par le bureau quand le téléchargement automatique a fini. */
export function noteDownloadedUpdate(version: string): void {
    downloadedVersion = version;
    if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
    }
}

/** The version the shell has found and is holding, or "" for none.
 *
 *  It outlives "Later": the prompt goes away, the fact does not, and that is
 *  what the badge on the menu button is drawn from. Reading it costs one call
 *  across the bridge and returns a string the shell already has. */
export function pendingUpdateVersion(): string {
    const host = bridge();
    if (typeof host?.pendingUpdate !== "function") return downloadedVersion;
    try {
        return host.pendingUpdate() || downloadedVersion;
    } catch {
        return downloadedVersion;
    }
}

/**
 * Pose la mise à jour déjà descendue, du côté qui l'a.
 *
 * Le téléphone la tient dans sa coque et l'installateur du système prend le
 * relais ; le bureau passe par une commande native. Une seule fonction, parce
 * que le contrôle qui appelle ne sait pas — et n'a pas à savoir — où il tourne.
 *
 * Rend `false` là où rien ne peut poser quoi que ce soit : une vieille coque
 * sans la méthode, ou une fenêtre ouverte hors de toute application.
 */
export function installPendingUpdate(): boolean {
    const host = bridge();
    if (typeof host?.installPendingUpdate === "function") {
        try {
            host.installPendingUpdate();
            return true;
        } catch {
            return false;
        }
    }
    if (!installer) return false;
    installer();
    return true;
}

/**
 * Ce qui pose la mise à jour là où il n'y a pas de pont.
 *
 * Le bureau l'enregistre au démarrage (voir desktopUpdates), plutôt que d'être
 * importé depuis ici : le code partagé ne connaît pas la coque qui l'exécute, et
 * un import dans ce sens ferait entrer Tauri dans un fichier que le téléphone
 * charge aussi.
 */
let installer: (() => void) | null = null;

export function setUpdateInstaller(install: () => void): void {
    installer = install;
}
