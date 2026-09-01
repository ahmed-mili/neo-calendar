import * as fs from "fs";
import * as path from "path";

const css = fs
    .readFileSync(path.join(__dirname, "CalendarGrid.css"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "");

const normalize = (value: string) => value.trim().replace(/\s+/g, " ");

/** Everything the rules naming `selector` declare, in source order. */
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

/** `flex: <grow> <shrink> <basis>` — the grow term, whichever form is used. */
function flexGrow(declarations: Record<string, string>): string | undefined {
    return declarations["flex-grow"] ?? declarations.flex?.split(" ")[0];
}

describe("where the hours sit inside an event block", () => {
    /*
     * The title and the time are one under the other, and a six-hour block is
     * much taller than the two of them together. Letting the title grow into
     * that spare height pushed the time to the very bottom edge of the block —
     * a name at the top, an hour range six hours lower, and nothing between.
     * The column is stretched to the block's height (so a title too long for
     * the block loses its lower lines instead of pushing the time out of
     * sight); the title inside it is not.
     */
    it("keeps the time directly under the title on a tall block", () => {
        expect(declarationsFor(".nc-event-text")["align-self"]).toBe("stretch");
        expect(flexGrow(declarationsFor(".nc-event-title"))).toBe("0");
    });

    /*
     * On a block too short for two lines the pair share one row, and there the
     * same growth is what pins the time to the right edge: growing sideways
     * costs nothing, growing downwards was the bug.
     */
    it("still pushes the time to the right edge on a one-row block", () => {
        expect(
            flexGrow(declarationsFor(".nc-event-text-inline .nc-event-title"))
        ).toBe("1");
    });
});
