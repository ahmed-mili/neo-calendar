import { eventAccentColor } from "./eventAccent";

/** What getComputedStyle hands back, reduced to what the colour is read from. */
const style = (
    accent: string,
    borderLeft = "",
    borderTop = ""
): {
    getPropertyValue(name: string): string;
    borderLeftColor: string;
    borderTopColor: string;
} => ({
    getPropertyValue: (name) => (name === "--nc-event-accent" ? accent : ""),
    borderLeftColor: borderLeft,
    borderTopColor: borderTop,
});

describe("the colour an event block is outlined with", () => {
    /*
     * The calendar's colour moved off the left border and onto a variable read
     * by a pseudo-element, so a block no longer has a coloured border at all.
     * Read from the border, the resize outline came back as the resolved value
     * of currentColor — the text colour — which on a selected block is very
     * nearly its background.
     */
    it("prend la variable que le bloc porte", () => {
        expect(eventAccentColor(style(" #6c8cff "))).toBe("#6c8cff");
    });

    it("prefere la variable a la bordure", () => {
        expect(eventAccentColor(style("#6c8cff", "rgb(1, 2, 3)"))).toBe(
            "#6c8cff"
        );
    });

    it("retombe sur la bordure pour un bloc qui en a une", () => {
        expect(eventAccentColor(style("", "rgb(1, 2, 3)"))).toBe(
            "rgb(1, 2, 3)"
        );
        expect(eventAccentColor(style("", "", "rgb(4, 5, 6)"))).toBe(
            "rgb(4, 5, 6)"
        );
    });

    it("dit currentColor quand rien ne repond", () => {
        expect(eventAccentColor(style(""))).toBe("currentColor");
    });
});
