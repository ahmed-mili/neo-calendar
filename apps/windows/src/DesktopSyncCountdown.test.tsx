/** @jest-environment jsdom */
import React from "react";

jest.mock("@tauri-apps/api/core", () => ({ invoke: jest.fn() }), {
    virtual: true,
});

import { PairingBody } from "./DesktopSyncPage";
import { applyLanguage } from "../../../src/ui/i18n";

describe("PairingBody : barre et copie", () => {
    it("la barre se remplit en refreshInMs et repart à chaque nouveau QR, sans texte de décompte", () => {
        const { act } = require("react-dom/test-utils");
        const ReactDOM = require("react-dom");
        applyLanguage("fr");
        const host = document.createElement("div");
        const draw = (qrSvg: string, refreshInMs: number) =>
            act(() => {
                ReactDOM.render(
                    <PairingBody
                        pairing={{ qrSvg, myId: "A-B", refreshInMs }}
                        id="A-B"
                        copy={async () => true}
                    />,
                    host
                );
            });
        draw("<svg>1</svg>", 2000);
        const fill = () =>
            host.querySelector(".nc-sync-timer__bar > span") as HTMLElement;
        const first = fill();
        expect(first.style.animationDuration).toBe("2000ms");
        expect(host.textContent).not.toContain("Nouveau QR code");
        draw("<svg>2</svg>", 3000);
        expect(fill()).not.toBe(first);
        expect(fill().style.animationDuration).toBe("3000ms");
        act(() => {
            ReactDOM.unmountComponentAtNode(host);
        });
    });

    it("la coche dure 1,5 s, et un second clic pendant la coche relance les 1,5 s", async () => {
        const { act } = require("react-dom/test-utils");
        const ReactDOM = require("react-dom");
        jest.useFakeTimers();
        applyLanguage("fr");
        const host = document.createElement("div");
        document.body.appendChild(host);
        act(() => {
            ReactDOM.render(
                <PairingBody
                    pairing={{
                        qrSvg: "<svg/>",
                        myId: "A-B",
                        refreshInMs: 2000,
                    }}
                    id="A-B"
                    copy={async () => true}
                />,
                host
            );
        });
        const button = () =>
            host.querySelector(".nc-sync-code__copy") as HTMLButtonElement;
        const click = async () => {
            await act(async () => {
                button().click();
            });
        };
        expect(button().dataset.copied).toBeUndefined();
        await click();
        expect(button().dataset.copied).toBe("1");
        act(() => {
            jest.advanceTimersByTime(1000);
        });
        await click();
        act(() => {
            jest.advanceTimersByTime(1000);
        });
        expect(button().dataset.copied).toBe("1");
        act(() => {
            jest.advanceTimersByTime(600);
        });
        expect(button().dataset.copied).toBeUndefined();
        act(() => {
            ReactDOM.unmountComponentAtNode(host);
        });
        host.remove();
        jest.useRealTimers();
    });
});
