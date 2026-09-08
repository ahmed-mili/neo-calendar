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
    document.querySelectorAll("[data-test-portal-button]").forEach((element) =>
        element.remove()
    );
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

test("clic puis Shift reste en mode pointeur pour un bouton rendu par portal hors du shell", async () => {
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

    // EventPanel et plusieurs autres overlays Windows sont rendus directement
    // sous document.body. C'est precisement ce que l'ancien correctif limite a
    // .nc-desktop-titlebar ne couvrait pas.
    const portalButton = document.createElement("button");
    portalButton.type = "button";
    portalButton.className = "nc-panel-icon-btn";
    portalButton.dataset.testPortalButton = "true";
    portalButton.setAttribute("aria-label", "Close");
    document.body.append(portalButton);

    expect(portalButton.closest(".nc-desktop-window-shell")).toBeNull();

    await act(async () => {
        portalButton.dispatchEvent(
            new MouseEvent("pointerdown", { bubbles: true, button: 0 })
        );
        portalButton.focus();
    });
    expect(document.activeElement).toBe(portalButton);
    expect(
        document.documentElement.hasAttribute(DESKTOP_KEYBOARD_FOCUS_ATTRIBUTE)
    ).toBe(false);

    await act(async () => {
        portalButton.dispatchEvent(
            new KeyboardEvent("keydown", {
                key: "Shift",
                shiftKey: true,
                bubbles: true,
            })
        );
    });

    expect(document.activeElement).toBe(portalButton);
    expect(
        document.documentElement.hasAttribute(DESKTOP_KEYBOARD_FOCUS_ATTRIBUTE)
    ).toBe(false);
});

test("le CSS masque l'anneau WebView2 sur tous les boutons Windows hors navigation Tab", () => {
    const css = fs
        .readFileSync(
            path.join(__dirname, "DesktopFocusVisibility.css"),
            "utf8"
        )
        .replace(/\s+/g, " ");

    // Doit couvrir aussi les boutons rendus par portal sous body, donc ne doit
    // plus dependre de .nc-desktop-window-shell ni de .nc-desktop-titlebar.
    expect(css).toContain(
        'html:not([data-nc-keyboard-focus="true"]) body button:focus-visible { outline: none !important; }'
    );
    expect(css).not.toContain(
        'html:not([data-nc-keyboard-focus="true"]) .nc-desktop-window-shell .nc-desktop-titlebar button:focus-visible'
    );

    // Une vraie navigation Tab garde au contraire l'indicateur clavier voulu.
    expect(css).toContain(
        'html[data-nc-keyboard-focus="true"] .nc-desktop-window-shell .nc-app-menu-trigger:focus-visible { outline: 1px solid var(--nc-toolbar-focus); outline-offset: -1px; }'
    );
});
