import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import App from "./App";
import { useDesktopBridge } from "./platform/useDesktopBridge";

jest.mock("./platform/useDesktopBridge", () => ({
    useDesktopBridge: jest.fn(),
}));
/*
 * `desktopUpdates` parle au pont natif par `@tauri-apps/api`, qui n'est
 * installé que dans apps/windows : les tests tournent depuis la racine, où
 * `npm ci` ne descend pas, et le module manquant ferait tomber la suite
 * entière avant le premier rendu. Il est remplacé ici comme le pont juste
 * au-dessus — la coque n'est pas ce que ce fichier examine.
 */
jest.mock("./platform/desktopUpdates", () => ({
    watchDesktopUpdates: () => Promise.resolve(() => {}),
}));
jest.mock("./DesktopCalendar", () => ({
    __esModule: true,
    default: () =>
        require("react").createElement("section", { "data-view": "week" }),
}));

const mockUseDesktopBridge = useDesktopBridge as jest.MockedFunction<
    typeof useDesktopBridge
>;

const bridgeDefaults = {
    chooseDataFolder: jest.fn(),
    detectedVaults: [],
    enabledVaults: [],
    chooseVaultFolder: jest.fn(),
    removeVaultFolder: jest.fn(),
    setVaultEnabled: jest.fn(),
    setTheme: jest.fn(),
    error: null,
    isChoosingFolder: false,
    isChoosingVaultFolder: false,
    isScanningVaults: false,
    route: null,
};

describe("Windows application shell", () => {
    beforeEach(() => {
        mockUseDesktopBridge.mockReturnValue({
            ...bridgeDefaults,
            preferences: { dataFolder: null, themeId: "catppuccin-mocha" },
        });
    });

    it("guides the user to choose the Neo Calendar data folder", () => {
        const html = renderToStaticMarkup(<App />);
        const syncProductName = ["Sync", "thing"].join("");

        expect(html).toContain("Neo Calendar");
        expect(html).toContain(
            "Choisissez le dossier de données de Neo Calendar."
        );
        expect(html).toContain("Choisir le dossier");
        expect(html).not.toContain(syncProductName);
        expect(html).not.toContain("mock event");
    });

    it("waits for the stored settings instead of flashing the welcome screen", () => {
        mockUseDesktopBridge.mockReturnValue({
            ...bridgeDefaults,
            preferences: null,
        });

        const html = renderToStaticMarkup(<App />);

        expect(html).not.toContain("Choisir le dossier");
        expect(html).toContain('aria-busy="true"');
    });

    it("opens the week view when a data folder is configured", () => {
        mockUseDesktopBridge.mockReturnValue({
            ...bridgeDefaults,
            preferences: {
                dataFolder: "C:\\Calendar data",
                themeId: "catppuccin-mocha",
            },
        });

        const html = renderToStaticMarkup(<App />);

        expect(html).toContain('data-view="week"');
        expect(html).not.toContain("Choisir le dossier");
    });

    it("shows the task route received from Obsidian", () => {
        mockUseDesktopBridge.mockReturnValue({
            ...bridgeDefaults,
            preferences: { dataFolder: null, themeId: "catppuccin-mocha" },
            route: { type: "task", taskId: "test@task" },
        });

        const html = renderToStaticMarkup(<App />);

        expect(html).toContain("Ouverture de la tâche : test@task");
    });
});
