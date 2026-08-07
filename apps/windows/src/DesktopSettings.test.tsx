import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import DesktopSettings from "./DesktopSettings";
import { defaultDesktopWorkspacePreferences } from "./platform/desktopWorkspacePreferences";

const commonProps = {
    dataFolder: String.raw`C:\Calendar data`,
    vaultFolders: [] as string[],
    detectedVaults: [],
    disabledVaults: [] as string[],
    themeId: "catppuccin-mocha" as const,
    preferences: defaultDesktopWorkspacePreferences(),
    calendars: [],
    onThemeChange: async () => {},
    onPreferencesChange: async () => {},
    onClose: () => {},
    onChangeDataFolder: async () => {},
    onOpenDataFolder: async () => {},
    onAddVaultFolder: async () => {},
    onRemoveVaultFolder: async () => {},
    onSetVaultEnabled: async () => {},
    onAddCalendar: () => {},
    onRenameCalendar: async () => {},
    onDeleteCalendar: async () => {},
    onToggleCalendar: () => {},
    onSetDefaultCalendar: () => {},
    onCalendarColorChange: () => {},
};

describe("Windows settings", () => {
    it("renders nothing while settings are closed", () => {
        const html = renderToStaticMarkup(
            <DesktopSettings open={false} {...commonProps} />
        );

        expect(html).toBe("");
    });

    it("keeps synchronization guidance inside the Sync tab", () => {
        const html = renderToStaticMarkup(
            <DesktopSettings open initialTab="sync" {...commonProps} />
        );

        expect(html).toContain('data-settings-tab="sync"');
        expect(html).toContain("Syncthing");
        expect(html).toContain("Recommandé");
        expect(html).toContain("OneDrive");
        expect(html).toContain("Google Drive");
        expect(html).toContain("Dropbox");
        expect(html).toContain("C:\\Calendar data");
    });

    it("shows calendar preferences and calendar management", () => {
        const general = renderToStaticMarkup(
            <DesktopSettings open initialTab="general" {...commonProps} />
        );
        const calendars = renderToStaticMarkup(
            <DesktopSettings open initialTab="calendars" {...commonProps} />
        );

        expect(general).toContain("Préférences du calendrier");
        expect(general).toContain("Fuseaux horaires secondaires");
        expect(calendars).toContain("Gérer les calendriers");
        expect(calendars).toContain("Full note");
    });
});
