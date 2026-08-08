import * as fs from "fs";
import * as path from "path";

const css = fs.readFileSync(
    path.join(__dirname, "CalendarSidebar.css"),
    "utf8"
);
const component = fs.readFileSync(
    path.join(__dirname, "CalendarSidebar.tsx"),
    "utf8"
);

const normalize = (value: string) => value.trim().replace(/\s+/g, " ");

const declarationsFor = (selector: string): Record<string, string> => {
    const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const rules = withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g);
    const declarations: Record<string, string> = {};
    let found = false;

    for (const rule of rules) {
        const selectors = rule[1].split(",").map(normalize);
        if (!selectors.includes(selector)) continue;
        found = true;

        for (const declaration of rule[2]
            .split(";")
            .map((value) => value.trim())
            .filter(Boolean)) {
            const separator = declaration.indexOf(":");
            declarations[declaration.slice(0, separator).trim()] = normalize(
                declaration.slice(separator + 1)
            );
        }
    }

    if (!found) throw new Error(`Missing CSS selector: ${selector}`);
    return declarations;
};

describe("hidden calendar identity", () => {
    it("stays invisible at rest and reappears on hover or keyboard focus", () => {
        expect(
            declarationsFor(".nc-calendar-hidden .nc-calendar-visibility")
                .opacity
        ).toBe("0");
        expect(
            declarationsFor(".nc-calendar-hidden .nc-calendar-name").opacity
        ).toBe("0");
        expect(
            declarationsFor(".nc-calendar-hidden .nc-calendar-default-label")
                .opacity
        ).toBe("0");

        for (const selector of [
            ".nc-calendar-hidden:hover",
            ".nc-calendar-hidden:has(:focus-visible)",
        ]) {
            expect(
                declarationsFor(`${selector} .nc-calendar-visibility`).opacity
            ).toBe("0.45");
            expect(
                declarationsFor(`${selector} .nc-calendar-name`).opacity
            ).toBe("0.45");
        }
        expect(css).not.toContain(".nc-calendar-hidden:focus-within");
    });

    it("transitions opacity in both masking directions", () => {
        expect(declarationsFor(".nc-calendar-visibility").transition).toBe(
            "opacity var(--nc-transition-normal)"
        );
        expect(declarationsFor(".nc-calendar-name").transition).toBe(
            "opacity var(--nc-transition-normal)"
        );
    });

    it("preserves the original name and swatch colors while disabled", () => {
        expect(css).not.toContain("--nc-hidden-calendar-color");
        expect(component).not.toMatch(
            /style=\{\s*hidden\s*\?\s*undefined\s*:\s*online/
        );
    });
});

describe("calendar removal wording", () => {
    it("removes the calendar from the list without presenting a file delete action", () => {
        expect(component).toContain('label: t("Remove from list")');
        expect(component).toContain("icon: <ListXIcon />");
        expect(component).not.toContain('label: t("Delete")');
        expect(component).not.toContain('label: "Delete"');
    });
});
