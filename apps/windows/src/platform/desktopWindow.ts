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
export const setDesktopInterfaceScale = (scale: number): Promise<void> =>
    getCurrentWebview().setZoom(scale);
export async function toggleDesktopFullscreen(): Promise<void> {
    const window = getCurrentWindow();
    await window.setFullscreen(!(await window.isFullscreen()));
}
