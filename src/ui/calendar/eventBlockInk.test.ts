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

    /*
     * Dimming used to be a `filter: saturate()` on the block, which washes out
     * the surface, the accent strip and the text in one go: a course already
     * given read as switched off rather than as behind one. Notion Calendar
     * dims two things and nothing else — the strip down the left edge, and the
     * name. The surface is the same as a course still to come.
     */
    it("keeps the surface of an event still to come", () => {
        expect(
            declarationsFor(".nc-event-block.nc-past-event").filter
        ).toBeUndefined();
    });

    it("dims the accent strip rather than the whole block", () => {
        const strip = declarationsFor(".nc-event-block.nc-past-event::before");
        expect(Number(strip.opacity)).toBeGreaterThan(0);
        expect(Number(strip.opacity)).toBeLessThan(1);
    });

    /*
     * The time keeps the ink of any other event. It is the one thing a glance
     * at a past block still comes to read — when it ended — and dimming it was
     * what the `color-mix` was there to soften. Both go.
     */
    it("dims the title and leaves the time alone", () => {
        const past = declarationsFor(".nc-event-block.nc-past-event");
        expect(past["--nc-event-ink"]).toBeDefined();
        expect(past["--nc-event-ink-muted"]).toBeUndefined();
    });
});
