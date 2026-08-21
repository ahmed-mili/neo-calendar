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

describe("an event that has already happened", () => {
    /*
     * It is dimmed, and dimming it used to mean `opacity: 0.45` on the block —
     * which does not dim a block, it makes one see-through. On a phone the
     * calendar is a photograph, so the wallpaper came up through the event and
     * took its text with it: reported as a title barely readable and times not
     * visible at all, over a bright sky.
     *
     * The block stays opaque and its ink is dimmed instead. Alpha on the text
     * then falls on the block's own colour, which is a known quantity, rather
     * than on whatever the wallpaper happens to be showing there.
     */
    it("is dimmed without being made see-through", () => {
        expect(
            declarationsFor(".nc-event-block.nc-past-event").opacity
        ).toBeUndefined();
        expect(
            declarationsFor(".nc-event-block.nc-task-completed").opacity
        ).toBeUndefined();
    });

    it("dims the ink the title and the time both read", () => {
        const past = declarationsFor(".nc-event-block.nc-past-event");
        expect(past["--nc-event-ink"]).toBeDefined();
        expect(past["--nc-event-ink-muted"]).toBeDefined();
    });
});
