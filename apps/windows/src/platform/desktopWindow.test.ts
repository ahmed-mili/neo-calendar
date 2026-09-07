import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { createDesktopWindowActions, reloadDesktop, executeNativeTextCommand, toggleDesktopDevtools, setDesktopInterfaceScale, toggleDesktopFullscreen } from "./desktopWindow";

// All Tauri specifiers resolve to one stub. Override only these three exports;
// every unexpected native call still goes through the refusing proxy.
jest.mock("@tauri-apps/api/core", () => {
    const original = jest.requireActual("@tauri-apps/api/core");
    const allowed = { invoke: jest.fn(), getCurrentWindow: jest.fn(), getCurrentWebview: jest.fn() };
    return new Proxy(allowed, { get(target, key) { return key in target ? target[key as keyof typeof target] : original[key]; } });
});

beforeEach(() => jest.clearAllMocks());

test("routes native commands with exact arguments and propagates failure", async () => {
    (invoke as jest.Mock).mockResolvedValue(undefined);
    await reloadDesktop(true);
    await reloadDesktop(false);
    await executeNativeTextCommand("paste-plain");
    await toggleDesktopDevtools();
    expect((invoke as jest.Mock).mock.calls).toEqual([
        ["reload_desktop", { ignoreCache: true }],
        ["reload_desktop", { ignoreCache: false }],
        ["execute_native_text_command", { command: "paste-plain" }],
        ["toggle_desktop_devtools"],
    ]);
    (invoke as jest.Mock).mockRejectedValueOnce(new Error("native failure"));
    await expect(reloadDesktop(false)).rejects.toThrow("native failure");
});

test("sets only webview zoom and toggles both fullscreen states", async () => {
    const setZoom = jest.fn().mockResolvedValue(undefined);
    const setFullscreen = jest.fn().mockResolvedValue(undefined);
    const isFullscreen = jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    (getCurrentWebview as jest.Mock).mockReturnValue({ setZoom });
    (getCurrentWindow as jest.Mock).mockReturnValue({ isFullscreen, setFullscreen });
    await setDesktopInterfaceScale(1.25);
    await toggleDesktopFullscreen();
    await toggleDesktopFullscreen();
    expect(setZoom).toHaveBeenCalledWith(1.25);
    expect(setFullscreen.mock.calls).toEqual([[true], [false]]);
});

test("factory preserves the native receiver", async () => {
    const window = {
        minimize: jest.fn(async function (this: unknown) { expect(this).toBe(window); }),
        toggleMaximize: jest.fn(async () => {}), close: jest.fn(async () => {}),
        startDragging: jest.fn(async () => {}), isMaximized: jest.fn(async () => false),
        onResized: jest.fn(async () => () => {}), onFocusChanged: jest.fn(async () => () => {}),
    };
    await createDesktopWindowActions(window).minimize();
    expect(window.minimize).toHaveBeenCalledTimes(1);
});
