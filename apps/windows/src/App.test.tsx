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

describe("Windows application shell", () => {
    beforeEach(() => {
        mockUseDesktopBridge.mockReturnValue({
            preferences: null,
            chooseDataFolder: jest.fn(),
            error: null,
            isChoosingFolder: false,
            route: null,
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

    it("opens the week view when a data folder is configured", () => {
        mockUseDesktopBridge.mockReturnValue({
            preferences: {
                dataFolder: "C:\\Calendar data",
                themeId: "catppuccin-mocha",
            },
            chooseDataFolder: jest.fn(),
            error: null,
            isChoosingFolder: false,
            route: null,
        });

        const html = renderToStaticMarkup(<App />);

        expect(html).toContain('data-view="week"');
        expect(html).not.toContain("Choose data folder");
    });

    it("shows the task route received from Obsidian", () => {
        mockUseDesktopBridge.mockReturnValue({
            preferences: null,
            chooseDataFolder: jest.fn(),
            error: null,
            isChoosingFolder: false,
            route: { type: "task", taskId: "test@task" },
        });

        const html = renderToStaticMarkup(<App />);

        expect(html).toContain("Opening task: test@task");
    });
});
