import * as fs from "fs";
import * as path from "path";

const read = (file: string) =>
    fs.readFileSync(path.join(__dirname, file), "utf8");

const picker = read("ColorPicker.css");
const app = fs.readFileSync(
    path.join(__dirname, "..", "..", "..", "apps", "windows", "src", "App.css"),
    "utf8"
);

/**
 * Le `z-index` d'un sélecteur : le dernier déclaré, car un même sélecteur peut
 * revenir plusieurs fois dans une feuille et c'est la dernière déclaration qui
 * gagne.
 */
function layerOf(css: string, selector: string): number {
    let layer: number | null = null;
    let at = css.indexOf(`${selector} {`);
    if (at === -1) throw new Error(`Sélecteur absent : ${selector}`);
    while (at !== -1) {
        const rule = css.slice(at, css.indexOf("}", at));
        const found = rule.match(/z-index:\s*(\d+)/);
        if (found) layer = Number(found[1]);
        at = css.indexOf(`${selector} {`, at + 1);
    }
    if (layer === null) throw new Error(`Aucun z-index pour ${selector}`);
    return layer;
}

/*
 * Le sélecteur de couleur passe au-dessus de ce qui l'ouvre.
 *
 * Il est porté sur le `body`, donc son plan est la seule chose qui décide s'il
 * se voit. Son numéro avait été choisi pour le seul appelant de l'époque — le
 * menu d'un calendrier, à 10001 — et le dialogue des horaires de prière, à
 * 50010, l'a ensuite recouvert entièrement : le sélecteur s'ouvrait derrière
 * son propre dialogue, et l'appui destiné à choisir une couleur tombait sur le
 * voile, qui refermait tout. « La couleur n'est pas réellement modifiable »
 * était exactement cela.
 *
 * La règle n'est donc pas un nombre mais un ordre : au-dessus de tout ce qui
 * peut l'ouvrir, en dessous de ce qui doit rester lisible par-dessus lui.
 */
describe("where the colour picker sits", () => {
    const pickerLayer = () => layerOf(picker, ".nc-color-picker");

    it("passes over the prayer dialog it can be opened from", () => {
        expect(pickerLayer()).toBeGreaterThan(
            layerOf(app, ".nc-prayer-backdrop")
        );
    });

    it("passes over the other colour surface of the settings", () => {
        expect(pickerLayer()).toBeGreaterThan(
            layerOf(app, ".nc-theme-color-popover")
        );
    });

    it("stays under the toast, which reports what went wrong", () => {
        // Une erreur cachée par un sélecteur de couleur ne se lit nulle part.
        expect(pickerLayer()).toBeLessThan(layerOf(app, ".nc-toast"));
    });
});
