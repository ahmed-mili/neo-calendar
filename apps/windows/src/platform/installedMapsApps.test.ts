import { parseInstalledMapsApps } from "./installedMapsApps";

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
