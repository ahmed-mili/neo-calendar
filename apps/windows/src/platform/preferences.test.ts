import { normalizeDesktopPreferences } from "./preferences";
import {
    defaultDesktopWorkspacePreferences,
    parseDesktopWorkspacePreferences,
    reconcileWorkspacePreferences,
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

/*
 * La couleur des traits de prière, par calendrier.
 *
 * Elle suivait la couleur du calendrier sans qu'on puisse en décider : un vert
 * foncé lisible dans une pastille se perd en trait de deux pixels sur un fond
 * d'écran. C'est donc un réglage à part, rangé là où se choisit la mosquée, et
 * absent tant que personne n'y a touché — auquel cas la couleur du calendrier
 * reste la réponse.
 */
describe("the colour of a calendar's prayer lines", () => {
    it("is absent until someone sets one", () => {
        expect(defaultDesktopWorkspacePreferences().prayerColors).toEqual({});
        expect(parseDesktopWorkspacePreferences({}).prayerColors).toEqual({});
    });

    it("keeps a colour written for a calendar", () => {
        expect(
            parseDesktopWorkspacePreferences({
                prayerColors: { الْإِسْلَامُ: "#45d97a" },
            }).prayerColors
        ).toEqual({ الْإِسْلَامُ: "#45d97a" });
    });

    it("refuses anything that is not a written-out hex colour", () => {
        // Un fichier de préférences s'édite à la main, et cette valeur part
        // droit dans une propriété CSS : « red », « var(--x) » ou un objet n'y
        // ont rien à faire, et une forme courte ne se compare pas au reste.
        expect(
            parseDesktopWorkspacePreferences({
                prayerColors: {
                    a: "red",
                    b: "#fff",
                    c: "var(--nc-today)",
                    d: 12,
                    e: "#12345g",
                    f: "#0a0A0a",
                },
            }).prayerColors
        ).toEqual({ f: "#0a0A0a" });
    });

    it("lets the file win over what was already in hand, calendar by calendar", () => {
        // Même règle que les couleurs de calendrier et le choix de la mosquée :
        // le téléphone ne doit pas effacer ce que l'ordinateur vient de régler
        // pour un autre calendrier.
        const merged = reconcileWorkspacePreferences({
            previous: {
                ...defaultDesktopWorkspacePreferences(),
                prayerColors: { ancien: "#111111", commun: "#222222" },
            },
            loaded: {
                ...defaultDesktopWorkspacePreferences(),
                prayerColors: { commun: "#333333", nouveau: "#444444" },
            },
            fileExisted: true,
        });

        expect(merged.prayerColors).toEqual({
            ancien: "#111111",
            commun: "#333333",
            nouveau: "#444444",
        });
    });
});

/*
 * Le mode de trajet des liens de lieu.
 *
 * Le lieu d'un évènement ouvre un itinéraire depuis la position de l'appareil ;
 * reste à dire comment on compte s'y rendre. La carte sait déjà proposer le
 * mode le plus vraisemblable, alors le repos est de la laisser faire : le
 * réglage n'existe que pour celui qui prend toujours le métro et ne veut pas
 * le redire à chaque cours.
 */
describe("the travel mode of a location link", () => {
    it("leaves the choice to Maps until someone makes one", () => {
        expect(defaultDesktopWorkspacePreferences().mapsTravelMode).toBe(
            "auto"
        );
        expect(parseDesktopWorkspacePreferences({}).mapsTravelMode).toBe(
            "auto"
        );
    });

    it("keeps a mode that was chosen", () => {
        expect(
            parseDesktopWorkspacePreferences({ mapsTravelMode: "transit" })
                .mapsTravelMode
        ).toBe("transit");
    });

    it("refuses a mode Google Maps would silently ignore", () => {
        // Un fichier de préférences s'édite à la main, et cette valeur part
        // telle quelle dans l'URL : « métro » ou « TRANSIT » n'y ouvriraient
        // rien de ce qu'on croit avoir demandé.
        for (const written of ["métro", "TRANSIT", "flying", 3, null]) {
            expect(
                parseDesktopWorkspacePreferences({ mapsTravelMode: written })
                    .mapsTravelMode
            ).toBe("auto");
        }
    });
});

/*
 * Par quelle application le lieu s'ouvre.
 *
 * Le repos est le menu : entre le métro et la voiture, l'application qui
 * convient change d'un cours à l'autre, et rien ne dit qu'un choix fait une
 * fois vaut pour tous les suivants. Le réglage est là pour qui a tranché.
 */
describe("the app a location opens in", () => {
    it("asks each time until someone settles it", () => {
        expect(defaultDesktopWorkspacePreferences().mapsApp).toBe("ask");
        expect(parseDesktopWorkspacePreferences({}).mapsApp).toBe("ask");
    });

    it("keeps the app that was chosen", () => {
        expect(
            parseDesktopWorkspacePreferences({ mapsApp: "citymapper" }).mapsApp
        ).toBe("citymapper");
    });

    it("falls back to the menu for an app it does not know", () => {
        for (const written of ["ratp", "Citymapper", "plans", 2, null]) {
            expect(
                parseDesktopWorkspacePreferences({ mapsApp: written }).mapsApp
            ).toBe("ask");
        }
    });
});
