import {
    migrateLegacyIcalSources,
    normalizeIcsUrl,
    parseIcsFeeds,
} from "./icsFeedPreferences";

describe("ICS feed preferences", () => {
    it("normalizes webcal subscriptions and supplies an active state", () => {
        // Break caught: accepting webcal without translating it would make the
        // desktop fetch an unsupported protocol.
        expect(
            parseIcsFeeds([
                {
                    id: "a",
                    calendarPath: "Études",
                    name: "Cours",
                    url: "webcal://x.test/a.ics",
                    refreshMinutes: 15,
                },
            ])
        ).toEqual([
            {
                id: "a",
                calendarPath: "Études",
                name: "Cours",
                url: "https://x.test/a.ics",
                refreshMinutes: 15,
                active: true,
            },
        ]);
        expect(normalizeIcsUrl(" WEBCAL://x.test/a.ics ")).toBe(
            "https://x.test/a.ics"
        );
    });

    it("keeps at most five distinct normalized URLs for each calendar", () => {
        // Break caught: an unchecked imported preference can create an
        // unbounded number of network feeds for one calendar.
        expect(
            parseIcsFeeds(
                new Array(6).fill(null).map((_, index) => ({
                    id: String(index),
                    calendarPath: "Études",
                    name: String(index),
                    url: `https://x.test/${index}.ics`,
                }))
            )
        ).toHaveLength(5);
    });

    it("rejects invalid links, unsafe calendar paths, invalid refreshes and duplicate URLs", () => {
        // Break caught: malformed preferences bypass the same safety and
        // deduplication constraints as links created in the UI.
        expect(
            parseIcsFeeds([
                {
                    id: "valid",
                    calendarPath: "Études",
                    name: "Cours",
                    url: "https://x.test/a.ics",
                    refreshMinutes: 60,
                },
                {
                    id: "duplicate",
                    calendarPath: "Études",
                    name: "Copie",
                    url: "webcal://x.test/a.ics",
                },
                {
                    id: "valid",
                    calendarPath: "Personnel",
                    name: "Identité dupliquée",
                    url: "https://x.test/other.ics",
                },
                {
                    id: "unsafe",
                    calendarPath: "../Études",
                    name: "Unsafe",
                    url: "https://x.test/b.ics",
                },
                {
                    id: "bad-url",
                    calendarPath: "Études",
                    name: "Bad URL",
                    url: "ftp://x.test/c.ics",
                },
                {
                    id: "bad-refresh",
                    calendarPath: "Études",
                    name: "Bad refresh",
                    url: "https://x.test/d.ics",
                    refreshMinutes: 20,
                },
            ])
        ).toEqual([
            {
                id: "valid",
                calendarPath: "Études",
                name: "Cours",
                url: "https://x.test/a.ics",
                refreshMinutes: 60,
                active: true,
            },
        ]);
    });

    it("migrates only legacy feeds assigned to a safe calendar folder", () => {
        // Break caught: a legacy iCal source without a safe target would be
        // silently discarded instead of remaining readable for later repair.
        const migration = migrateLegacyIcalSources([
            {
                type: "ical",
                id: "old",
                name: "Cours",
                url: "https://x.test/a.ics",
                directory: "Études",
                color: "#fff",
            },
            {
                type: "ical",
                id: "unresolved",
                name: "Sans dossier",
                url: "https://x.test/b.ics",
                color: "#fff",
            },
        ]);

        expect(migration.feeds).toEqual([
            {
                id: "old",
                calendarPath: "Études",
                name: "Cours",
                url: "https://x.test/a.ics",
                active: true,
            },
        ]);
        expect(migration.unresolved.map((source) => source.id)).toEqual([
            "unresolved",
        ]);
    });
});

/*
 * L'adresse du campus, réglée une fois sur le lien.
 *
 * Le flux Efrei publie un point unique pour toutes les salles, et il tombe à
 * quelques rues de l'école : rien dans le flux ne permet de mener au bon
 * campus. C'est donc une adresse écrite à la main sur le lien qui fait foi, et
 * tous ses évènements y mènent.
 */
describe("l'adresse d'un lien ICS", () => {
    const feed = (over: Record<string, unknown> = {}) => [
        {
            id: "feed-1",
            calendarPath: "Études",
            name: "Planning Efrei",
            url: "https://example.test/planning.ics",
            active: true,
            ...over,
        },
    ];

    it("is absent until someone writes one", () => {
        expect(parseIcsFeeds(feed())[0].address).toBeUndefined();
    });

    it("keeps the address written on the link", () => {
        const parsed = parseIcsFeeds(
            feed({ address: "Efrei, 30-32 avenue de la République, Villejuif" })
        );
        expect(parsed[0].address).toBe(
            "Efrei, 30-32 avenue de la République, Villejuif"
        );
    });

    it("trims it, and treats an empty one as none", () => {
        expect(parseIcsFeeds(feed({ address: "  Efrei  " }))[0].address).toBe(
            "Efrei"
        );
        expect(
            parseIcsFeeds(feed({ address: "   " }))[0].address
        ).toBeUndefined();
        expect(parseIcsFeeds(feed({ address: 42 }))[0].address).toBeUndefined();
    });
});
