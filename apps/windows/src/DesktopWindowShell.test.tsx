/** @jest-environment jsdom */
import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import DesktopWindowShell, { useDesktopTitlebarHost } from "./DesktopWindowShell";
import { createDesktopWindowActions } from "./platform/desktopWindow";
import DesktopErrorBoundary from "./DesktopErrorBoundary";

let host: HTMLDivElement;
let resized: () => void;
let focused: (event: { payload: boolean }) => void;
const unlistenResize = jest.fn();
const unlistenFocus = jest.fn();
function fakeWindow() {
    return {
        minimize: jest.fn(async () => {}), toggleMaximize: jest.fn(async () => {}),
        close: jest.fn(async () => {}), startDragging: jest.fn(async () => {}),
        isMaximized: jest.fn(async () => false),
        onResized: jest.fn(async (handler: () => void) => { resized = handler; return unlistenResize; }),
        onFocusChanged: jest.fn(async (handler: typeof focused) => { focused = handler; return unlistenFocus; }),
    };
}
beforeEach(() => { jest.clearAllMocks(); host = document.createElement("div"); document.body.append(host); });
afterEach(() => { act(() => { ReactDOM.unmountComponentAtNode(host); }); host.remove(); });
async function click(label: string) {
    await act(async () => { host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!.click(); });
}
test.each(["chargement", "accueil", "calendrier"])("controls survive %s children and expose a reactive portal host", async (child) => {
    const window = fakeWindow();
    function Portal() { const slot = useDesktopTitlebarHost(); return slot ? ReactDOM.createPortal(<span>portail</span>, slot) : null; }
    await act(async () => { ReactDOM.render(<DesktopWindowShell actions={createDesktopWindowActions(window)}><main>{child}</main><Portal /></DesktopWindowShell>, host); });
    expect(host.querySelector("#nc-desktop-titlebar-slot")!.textContent).toContain("portail");
    await click("Réduire"); await click("Agrandir"); await click("Fermer");
    expect(window.minimize).toHaveBeenCalledTimes(1);
    expect(window.toggleMaximize).toHaveBeenCalledTimes(1);
    expect(window.close).toHaveBeenCalledTimes(1);
    expect(window.startDragging).not.toHaveBeenCalled();
});
test("window controls are icons, and the maximize icon follows the window state", async () => {
    const window = fakeWindow();
    await act(async () => { ReactDOM.render(<DesktopWindowShell actions={createDesktopWindowActions(window)}>content</DesktopWindowShell>, host); });
    const controls = Array.from(host.querySelectorAll(".nc-desktop-window-control"));
    expect(controls.map(control => control.getAttribute("aria-label"))).toEqual(["Réduire", "Agrandir", "Fermer"]);
    controls.forEach(control => {
        expect(control.querySelector("svg")).not.toBeNull();
        expect(control.textContent).toBe("");
    });
    const restingIcon = host.querySelector('button[aria-label="Agrandir"] svg')!.getAttribute("class");
    window.isMaximized.mockResolvedValue(true);
    await act(async () => { resized(); });
    const maximizedIcon = host.querySelector('button[aria-label="Restaurer"] svg')!.getAttribute("class");
    expect(maximizedIcon).not.toBe(restingIcon);
});
test("calendar render failure leaves window controls usable", async () => {
    const window = fakeWindow();
    function Broken(): JSX.Element { throw new Error("calendar crash"); }
    const quiet = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
        await act(async () => { ReactDOM.render(<DesktopWindowShell actions={createDesktopWindowActions(window)}><DesktopErrorBoundary><Broken /></DesktopErrorBoundary></DesktopWindowShell>, host); });
        expect(host.querySelector('[role="alert"]')!.textContent).toContain("calendar crash");
        await click("Fermer"); expect(window.close).toHaveBeenCalledTimes(1);
    } finally { quiet.mockRestore(); }
});
test("action failure is visible; resize and focus refresh state", async () => {
    const window = fakeWindow();
    window.minimize.mockRejectedValueOnce(new Error("refus natif"));
    await act(async () => { ReactDOM.render(<DesktopWindowShell actions={createDesktopWindowActions(window)}>content</DesktopWindowShell>, host); });
    await click("Réduire");
    expect(host.querySelector('[role="alert"]')!.textContent).toContain("refus natif");
    window.isMaximized.mockResolvedValue(true);
    await act(async () => { resized(); focused({ payload: false }); });
    expect(host.querySelector('button[aria-label="Restaurer"]')).not.toBeNull();
    expect(host.querySelector('[data-focused="false"]')).not.toBeNull();
    act(() => { ReactDOM.unmountComponentAtNode(host); });
    expect(unlistenResize).toHaveBeenCalledTimes(1); expect(unlistenFocus).toHaveBeenCalledTimes(1);
});
test("late listener registration is cleaned after unmount", async () => {
    const window = fakeWindow();
    let resolveResize!: (fn: () => void) => void;
    let resolveFocus!: (fn: () => void) => void;
    window.onResized.mockReturnValue(new Promise(resolve => { resolveResize = resolve; }));
    window.onFocusChanged.mockReturnValue(new Promise(resolve => { resolveFocus = resolve; }));
    await act(async () => { ReactDOM.render(<DesktopWindowShell actions={createDesktopWindowActions(window)}>content</DesktopWindowShell>, host); });
    act(() => { ReactDOM.unmountComponentAtNode(host); });
    await act(async () => { resolveResize(unlistenResize); resolveFocus(unlistenFocus); });
    expect(unlistenResize).toHaveBeenCalledTimes(1); expect(unlistenFocus).toHaveBeenCalledTimes(1);
});
test("only empty titlebar starts drag and owns double click", async () => {
    const window = fakeWindow();
    await act(async () => { ReactDOM.render(<DesktopWindowShell actions={createDesktopWindowActions(window)}>content</DesktopWindowShell>, host); });
    const slot = host.querySelector("#nc-desktop-titlebar-slot")!;
    await act(async () => {
        slot.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, detail: 1 }));
        slot.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, detail: 2 }));
        slot.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, button: 0, detail: 2 }));
    });
    expect(window.startDragging).toHaveBeenCalledTimes(1);
    expect(window.toggleMaximize).toHaveBeenCalledTimes(1);
});
