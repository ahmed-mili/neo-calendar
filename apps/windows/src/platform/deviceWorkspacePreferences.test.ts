import {
    defaultDesktopWorkspacePreferences,
    deviceWorkspacePreferences,
    parseDeviceWorkspacePreferences,
    sharedWorkspacePreferences,
    withDeviceWorkspacePreferences,
} from "./desktopWorkspacePreferences";

describe("splitting device-only preferences out of the shared file", () => {
    // Changing view, day count or the sidebar rewrote the whole shared file,
    // colours included. Two devices doing that all day is what gave Syncthing
    // something to conflict over in the first place.
    it("leaves the volatile display settings out of the shared half", () => {
        const shared = sharedWorkspacePreferences({
            ...defaultDesktopWorkspacePreferences(),
            viewType: "month",
            dayCount: 9,
            sidebarVisible: false,
            allDayCollapsed: true,
        }) as Record<string, unknown>;

        expect(shared.viewType).toBeUndefined();
        expect(shared.dayCount).toBeUndefined();
        expect(shared.sidebarVisible).toBeUndefined();
        expect(shared.allDayCollapsed).toBeUndefined();
    });

    it("keeps the colours in the shared half", () => {
        const shared = sharedWorkspacePreferences({
            ...defaultDesktopWorkspacePreferences(),
            colors: { Musculation: "#ff4000" },
            order: ["Musculation"],
        });

        expect(shared.colors).toEqual({ Musculation: "#ff4000" });
        expect(shared.order).toEqual(["Musculation"]);
    });

    it("carries exactly the volatile settings in the device half", () => {
        const device = deviceWorkspacePreferences({
            ...defaultDesktopWorkspacePreferences(),
            viewType: "month",
            dayCount: 9,
            sidebarVisible: false,
            allDayCollapsed: true,
        });

        expect(device).toEqual({
            viewType: "month",
            dayCount: 9,
            sidebarVisible: false,
            allDayCollapsed: true,
        });
    });

    it("puts a split pair back together unchanged", () => {
        const original = {
            ...defaultDesktopWorkspacePreferences(),
            colors: { Études: "#3264ff" },
            viewType: "month" as const,
            dayCount: 9,
            sidebarVisible: false,
            allDayCollapsed: true,
        };

        const restored = withDeviceWorkspacePreferences(
            {
                ...defaultDesktopWorkspacePreferences(),
                colors: original.colors,
            },
            deviceWorkspacePreferences(original)
        );

        expect(restored).toEqual(original);
    });

    it("falls back to the defaults when this device has no stored view yet", () => {
        const defaults = defaultDesktopWorkspacePreferences();

        const restored = withDeviceWorkspacePreferences(
            defaults,
            parseDeviceWorkspacePreferences(null)
        );

        expect(restored.viewType).toBe(defaults.viewType);
        expect(restored.dayCount).toBe(defaults.dayCount);
    });

    it("ignores a stored view type it does not recognise", () => {
        const parsed = parseDeviceWorkspacePreferences({
            viewType: "hologram",
            dayCount: 3,
        });

        expect(parsed.viewType).toBeUndefined();
        expect(parsed.dayCount).toBe(3);
    });
});
