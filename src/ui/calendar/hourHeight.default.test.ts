import * as fs from "fs";
import * as path from "path";
import { HOUR_HEIGHT, ANDROID_HOUR_HEIGHT } from "./calendarConstants";

const read = (...segments: string[]) =>
    fs.readFileSync(path.join(__dirname, ...segments), "utf8");

const base = read("CalendarVariables.css");
const mobile = read("..", "..", "..", "apps", "android", "src", "mobile.css");

/** Toutes les valeurs déclarées pour `--nc-hour-height` dans une feuille. */
const declared = (css: string): number[] =>
    [...css.matchAll(/--nc-hour-height:\s*(\d+)px/g)].map((found) =>
        Number(found[1])
    );

/*
 * Une seule hauteur d'heure, écrite au même nombre partout.
 *
 * Le JavaScript place les évènements, la feuille dessine la grille : quand les
 * deux ont divergé — 60 d'un côté, 84 de l'autre — le jour visible était plus
 * long que le jour logique, et des heures fantômes apparaissaient après
 * minuit. Ce test est ce qui empêche la divergence de revenir.
 */
describe("the resting height of an hour", () => {
    it("is the same number in the stylesheet and in the code", () => {
        expect(declared(base)).toEqual([HOUR_HEIGHT]);
    });

    it("is the same number again in the Android sheet", () => {
        // Android en redéclare deux fois, dans deux blocs différents : les
        // deux doivent dire la même chose, et la même que le code.
        const values = declared(mobile);
        expect(values.length).toBeGreaterThan(0);
        for (const value of values) expect(value).toBe(ANDROID_HOUR_HEIGHT);
    });
});

/*
 * Pourquoi le téléphone se repose plus haut que l'ordinateur.
 *
 * Une colonne de téléphone est étroite : « Présentation outils informatiques +
 * Learning XP » y tient sur trois lignes. Mesuré dans l'application, à 60 px
 * par heure, un évènement d'une heure offre 46 px à son contenu alors qu'il en
 * faut 57 — trois lignes de titre à 14,3 px, plus la ligne d'horaire — et la
 * troisième ligne était coupée en deux dans la hauteur.
 */
describe("why the phone rests taller", () => {
    it("gives an hour enough room for three lines of title and its time", () => {
        // 5 px de remplissage en haut et en bas, 4 px d'écart entre deux
        // évènements : ce qu'il reste doit tenir les 57 px mesurés.
        const contenu = ANDROID_HOUR_HEIGHT - 4 - 5 - 5;
        expect(contenu).toBeGreaterThanOrEqual(57);
    });

    it("stays a resting value, not a floor: pinching still goes lower", () => {
        const { MIN_HOUR_HEIGHT } = jest.requireActual<
            typeof import("./calendarConstants")
        >("./calendarConstants");
        expect(MIN_HOUR_HEIGHT).toBeLessThan(ANDROID_HOUR_HEIGHT);
    });

    it("leaves the desktop where it was: its columns are wide", () => {
        expect(HOUR_HEIGHT).toBe(60);
        expect(ANDROID_HOUR_HEIGHT).toBeGreaterThan(HOUR_HEIGHT);
    });
});
