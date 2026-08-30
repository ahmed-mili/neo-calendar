import { normalizeDesktopPreferences } from "./preferences";
import {
    defaultDesktopWorkspacePreferences,
    parseDesktopWorkspacePreferences,
} from "./desktopWorkspacePreferences";

describe("normalizeDesktopPreferences", () => {
    it("uses safe defaults for missing settings", () => {
        expect(normalizeDesktopPreferences(null)).toEqual({
            dataFolder: null,
            themeId: "catppuccin-mocha",
            vaultFolders: [],
            disabledVaults: [],
        });
    });

    it("keeps a selected folder", () => {
        expect(
            normalizeDesktopPreferences({
                dataFolder: "C:\\Neo Calendar",
                themeId: "catppuccin-mocha",
            })
        ).toEqual({
            dataFolder: "C:\\Neo Calendar",
            themeId: "catppuccin-mocha",
            vaultFolders: [],
            disabledVaults: [],
        });
    });

    it("rejects blank folders and unknown themes", () => {
        expect(
            normalizeDesktopPreferences({
                dataFolder: "   ",
                themeId: "unknown",
            })
        ).toEqual({
            dataFolder: null,
            themeId: "catppuccin-mocha",
            vaultFolders: [],
            disabledVaults: [],
        });
    });

    it("keeps the vaults that were configured", () => {
        expect(
            normalizeDesktopPreferences({
                dataFolder: null,
                themeId: "catppuccin-mocha",
                vaultFolders: ["C:\\obsidian-vaults"],
                disabledVaults: ["C:\\obsidian-vaults\\Troubleshooting"],
            })
        ).toEqual({
            dataFolder: null,
            themeId: "catppuccin-mocha",
            vaultFolders: ["C:\\obsidian-vaults"],
            disabledVaults: ["C:\\obsidian-vaults\\Troubleshooting"],
        });
    });
});

describe("desktop workspace ICS migration", () => {
    it("migrates a safe legacy iCal source while retaining automatic calendars", () => {
        // Break caught: migration leaves iCal feeds in the old mixed collection
        // or drops automatic calendars from an existing workspace.
        const parsed = parseDesktopWorkspacePreferences({
            externalCalendars: [
                {
                    type: "ical",
                    id: "old",
                    name: "Cours",
                    url: "https://x.test/a.ics",
                    directory: "Études",
                    color: "#fff",
                },
                {
                    type: "auto",
                    id: "FR",
                    name: "Fêtes",
                    icon: "flag",
                    color: "#fff",
                    rules: [{ n: "Jour", k: "f", m: 1, d: 1 }],
                },
            ],
        });

        expect(parsed.icsFeeds[0].calendarPath).toBe("Études");
        expect(parsed.externalCalendars.map((source) => source.type)).toEqual([
            "auto",
        ]);
    });

    it("defaults the shared ICS refresh interval to one hour", () => {
        // Break caught: new workspaces would use a refresh value unsupported by
        // the shared subscription model.
        expect(
            defaultDesktopWorkspacePreferences().icsDefaultRefreshMinutes
        ).toBe(60);
    });
});
