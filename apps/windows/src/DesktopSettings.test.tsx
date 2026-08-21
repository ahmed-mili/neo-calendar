import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

/*
 * Virtuel : `@tauri-apps/api` n'est installé que dans apps/windows, et les
 * tests tournent depuis la racine, où `npm ci` ne descend pas. Les paramètres
 * atteignent le pont natif depuis que le sélecteur de fonds d'écran ouvre la
 * source d'une photo — un lien que la WebView Android n'ouvre pas seule. Le
 * mock répond donc à la place du module plutôt qu'au-dessus de lui.
 */
jest.mock("@tauri-apps/api/core", () => ({ invoke: jest.fn() }), {
    virtual: true,
});

import DesktopSettings from "./DesktopSettings";
import { defaultDesktopWorkspacePreferences } from "./platform/desktopWorkspacePreferences";
import { applyLanguage } from "../../../src/ui/i18n";

const commonProps = {
    dataFolder: String.raw`C:\Calendar data`,
    vaultFolders: [] as string[],
    detectedVaults: [],
    disabledVaults: [] as string[],
    themeId: "catppuccin-mocha" as const,
    preferences: defaultDesktopWorkspacePreferences(),
    calendars: [],
    misfiledEventCount: 0,
    onConvertMisfiledEvents: async () => 0,
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
    afterEach(() => applyLanguage("fr"));

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

    it("marks a section opened directly in the desktop navigation", () => {
        const html = renderToStaticMarkup(
            <DesktopSettings open initialTab="calendars" {...commonProps} />
        );

        expect(html).toContain("nc-settings--desktop");
        expect(html).toContain('aria-current="page"');
        expect(html).toContain("Synchronisation");
        expect(html).toContain("Rechercher dans les paramètres");
    });

    it("shows a short section in the desktop content area", () => {
        const html = renderToStaticMarkup(
            <DesktopSettings open initialTab="sync" {...commonProps} />
        );

        expect(html).toContain("nc-settings__desktop-page");
        expect(html).toContain("Syncthing");
        expect(html).not.toContain("nc-choice-dialog");
        expect(html).not.toContain("nc-settings__page--buried");
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

    it("opens the desktop settings with a sidebar and a close button", () => {
        const html = renderToStaticMarkup(
            <DesktopSettings open {...commonProps} />
        );

        expect(html).toContain("Général");
        expect(html).toContain("nc-settings__desktop-shell");
        expect(html).toContain("nc-settings__close");
        expect(html).toContain('aria-label="Fermer les paramètres"');
        expect(html).not.toContain("nc-settings__back");
    });

    it("translates the desktop navigation when English is selected", () => {
        applyLanguage("en");

        const html = renderToStaticMarkup(
            <DesktopSettings open {...commonProps} />
        );

        expect(html).toContain('placeholder="Search"');
        expect(html).toContain("General");
        expect(html).toContain("Data and integrations");
        expect(html).not.toContain("Données et intégrations");
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
            <DesktopSettings open initialTab="folder" {...commonProps} />
        );

        expect(html).toContain("Calendar data");
    });
});
