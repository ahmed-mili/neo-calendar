/** @jest-environment jsdom */
import React from "react";

jest.mock("@tauri-apps/api/core", () => ({ invoke: jest.fn() }), {
    virtual: true,
});

import { PairingBody } from "./DesktopSyncPage";
import { applyLanguage } from "../../../src/ui/i18n";

describe("PairingBody : décompte", () => {
    it("décompte à la seconde depuis refreshInMs et se recale à chaque nouveau QR", () => {
        const { act } = require("react-dom/test-utils");
        const ReactDOM = require("react-dom");
        jest.useFakeTimers();
        applyLanguage("fr");
        const host = document.createElement("div");
        const draw = (qrSvg: string) =>
            act(() => {
                ReactDOM.render(
                    <PairingBody
                        pairing={{ qrSvg, myId: "A-B", refreshInMs: 2000 }}
                        id="A-B"
                        deviceName={null}
                        copy={async () => true}
                    />,
                    host
                );
            });
        const text = () =>
            host.querySelector(".nc-sync-countdown")?.textContent;
        draw("<svg>1</svg>");
        expect(text()).toBe("Nouveau QR code dans 2 s");
        act(() => {
            jest.advanceTimersByTime(1250);
        });
        expect(text()).toBe("Nouveau QR code dans 1 s");
        draw("<svg>2</svg>");
        expect(text()).toBe("Nouveau QR code dans 2 s");
        act(() => {
            ReactDOM.unmountComponentAtNode(host);
        });
        jest.useRealTimers();
    });
});
