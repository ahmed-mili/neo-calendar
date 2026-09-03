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

    /*
     * `renderCalendars()` backs the Calendars page on both platforms — the
     * `isAndroid` split only changes the surrounding chrome (a full page vs.
     * a dialog taken over the screen), never this group's own content — so
     * one render of it proves the wording for both.
     */
    it("exposes the default ICS refresh frequency, without an apply-all action when no link exists yet", () => {
        const html = renderToStaticMarkup(
            <DesktopSettings open initialTab="calendars" {...commonProps} />
        );

        expect(html).toContain("Fréquence d&#x27;actualisation ICS par défaut");
        expect(html).toContain("1 h");
        expect(html).not.toContain("Appliquer à tous les liens");
    });

    it("offers the confirmed apply-all action once an ICS link exists", () => {
        const html = renderToStaticMarkup(
            <DesktopSettings
                open
                initialTab="calendars"
                {...commonProps}
                preferences={{
                    ...commonProps.preferences,
                    icsFeeds: [
                        {
                            id: "feed-1",
                            calendarPath: "Cours",
                            name: "Emploi du temps",
                            url: "https://example.test/calendar.ics",
                            refreshMinutes: 15,
                            active: true,
                        },
                    ],
                }}
            />
        );

        expect(html).toContain("Appliquer à tous les liens");
    });
});

/*
 * Le mode de trajet des liens de lieu.
 *
 * Suivre le lieu d'un cours ouvre un itinéraire depuis la position du
 * téléphone ; comment on compte s'y rendre ne se devine pas, et se règle donc
 * une fois pour toutes. La rangée dit la valeur en clair plutôt que de la
 * cacher derrière son libellé : c'est ce qui distingue un réglage qu'on a
 * choisi d'un réglage qu'on subit.
 */
describe("le mode de trajet des liens de lieu", () => {
    afterEach(() => applyLanguage("fr"));

    it("leaves the choice to Maps at rest", () => {
        const html = renderToStaticMarkup(
            <DesktopSettings open {...commonProps} />
        );

        expect(html).toContain("Mode de trajet");
        expect(html).toContain("Automatique");
    });

    it("shows the mode that was chosen", () => {
        const html = renderToStaticMarkup(
            <DesktopSettings
                open
                {...commonProps}
                preferences={{
                    ...commonProps.preferences,
                    mapsTravelMode: "transit",
                }}
            />
        );

        expect(html).toContain("Transports en commun");
    });
});

/*
 * Par quelle application le lieu s'ouvre.
 *
 * Le menu est le repos : entre un cours en métro et un rendez-vous en voiture,
 * l'application qui convient change. Le réglage est là pour celui qui a
 * tranché une fois pour toutes et ne veut plus voir le menu.
 */
describe("l'application de cartes", () => {
    afterEach(() => applyLanguage("fr"));

    it("asks each time at rest", () => {
        const html = renderToStaticMarkup(
            <DesktopSettings open {...commonProps} />
        );

        expect(html).toContain("Application de cartes");
        expect(html).toContain("Demander à chaque fois");
    });

    it("shows the app that was chosen", () => {
        const html = renderToStaticMarkup(
            <DesktopSettings
                open
                {...commonProps}
                preferences={{
                    ...commonProps.preferences,
                    mapsApp: "citymapper",
                }}
            />
        );

        expect(html).toContain("Citymapper");
    });
});
