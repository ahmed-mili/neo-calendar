/** @jest-environment jsdom */
import * as fs from "fs";
import * as path from "path";
import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import DesktopWindowShell, {
    DESKTOP_KEYBOARD_FOCUS_ATTRIBUTE,
} from "./DesktopWindowShell";
import { createDesktopWindowActions } from "./platform/desktopWindow";

let host: HTMLDivElement;

function fakeWindow() {
    return {
        minimize: jest.fn(async () => {}),
        toggleMaximize: jest.fn(async () => {}),
        close: jest.fn(async () => {}),
        startDragging: jest.fn(async () => {}),
        isMaximized: jest.fn(async () => false),
        onResized: jest.fn(async () => () => {}),
        onFocusChanged: jest.fn(async () => () => {}),
    };
}

beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
});

afterEach(() => {
    act(() => {
        ReactDOM.unmountComponentAtNode(host);
    });
    document.documentElement.removeAttribute(DESKTOP_KEYBOARD_FOCUS_ATTRIBUTE);
    host.remove();
});

test("clic souris puis Shift ne transforme pas le bouton focalise en focus clavier", async () => {
    await act(async () => {
        ReactDOM.render(
            <DesktopWindowShell
                actions={createDesktopWindowActions(fakeWindow())}
            >
                content
            </DesktopWindowShell>,
            host
        );
    });

    const button = host.querySelector<HTMLButtonElement>(
        'button[aria-label="Réduire"]'
    )!;

    await act(async () => {
        button.dispatchEvent(
            new MouseEvent("pointerdown", { bubbles: true, button: 0 })
        );
        button.focus();
    });
    expect(document.activeElement).toBe(button);
    expect(
        document.documentElement.hasAttribute(DESKTOP_KEYBOARD_FOCUS_ATTRIBUTE)
    ).toBe(false);

    await act(async () => {
        button.dispatchEvent(
            new KeyboardEvent("keydown", {
                key: "Shift",
                shiftKey: true,
                bubbles: true,
            })
        );
    });

    // Le symptome de regression est exactement ici : Shift seul ne doit pas
    // autoriser les styles visuels de focus clavier sur le bouton clique.
    expect(document.activeElement).toBe(button);
    expect(
        document.documentElement.hasAttribute(DESKTOP_KEYBOARD_FOCUS_ATTRIBUTE)
    ).toBe(false);

    await act(async () => {
        button.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Tab", bubbles: true })
        );
    });
    expect(
        document.documentElement.getAttribute(DESKTOP_KEYBOARD_FOCUS_ATTRIBUTE)
    ).toBe("true");

    // Un nouveau geste souris reprend la modalite et retire l'anneau clavier.
    await act(async () => {
        button.dispatchEvent(
            new MouseEvent("pointerdown", { bubbles: true, button: 0 })
        );
    });
    expect(
        document.documentElement.hasAttribute(DESKTOP_KEYBOARD_FOCUS_ATTRIBUTE)
    ).toBe(false);
});

test("le CSS masque l'anneau WebView2 hors navigation Tab et le conserve pour Tab", () => {
    const css = fs
        .readFileSync(
            path.join(__dirname, "DesktopFocusVisibility.css"),
            "utf8"
        )
        .replace(/\s+/g, " ");

    expect(css).toContain(
        'html:not([data-nc-keyboard-focus="true"]) .nc-desktop-window-shell .nc-desktop-titlebar button:focus-visible { outline: none !important; box-shadow: none !important; }'
    );
    expect(css).toContain(
        'html[data-nc-keyboard-focus="true"] .nc-desktop-window-shell .nc-app-menu-trigger:focus-visible { outline: 1px solid var(--nc-toolbar-focus); outline-offset: -1px; }'
    );
});
