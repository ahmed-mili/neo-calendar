import * as fs from "fs";
import * as path from "path";

const css = fs
    .readFileSync(path.join(__dirname, "CalendarGrid.css"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "");

const normalize = (value: string) => value.trim().replace(/\s+/g, " ");

function declarationsFor(selector: string): Record<string, string> {
    let found: Record<string, string> | null = null;

    for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (!rule[1].split(",").map(normalize).includes(selector)) continue;
        found = Object.assign(
            found ?? {},
            Object.fromEntries(
                rule[2]
                    .split(";")
                    .map((declaration) => declaration.trim())
                    .filter(Boolean)
                    .map((declaration) => {
                        const separator = declaration.indexOf(":");
                        return [
                            declaration.slice(0, separator).trim(),
                            normalize(declaration.slice(separator + 1)),
                        ];
                    })
            )
        );
    }

    if (!found) throw new Error(`Missing CSS selector: ${selector}`);
    return found;
}

/** The four `inset` lengths, in the order top, right, bottom, left. */
function insetOf(selector: string): [number, number, number, number] {
    const value = declarationsFor(selector).inset;
    if (!value) throw new Error(`Missing inset on ${selector}`);
    const parts = value.split(" ").map((part) => {
        const pixels = /^(-?\d+(?:\.\d+)?)px$/.exec(part);
        if (!pixels) throw new Error(`Not a px length on ${selector}: ${part}`);
        return Number(pixels[1]);
    });
    const [top, right = top, bottom = top, left = right] = parts;
    return [top, right, bottom, left];
}

function pixelsOf(value: string): number {
    const pixels = /^(-?\d+(?:\.\d+)?)px$/.exec(value.trim());
    if (!pixels) throw new Error(`Not a px length: ${value}`);
    return Number(pixels[1]);
}

/*
 * Où l'on peut cliquer pour cocher une tâche.
 *
 * Le glyphe mesure 14 px : viser 14 px sur une grille où les blocs se
 * touchent est plus dur que ça n'en a l'air, et les 9 px de remplissage que
 * le bloc laisse à sa gauche n'appartenaient à personne — un clic là-dedans
 * ouvrait l'évènement au lieu de le cocher.
 *
 * La cible est donc étendue par un pseudo-élément, qui ne dessine rien : ce
 * qui se voit ne bouge pas d'un pixel. Ce que ces tests gardent, c'est la
 * relation entre le remplissage du bloc et cette extension — sans quoi
 * changer l'un rouvrirait le trou dans l'autre, en silence.
 */
describe("task checkbox click target", () => {
    const GLYPH = 14;

    it("reaches the block's own left edge", () => {
        const block = declarationsFor(".nc-event-block");
        const accent = pixelsOf(block["--nc-event-accent-width"]);
        const padding = pixelsOf(
            /calc\(var\(--nc-event-accent-width\) \+ (\d+px)\)/.exec(
                block["padding-left"]
            )?.[1] ?? block["padding-left"]
        );
        const gap = accent + padding;

        const [, , , left] = insetOf(".nc-task-checkbox::before");

        expect(-left).toBeGreaterThanOrEqual(gap);
    });

    it("stops short of the title beside it", () => {
        const gap = pixelsOf(declarationsFor(".nc-event-content").gap);
        const [, right] = insetOf(".nc-task-checkbox::before");

        expect(-right).toBeLessThan(gap);
    });

    it("measures at least the 24 px a pointer needs", () => {
        const [top, right, bottom, left] = insetOf(".nc-task-checkbox::before");

        expect(GLYPH - left - right).toBeGreaterThanOrEqual(24);
        expect(GLYPH - top - bottom).toBeGreaterThanOrEqual(24);
    });

    it("positions the checkbox so the extension lands where it should", () => {
        expect(declarationsFor(".nc-task-checkbox").position).toBe("relative");
        expect(declarationsFor(".nc-task-checkbox::before").position).toBe(
            "absolute"
        );
    });

    it("draws nothing: the glyph keeps its own size", () => {
        const checkbox = declarationsFor(".nc-task-checkbox");
        expect(checkbox.width).toBe("14px");
        expect(checkbox.height).toBe("14px");
        expect(declarationsFor(".nc-task-checkbox::before").background).toBe(
            undefined
        );
    });
});
