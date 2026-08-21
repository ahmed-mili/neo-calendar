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

describe("room for the update control", () => {
    /*
     * The sidebar bar has 204px of content and the open control takes 114 of
     * them: with the version number still there, "Mettre à jour" ran out of the
     * panel and was cut mid-word. The number steps aside instead — it has
     * nothing to say at the moment the errand is under the cursor.
     */
    it("folds the version number away while the control is open", () => {
        for (const selector of [
            ".nc-sidebar-top-right:has(.nc-update-control--ready:hover) .nc-sidebar-version",
            ".nc-sidebar-top-right:has(.nc-update-control--ready:focus-visible) .nc-sidebar-version",
        ]) {
            const folded = declarationsFor(selector);
            expect(folded["max-width"]).toBe("0");
            expect(folded["margin-right"]).toBe("0");
            expect(folded.opacity).toBe("0");
        }
    });

    /*
     * Folding only reads as one movement if it is animated, and a width can
     * only be animated from a number — `auto` transitions to nothing.
     */
    it("gives the pill a width to animate from", () => {
        const pill = declarationsFor(".nc-sidebar-version");
        expect(pill["max-width"]).toBe("160px");
        expect(pill.overflow).toBe("hidden");
        expect(pill.transition).toContain("max-width");
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
