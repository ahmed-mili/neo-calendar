import * as fs from "fs";
import * as path from "path";

const css = fs.readFileSync(
    path.join(__dirname, "CalendarEventsPanel.css"),
    "utf8"
);

const normalize = (value: string) => value.trim().replace(/\s+/g, " ");

function declarationsFor(selector: string): Record<string, string> {
    const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const rules = withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g);

    for (const rule of rules) {
        const selectors = rule[1].split(",").map(normalize);
        if (!selectors.includes(selector)) continue;

        return Object.fromEntries(
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
        );
    }

    throw new Error(`Missing CSS selector: ${selector}`);
}

describe("calendar event panel card surfaces", () => {
    it("keeps the grid hidden behind a hovered card", () => {
        expect(declarationsFor(".nc-cep-card").background).toContain(
            "var(--nc-bg-primary"
        );
        expect(declarationsFor(".nc-cep-card:hover").background).toContain(
            "var(--nc-bg-primary"
        );
    });

    it("dims past content without making the card surface transparent", () => {
        expect(declarationsFor(".nc-cep-card--past").opacity).toBe("1");
        expect(declarationsFor(".nc-cep-card--past > *").opacity).toBe("0.52");
        expect(declarationsFor(".nc-cep-card--past:hover > *").opacity).toBe(
            "0.78"
        );
    });
});
