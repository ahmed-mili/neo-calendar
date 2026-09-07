import * as fs from "fs";
import * as path from "path";

const css = fs.readFileSync(path.join(__dirname, "mobile.css"), "utf8");

/*
 * D'où part la feuille quand elle arrive.
 *
 * `--nc-sheet-rest-fallback` est le dernier terme du `transform` de la feuille :
 * il ne décide de rien tant que useSheetDrag écrit ses variables, et décide de
 * tout à un seul instant — entre l'insertion du nœud et la première de ces
 * écritures. Or lire la géométrie de n'importe quel élément fige la valeur
 * calculée du `transform` de la feuille, et le premier à le faire est un effet
 * de mise en page de `TimeGrid`, enfant du panneau, donc exécuté avant celui de
 * la feuille : ce repli EST le point de départ de la transition d'ouverture.
 *
 * Écrit en fraction de la hauteur, il plaçait ce départ au milieu de l'écran,
 * et l'ouverture descendait vers son ancre au lieu de monter — relevé sur le
 * brouillon Android, 780 px de haut : 304 px puis 570 px à l'arrivée. C'est
 * l'ouverture « qui monte trop haut puis se remet en place ».
 */
describe("le repli qui place la feuille avant que le geste ne l'ait touchée", () => {
    const declarations = [
        ...css.matchAll(/--nc-sheet-rest-fallback:\s*([^;]+);/g),
    ].map((match) => match[1].trim());

    it("est déclaré partout où la feuille est transformée", () => {
        const transforms = [
            ...css.matchAll(/var\(\s*--nc-sheet-rest-fallback\s*\)/g),
        ];
        expect(declarations.length).toBeGreaterThan(0);
        expect(transforms.length).toBe(declarations.length);
    });

    it("laisse la feuille hors écran, jamais à une fraction de sa hauteur", () => {
        expect(declarations).toEqual(declarations.map(() => "100%"));
    });
});
