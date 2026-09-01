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

const sections = fs.readFileSync(
    path.join(__dirname, "TimeGridSections.tsx"),
    "utf8"
);

/*
 * What the hour it is looks like on the grid, measured off the screenshot of
 * the version that was asked for: a hairline at 30% of the today red across
 * every day column (rgb(89,43,41) over rgb(25,25,25) for a red of
 * rgb(241,85,80) — the same 0.30 on all three channels), a solid 2px segment
 * on today's column, and a 2px-wide vertical tick at that column's left edge.
 */
describe("the now indicator", () => {
    it("draws a hairline across every day column, under today's segment", () => {
        const line = declarationsFor(".nc-now-line");
        expect(line.height).toBe("1px");
        expect(line.background).toContain("var(--nc-today) 30%");
        // Under the bright segment, so the two never fight over the same row.
        expect(Number(line["z-index"])).toBeLessThan(
            Number(declarationsFor(".nc-now-today-line")["z-index"])
        );
    });

    // Removed in 1.5.5, asked for again: without it the bright segment floats
    // in the middle of the grid with nothing to place it against.
    it("is rendered whenever today is on screen", () => {
        expect(sections).toContain(
            '<div className="nc-now-line" style={{ top: nowTop }} />'
        );
    });

    it("marks today's edge with a vertical tick rather than a dot", () => {
        const tick = declarationsFor(".nc-now-tick");
        expect(tick.width).toBe("2px");
        expect(tick.height).toBe("6px");
        expect(tick["border-radius"]).not.toBe("50%");
    });
});
