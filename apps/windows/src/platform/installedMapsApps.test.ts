import {
    parseInstalledMapsApps,
    parseInstalledMapsIcons,
} from "./installedMapsApps";

/*
 * Ce que le téléphone répond quand on lui demande quelles cartes il a.
 *
 * La liste vient du `PackageManager`, donc du dehors : elle peut arriver vide,
 * absente, ou nommer une application qu'on ne sait pas ouvrir. Le menu ne
 * propose que ce que l'application sait viser, dans l'ordre où il les montre —
 * l'ordre du téléphone n'a pas de sens à l'écran.
 */
describe("parseInstalledMapsApps", () => {
    it("keeps the apps it knows how to open", () => {
        expect(parseInstalledMapsApps(["citymapper", "google"])).toEqual([
            "google",
            "citymapper",
        ]);
    });

    it("shows them in the menu's order, not the phone's", () => {
        expect(
            parseInstalledMapsApps(["waze", "moovit", "google", "citymapper"])
        ).toEqual(["google", "citymapper", "moovit", "waze"]);
    });

    it("drops what it would not know what to do with", () => {
        expect(parseInstalledMapsApps(["plans", "ratp", 3, null])).toEqual([]);
    });

    /* Le pont peut répondre autre chose qu'une liste — commande absente sur une
       version plus ancienne de l'application native, ou erreur avalée. */
    it("reads anything that is not a list as no app at all", () => {
        expect(parseInstalledMapsApps(undefined)).toEqual([]);
        expect(parseInstalledMapsApps("google")).toEqual([]);
        expect(parseInstalledMapsApps({ google: true })).toEqual([]);
    });
});

/*
 * Les icônes des applications, telles que le téléphone les dessine.
 *
 * La feuille les montre parce qu'une liste de noms nus ne ressemble à rien de
 * ce qu'Android propose : on reconnaît Citymapper à son rond bleu avant de lire
 * son nom. Elles arrivent en data: URI, faute de fichier à pointer depuis une
 * WebView.
 */
describe("parseInstalledMapsIcons", () => {
    const icon = "data:image/png;base64,AAAA";

    it("keeps the icon of each app it knows", () => {
        expect(
            parseInstalledMapsIcons([
                { id: "citymapper", icon },
                { id: "google", icon },
            ])
        ).toEqual({ citymapper: icon, google: icon });
    });

    it("ignores an app it would not put in the menu", () => {
        expect(parseInstalledMapsIcons([{ id: "ratp", icon }])).toEqual({});
    });

    /* Une icône illisible n'est pas une raison de perdre l'application : la
       feuille sait se passer d'image, pas d'entrée. */
    it("leaves out an icon that is not a data URI", () => {
        expect(
            parseInstalledMapsIcons([
                { id: "waze", icon: "/data/app/waze/icon.png" },
                { id: "google", icon: 7 },
                { id: "citymapper" },
            ])
        ).toEqual({});
    });

    it("reads anything that is not a list as no icon at all", () => {
        expect(parseInstalledMapsIcons(undefined)).toEqual({});
        expect(parseInstalledMapsIcons(["google"])).toEqual({});
    });
});

/*
 * Le natif a d'abord répondu des noms, puis des objets portant l'icône. Les
 * deux formes se lisent : l'application native et son JS voyagent dans le même
 * APK, mais un appareil qui a raté une mise à jour n'a pas à perdre son menu.
 */
describe("parseInstalledMapsApps — les deux formes du pont", () => {
    it("reads apps named inside objects", () => {
        expect(
            parseInstalledMapsApps([
                { id: "waze", icon: "data:image/png;base64,AAAA" },
                { id: "google" },
            ])
        ).toEqual(["google", "waze"]);
    });
});
