import { normalizeDesktopPreferences } from "./preferences";
import {
    defaultDesktopWorkspacePreferences,
    parseDesktopWorkspacePreferences,
    prayerReminderMinutesFor,
    reconcileWorkspacePreferences,
} from "./desktopWorkspacePreferences";

describe("normalizeDesktopPreferences", () => {
    it("uses safe defaults for missing settings", () => {
        expect(normalizeDesktopPreferences(null)).toEqual({
            dataFolder: null,
            themeId: "catppuccin-mocha",
            vaultFolders: [],
            disabledVaults: [],
            startupDefaultApplied: false,
            trayHintSeen: false,
        });
    });

    /* Les deux drapeaux de la machine, qui ne voyagent pas avec les
       préférences partagées : sans eux, le démarrage automatique se
       réappliquerait à chaque lancement et la bulle se remontrerait sans
       fin. Tout ce qui n'est pas exactement `true` vaut « pas encore ». */
    it("only accepts a real true for the machine's own flags", () => {
        expect(
            normalizeDesktopPreferences({
                startupDefaultApplied: true,
                trayHintSeen: true,
            })
        ).toMatchObject({ startupDefaultApplied: true, trayHintSeen: true });

        expect(
            normalizeDesktopPreferences({
                startupDefaultApplied: "true",
                trayHintSeen: 1,
            })
        ).toMatchObject({ startupDefaultApplied: false, trayHintSeen: false });
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
            startupDefaultApplied: false,
            trayHintSeen: false,
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
            startupDefaultApplied: false,
            trayHintSeen: false,
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
            startupDefaultApplied: false,
            trayHintSeen: false,
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
 * Le rappel des prières d'un calendrier.
 *
 * Rien à voir avec le rappel de ses évènements : ici zéro veut dire « à
 * l'heure de la prière », qui est le cas ordinaire, et non « aucun ». Une
 * entrée absente vaut ce défaut-là, pas le silence.
 */
describe("a calendar's prayer reminder", () => {
    it("rings at the prayer itself until someone says otherwise", () => {
        expect(
            defaultDesktopWorkspacePreferences().prayerReminderMinutes
        ).toEqual({});
        expect(prayerReminderMinutesFor({}, "Islam")).toEqual([0]);
    });

    it("keeps zero, because it means at the prayer and not nothing", () => {
        expect(
            parseDesktopWorkspacePreferences({
                prayerReminderMinutes: { Islam: [10, 0, 10, 5] },
            }).prayerReminderMinutes
        ).toEqual({ Islam: [0, 5, 10] });
    });

    it("keeps an empty list, which is silence chosen on purpose", () => {
        const parsed = parseDesktopWorkspacePreferences({
            prayerReminderMinutes: { Islam: [] },
        });
        expect(parsed.prayerReminderMinutes).toEqual({ Islam: [] });
        expect(
            prayerReminderMinutesFor(parsed.prayerReminderMinutes, "Islam")
        ).toEqual([]);
    });

    it("drops an entry it cannot read rather than silencing the calendar", () => {
        expect(
            parseDesktopWorkspacePreferences({
                prayerReminderMinutes: {
                    a: "10",
                    b: [1.5],
                    c: [-5],
                    d: { minutes: 10 },
                    e: [15],
                },
            }).prayerReminderMinutes
        ).toEqual({ e: [15] });
    });

    it("lets the file win over what was already in hand, calendar by calendar", () => {
        const merged = reconcileWorkspacePreferences({
            previous: {
                ...defaultDesktopWorkspacePreferences(),
                prayerReminderMinutes: { ancien: [5], commun: [10] },
            },
            loaded: {
                ...defaultDesktopWorkspacePreferences(),
                prayerReminderMinutes: { commun: [0], nouveau: [15] },
            },
            fileExisted: true,
        });

        expect(merged.prayerReminderMinutes).toEqual({
            ancien: [5],
            commun: [0],
            nouveau: [15],
        });
    });
});

/*
 * Les séances de Jumu'a d'un calendrier, quand elles ne sont pas celles de la
 * mosquée suivie. Des heures « HH:MM » et rien d'autre ; l'appartenance à une
 * mosquée enregistrée se vérifie à l'usage, pas ici.
 */
describe("a calendar's own Jumu'a sessions", () => {
    it("are absent until someone picks some", () => {
        expect(defaultDesktopWorkspacePreferences().prayerJumua).toEqual({});
        expect(parseDesktopWorkspacePreferences({}).prayerJumua).toEqual({});
    });

    it("keeps clock times, sorted and without doubles", () => {
        expect(
            parseDesktopWorkspacePreferences({
                prayerJumua: { Islam: ["14:00", "13:00", "14:00"] },
            }).prayerJumua
        ).toEqual({ Islam: ["13:00", "14:00"] });
    });

    it("drops an entry that is not a list of clock times", () => {
        expect(
            parseDesktopWorkspacePreferences({
                prayerJumua: {
                    a: "13:00",
                    b: ["1pm"],
                    c: [],
                    d: ["13:00", 14],
                    e: ["13:45"],
                },
            }).prayerJumua
        ).toEqual({ e: ["13:45"] });
    });

    it("lets the file win over what was already in hand, calendar by calendar", () => {
        const merged = reconcileWorkspacePreferences({
            previous: {
                ...defaultDesktopWorkspacePreferences(),
                prayerJumua: { ancien: ["13:00"], commun: ["13:00"] },
            },
            loaded: {
                ...defaultDesktopWorkspacePreferences(),
                prayerJumua: { commun: ["13:30"], nouveau: ["14:00"] },
            },
            fileExisted: true,
        });

        expect(merged.prayerJumua).toEqual({
            ancien: ["13:00"],
            commun: ["13:30"],
            nouveau: ["14:00"],
        });
    });
});

/*
 * Le rappel par défaut d'un calendrier.
 *
 * Celui des Paramètres vaut pour tous les calendriers : une entrée n'est
 * écrite que pour le calendrier qui s'en écarte. Absente veut donc dire
 * « celui de l'application », et non « aucun rappel » — faute de quoi changer
 * le réglage général ne déplacerait plus rien.
 */
describe("a calendar's own reminder", () => {
    it("is absent until someone sets one", () => {
        expect(
            defaultDesktopWorkspacePreferences().calendarReminderMinutes
        ).toEqual({});
        expect(
            parseDesktopWorkspacePreferences({}).calendarReminderMinutes
        ).toEqual({});
    });

    it("keeps a delay written for a calendar, custom values included", () => {
        expect(
            parseDesktopWorkspacePreferences({
                calendarReminderMinutes: { Cours: [45, 5], Islam: [] },
            }).calendarReminderMinutes
        ).toEqual({ Cours: [5, 45], Islam: [] });
    });

    it("relit un nombre seul, ecrit par la 1.75.0, comme une liste d'un", () => {
        expect(
            parseDesktopWorkspacePreferences({
                calendarReminderMinutes: { Cours: 45, Islam: 0 },
            }).calendarReminderMinutes
        ).toEqual({ Cours: [45], Islam: [] });
    });

    it("refuses anything that is not a whole number of minutes in range", () => {
        // Un fichier de préférences s'édite à la main : un texte, un négatif,
        // une fraction ou un délai de plus de quatre semaines n'y ont rien à
        // faire, et une entrée illisible doit retomber sur le réglage général
        // plutôt que d'éteindre les rappels de ce calendrier.
        expect(
            parseDesktopWorkspacePreferences({
                calendarReminderMinutes: {
                    a: "30",
                    b: -5,
                    c: 12.5,
                    d: [40321],
                    e: [40320, 40320],
                    f: [10, "x"],
                },
            }).calendarReminderMinutes
        ).toEqual({ e: [40320] });
    });

    it("lets the file win over what was already in hand, calendar by calendar", () => {
        const merged = reconcileWorkspacePreferences({
            previous: {
                ...defaultDesktopWorkspacePreferences(),
                calendarReminderMinutes: { ancien: [5], commun: [10] },
            },
            loaded: {
                ...defaultDesktopWorkspacePreferences(),
                calendarReminderMinutes: { commun: [30], nouveau: [45] },
            },
            fileExisted: true,
        });

        expect(merged.calendarReminderMinutes).toEqual({
            ancien: [5],
            commun: [30],
            nouveau: [45],
        });
    });
});

/*
 * Le réglage général des Paramètres.
 *
 * Il ne se choisissait que dans une liste de six valeurs, et rien d'autre ne
 * survivait à une relecture du fichier. Une durée personnalisée se règle
 * maintenant calendrier par calendrier comme pour toute l'application : la
 * validation est donc la même des deux côtés, un nombre entier de minutes.
 */
describe("the app-wide reminder", () => {
    it("keeps a list of delays, sorted and without twins", () => {
        expect(
            parseDesktopWorkspacePreferences({ reminderMinutes: [60, 45, 45] })
                .reminderMinutes
        ).toEqual([45, 60]);
    });

    /* Un nombre seul est ce qu'écrivaient les versions d'avant la 1.79.0 ;
       zéro y voulait dire « aucun rappel ». */
    it("reads the single number the older versions wrote", () => {
        expect(
            parseDesktopWorkspacePreferences({ reminderMinutes: 45 })
                .reminderMinutes
        ).toEqual([45]);
        expect(
            parseDesktopWorkspacePreferences({ reminderMinutes: 0 })
                .reminderMinutes
        ).toEqual([]);
    });

    it("falls back to the default for a value it could never have written", () => {
        const fallback = defaultDesktopWorkspacePreferences().reminderMinutes;
        for (const reminderMinutes of ["30", -5, 12.5, 40321, [5, "x"]]) {
            expect(
                parseDesktopWorkspacePreferences({ reminderMinutes })
                    .reminderMinutes
            ).toEqual(fallback);
        }
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
