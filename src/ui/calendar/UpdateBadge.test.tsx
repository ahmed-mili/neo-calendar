/** @jest-environment jsdom */
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import {
    UPDATE_INSTALL_ERROR_EVENT,
    UpdateInstallErrorDetail,
    noteDownloadedUpdate,
} from "./appUpdates";
import { UpdateBadge } from "./UpdateBadge";
import { applyLanguage } from "../i18n";

function nativeClick(target: Element): void {
    act(() => {
        target.dispatchEvent(
            new MouseEvent("click", {
                bubbles: true,
                cancelable: true,
                button: 0,
            })
        );
    });
}

function reportInstallFailure(message: string): void {
    act(() => {
        window.dispatchEvent(
            new CustomEvent<UpdateInstallErrorDetail>(
                UPDATE_INSTALL_ERROR_EVENT,
                { detail: { message } }
            )
        );
    });
}

describe("integrated update installation", () => {
    let host: HTMLDivElement;

    beforeEach(() => {
        applyLanguage("fr");
        document.body.classList.remove("nc-platform-android");
        act(() => noteDownloadedUpdate(""));
        host = document.createElement("div");
        document.body.appendChild(host);
    });

    afterEach(() => {
        act(() => ReactDOM.unmountComponentAtNode(host));
        act(() => noteDownloadedUpdate(""));
        document.body.classList.remove("nc-platform-android");
        document.body.innerHTML = "";
    });

    it("keeps the Windows install inside Neo Calendar until the updater takes over", () => {
        const onInstall = jest.fn();
        act(() => ReactDOM.render(<UpdateBadge onInstall={onInstall} />, host));
        act(() => noteDownloadedUpdate("1.54.0"));

        const updateButton = host.querySelector(
            ".nc-update-control"
        ) as HTMLButtonElement;
        expect(updateButton).toBeTruthy();
        expect(updateButton.disabled).toBe(false);

        nativeClick(updateButton);

        expect(onInstall).toHaveBeenCalledTimes(1);
        const dialog = document.body.querySelector(
            ".nc-update-install-dialog"
        ) as HTMLElement;
        expect(dialog).toBeTruthy();
        expect(dialog.getAttribute("role")).toBe("dialog");
        expect(dialog.getAttribute("aria-modal")).toBe("true");
        expect(dialog.textContent).toContain("Mise à jour de Neo Calendar");
        expect(dialog.textContent).toContain("v1.54.0");
        expect(dialog.textContent).toContain("Installation de la mise à jour");
        expect(dialog.textContent).toContain("Redémarrage");
        expect(dialog.querySelector('[role="progressbar"]')).toBeTruthy();

        reportInstallFailure("installer launch failed");
        expect(dialog.textContent).toContain(
            "La mise à jour n’a pas pu être installée."
        );
        expect(dialog.textContent).toContain("installer launch failed");

        const retry = Array.from(dialog.querySelectorAll("button")).find(
            (button) => button.textContent === "Réessayer"
        );
        expect(retry).toBeTruthy();
        nativeClick(retry!);
        expect(onInstall).toHaveBeenCalledTimes(2);
        expect(dialog.textContent).toContain("Installation de la mise à jour");

        reportInstallFailure("still failed");
        const close = Array.from(dialog.querySelectorAll("button")).find(
            (button) => button.textContent === "Fermer"
        );
        expect(close).toBeTruthy();
        nativeClick(close!);
        expect(
            document.body.querySelector(".nc-update-install-dialog")
        ).toBeNull();
    });

    it("leaves Android on the native package-installer path", () => {
        document.body.classList.add("nc-platform-android");
        const onInstall = jest.fn();
        act(() => ReactDOM.render(<UpdateBadge onInstall={onInstall} />, host));
        act(() => noteDownloadedUpdate("1.54.0"));

        const updateButton = host.querySelector(
            ".nc-update-control"
        ) as HTMLButtonElement;
        nativeClick(updateButton);

        expect(onInstall).toHaveBeenCalledTimes(1);
        expect(
            document.body.querySelector(".nc-update-install-dialog")
        ).toBeNull();
    });
});
