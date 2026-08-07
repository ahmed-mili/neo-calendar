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

    it("keeps synchronization guidance on the sync page", () => {
        const html = renderToStaticMarkup(
            <DesktopSettings open initialTab="sync" {...commonProps} />
        );

        expect(html).toContain('data-settings-page="sync"');
        expect(html).toContain("Syncthing");
        expect(html).toContain("Recommandé");
        expect(html).toContain("OneDrive");
        expect(html).toContain("Google Drive");
        expect(html).toContain("Dropbox");
    });

    // A section opened from the outside sits on top of the first page, so the
    // arrow leads to the settings rather than straight out of them.
    it("keeps the first page under a section opened directly", () => {
        const html = renderToStaticMarkup(
            <DesktopSettings open initialTab="sync" {...commonProps} />
        );

        expect(html).toContain("nc-settings__page--buried");
        expect(html).toContain("Vue du calendrier");
    });

    it("lists every subject on its first page", () => {
        const general = renderToStaticMarkup(
            <DesktopSettings open initialTab="general" {...commonProps} />
        );

        expect(general).toContain("Vue du calendrier");
        expect(general).toContain("Vue initiale sur téléphone");
        expect(general).toContain("Fuseaux horaires");
        expect(general).toContain("Calendriers");
        expect(general).toContain("Synchronisation");
        expect(general).not.toContain("nc-settings__tabs");
    });

    it("opens the settings on their first page, titled and with a way back", () => {
        const html = renderToStaticMarkup(
            <DesktopSettings open {...commonProps} />
        );

        expect(html).toContain("Paramètres");
        expect(html).toContain("nc-settings__back");
        expect(html).toContain('aria-label="Fermer les paramètres"');
        expect(html).not.toContain("nc-settings__close");
    });

    it("shows calendar management behind its own page", () => {
        const calendars = renderToStaticMarkup(
            <DesktopSettings open initialTab="calendars" {...commonProps} />
        );

        expect(calendars).toContain("Ajouter un calendrier");
        expect(calendars).toContain('data-settings-page="calendars"');
    });

    it("names the data folder by its folder rather than its whole path", () => {
        const html = renderToStaticMarkup(
            <DesktopSettings open {...commonProps} />
        );

        expect(html).toContain("Calendar data");
    });
});
