import * as fs from "fs";
import * as path from "path";

const css = fs.readFileSync(path.join(__dirname, "mobile.css"), "utf8");
const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
const normalize = (value: string) => value.trim().replace(/\s+/g, " ");

/**
 * The background the LAST rule on a selector declares.
 *
 * Last, and not first: several rules in this file paint the same surface, and
 * on Android nearly all of them carry `!important`, so what actually reaches
 * the screen is whichever comes last in the file. Reading the first match is
 * how the drawer could be believed to be `--background-primary` while the
 * phone showed something else.
 */
function backgroundOf(selector: string): string {
    let found: string | null = null;

    for (const rule of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (!rule[1].split(",").map(normalize).includes(selector)) continue;
        for (const declaration of rule[2].split(";")) {
            const [property, ...rest] = declaration.split(":");
            if (normalize(property) !== "background") continue;
            found = normalize(rest.join(":")).replace(/ ?!important$/, "");
        }
    }

    if (found === null) throw new Error(`No background for: ${selector}`);
    return found;
}

const DRAWER =
    "body.nc-platform-android .nc-sidebar:not(.nc-sidebar-collapsed)";
const SOMEDAY = "body.nc-platform-android .nc-cep-slot .nc-cep";

describe("the surfaces a panel covering the calendar is painted with", () => {
    /*
     * Measured on the emulator before this: the drawer came out rgb(21, 21, 34)
     * and the someday panel rgb(27, 27, 44) — one asked for the theme's
     * secondary surface, the other for its primary one. They are the same
     * panel to whoever opens them, one from the other, at the same width and
     * off the same edge, so arriving at a lighter surface reads as a different
     * screen.
     */
    it("are the same for the drawer and the someday panel", () => {
        expect(backgroundOf(SOMEDAY)).toBe(backgroundOf(DRAWER));
    });

    /*
     * `--background-secondary` and not `--nc-bg-secondary`: the latter is
     * redefined on .nc-desktop--calendar as 58% of the former over transparent,
     * so asking for it leaves the panel see-through however opaque the fallback
     * is — a fallback never applies to a variable that IS defined.
     */
    it("name the theme's secondary surface, which is opaque here", () => {
        expect(backgroundOf(DRAWER)).toContain("--background-secondary");
        expect(backgroundOf(DRAWER)).not.toContain("--nc-bg-secondary");
    });
});
