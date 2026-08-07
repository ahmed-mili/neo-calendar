import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import App from "./App";
import { useDesktopBridge } from "./platform/useDesktopBridge";

jest.mock("./platform/useDesktopBridge", () => ({
    useDesktopBridge: jest.fn(),
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
        expect(html).toContain("Choose your Neo Calendar data folder.");
        expect(html).toContain("Choose data folder");
        expect(html).not.toContain(syncProductName);
        expect(html).not.toContain("mock event");
    });

    it("waits for the stored settings instead of flashing the welcome screen", () => {
        mockUseDesktopBridge.mockReturnValue({
            ...bridgeDefaults,
            preferences: null,
        });

        const html = renderToStaticMarkup(<App />);

        expect(html).not.toContain("Choose data folder");
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
        expect(html).not.toContain("Choose data folder");
    });

    it("shows the task route received from Obsidian", () => {
        mockUseDesktopBridge.mockReturnValue({
            ...bridgeDefaults,
            preferences: { dataFolder: null, themeId: "catppuccin-mocha" },
            route: { type: "task", taskId: "test@task" },
        });

        const html = renderToStaticMarkup(<App />);

        expect(html).toContain("Opening task: test@task");
    });
});
