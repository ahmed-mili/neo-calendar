import * as fs from "fs";
import * as path from "path";

const read = (file: string) =>
    fs
        .readFileSync(path.join(__dirname, file), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "");

const grid = read("CalendarGrid.css");
const panel = read("CalendarPanel.css");
const sections = fs.readFileSync(
    path.join(__dirname, "TimeGridSections.tsx"),
    "utf8"
);
const description = fs.readFileSync(
    path.join(__dirname, "DescriptionSection.tsx"),
    "utf8"
);

const normalize = (value: string) => value.trim().replace(/\s+/g, " ");

function declarationsFor(
    css: string,
    selector: string
): Record<string, string> {
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

/*
 * Un horaire de prière est une heure de la journée, pas un rendez-vous : il
 * s'affiche par un trait, il n'occupe pas la place d'un évènement et il n'écrit
 * rien sur le disque. Le trait de la prochaine prière est plein, ceux des
 * autres heures du jour sont estompés.
 */
describe("the prayer lines on the grid", () => {
    it("takes the colour of the calendar they belong to", () => {
        const line = declarationsFor(grid, ".nc-prayer-line");
        expect(line.background).toContain("var(--nc-prayer-color)");
        // Posée par la colonne en style inline, donc les traits s'éteignent
        // avec leur calendrier sans que la grille ait à le savoir.
        expect(sections).toContain('"--nc-prayer-color": prayerColor');
    });

    it("weighs the next prayer more than the rest of the day", () => {
        const line = declarationsFor(grid, ".nc-prayer-line");
        const next = declarationsFor(grid, ".nc-prayer-line--next");
        expect(line.height).toBe("1px");
        expect(next.height).toBe("2px");
        expect(line.background).toContain("55%");
        expect(next.background).toBe("var(--nc-prayer-color)");
        expect(Number(next["z-index"])).toBeGreaterThan(
            Number(line["z-index"])
        );
    });

    it("never takes a pointer: there is nothing to click on an hour", () => {
        expect(declarationsFor(grid, ".nc-prayer-line")["pointer-events"]).toBe(
            "none"
        );
    });
});

describe("the description of an event nothing can change", () => {
    /*
     * « Ajouter une description » invitait à une chose impossible sur un
     * évènement venu d'un lien ICS. Sans description et sans droit d'écrire, la
     * ligne ne dit plus rien et ne s'entoure plus au survol.
     */
    it("shows no placeholder when it is locked", () => {
        expect(description).toContain(
            'editable ? t("Add a description") : undefined'
        );
    });

    it("does not offer itself on hover when locked and empty", () => {
        expect(description).toContain('" nc-panel-row-desc--silent"');
        expect(
            declarationsFor(
                panel,
                ".nc-panel-body .nc-panel-row.nc-panel-row-desc.nc-panel-row-desc--silent:hover"
            )["border-color"]
        ).toBe("transparent");
    });
});
