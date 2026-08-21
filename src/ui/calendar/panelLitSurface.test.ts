import * as fs from "fs";
import * as path from "path";

const read = (name: string) =>
    fs
        .readFileSync(path.join(__dirname, name), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "");

const normalize = (value: string) => value.trim().replace(/\s+/g, " ");

/** The value a rule gives one property, last declaration winning. */
function propertyOf(css: string, selector: string, property: string): string {
    let found: string | null = null;

    for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (!rule[1].split(",").map(normalize).includes(selector)) continue;
        for (const declaration of rule[2].split(";")) {
            const separator = declaration.indexOf(":");
            if (separator < 0) continue;
            if (normalize(declaration.slice(0, separator)) !== property)
                continue;
            found = normalize(declaration.slice(separator + 1));
        }
    }

    if (found === null) throw new Error(`Missing ${property} on ${selector}`);
    return found;
}

const popup = propertyOf(
    read("CalendarOverlays.css"),
    ".nc-event-popup",
    "--nc-bg-hover"
);
const picker = propertyOf(
    read("CalendarPanel.css"),
    ".nc-datepicker",
    "--nc-bg-hover"
);

describe("what a row of the event panel looks like once it is lit", () => {
    /*
     * A veil, not a slab. The panel took the theme's own hover colour, which is
     * the surface already mixed 22% towards the ink: measured off the panel on
     * a dark theme, rows lit up at rgb(67, 69, 90) against a rgb(30, 30, 46)
     * background — a pale grey block dropped on navy, which is what a filled
     * Reminders field and an open description box looked like.
     */
    it("is a thin veil of the panel's own ink", () => {
        for (const lit of [popup, picker]) {
            expect(lit).toContain("color-mix");
            expect(lit).toContain("var(--text-normal)");
            expect(Number(/(\d+)%/.exec(lit)?.[1])).toBeLessThanOrEqual(12);
        }
    });

    // The panel and the date picker it opens are one surface to whoever is
    // looking; they are two remaps only because the picker is portaled out of
    // the panel and has to resolve the theme's variables for itself.
    it("is the same veil on the panel and on the picker it opens", () => {
        expect(picker).toBe(popup);
    });
});
