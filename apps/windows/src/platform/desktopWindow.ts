import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebview } from "@tauri-apps/api/webview";

export interface DesktopWindowActions {
    minimize(): Promise<void>;
    toggleMaximize(): Promise<void>;
    close(): Promise<void>;
    startDragging(): Promise<void>;
    isMaximized(): Promise<boolean>;
    onResized(handler: () => void): Promise<() => void>;
    onFocusChanged(
        handler: (event: { payload: boolean }) => void
    ): Promise<() => void>;
}

export function createDesktopWindowActions(
    window: DesktopWindowActions
): DesktopWindowActions {
    return {
        minimize: () => window.minimize(),
        toggleMaximize: () => window.toggleMaximize(),
        close: () => window.close(),
        startDragging: () => window.startDragging(),
        isMaximized: () => window.isMaximized(),
        onResized: (handler) => window.onResized(handler),
        onFocusChanged: (handler) => window.onFocusChanged(handler),
    };
}

// Built on first use, never at import time: the tests import this module with
// the Tauri stub in place, which throws as soon as a native call is made.
let currentWindowActions: DesktopWindowActions | null = null;
export function getDesktopWindowActions(): DesktopWindowActions {
    if (currentWindowActions === null)
        currentWindowActions = createDesktopWindowActions(getCurrentWindow());
    return currentWindowActions;
}

export type NativeTextCommand =
    | "undo"
    | "redo"
    | "cut"
    | "copy"
    | "paste"
    | "paste-plain"
    | "delete"
    | "select-all";

export const reloadDesktop = (ignoreCache: boolean): Promise<void> =>
    invoke("reload_desktop", { ignoreCache });
export const executeNativeTextCommand = (
    command: NativeTextCommand
): Promise<void> => invoke("execute_native_text_command", { command });
export const toggleDesktopDevtools = (): Promise<void> =>
    invoke("toggle_desktop_devtools");

/**
 * Les paliers de zoom autorisés pour la fenêtre. Indépendant de la hauteur
 * d'heure — même mécanisme que le zoom d'un navigateur, pas une échelle de
 * calendrier — et jamais synchronisé avec Android : cette clé est locale à
 * cette machine.
 */
export const INTERFACE_SCALES = [0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2] as const;

const INTERFACE_SCALE_STORAGE_KEY = "neo-calendar:windows-interface-scale";

/** Un palier reconnu, ou 1 pour tout le reste — absent, corrompu, ou un
    nombre que la liste ne porte pas. */
export function parseInterfaceScale(value: string | null): number {
    const scale = Number(value);
    return INTERFACE_SCALES.some((candidate) => candidate === scale)
        ? scale
        : 1;
}

/** Ce que la fenêtre a retenu la dernière fois qu'un zoom a réussi. */
export function loadDesktopInterfaceScale(): number {
    try {
        return parseInterfaceScale(
            window.localStorage.getItem(INTERFACE_SCALE_STORAGE_KEY)
        );
    } catch {
        return 1;
    }
}

/**
 * Applique le zoom natif et ne le retient que s'il a réellement pris : un
 * palier hors liste n'est jamais envoyé à `setZoom`, et un rejet du natif
 * laisse la valeur enregistrée telle qu'elle était.
 */
export async function setDesktopInterfaceScale(scale: number): Promise<void> {
    const validated = parseInterfaceScale(String(scale));
    await getCurrentWebview().setZoom(validated);
    try {
        window.localStorage.setItem(
            INTERFACE_SCALE_STORAGE_KEY,
            String(validated)
        );
    } catch {
        // Le stockage local peut être indisponible (mode privé, quota) ; le
        // zoom a quand même pris, seul le prochain lancement ne s'en
        // souviendra pas.
    }
}

export async function toggleDesktopFullscreen(): Promise<void> {
    const window = getCurrentWindow();
    await window.setFullscreen(!(await window.isFullscreen()));
}
