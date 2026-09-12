import * as fs from "fs";
import * as path from "path";

const panel = fs
    .readFileSync(path.join(__dirname, "CalendarPanel.css"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "");

const normalize = (value: string) => value.trim().replace(/\s+/g, " ");

function declarationsFor(selector: string): Record<string, string> {
    const found: Record<string, string> = {};
    for (const rule of panel.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (!rule[1].split(",").map(normalize).includes(selector)) continue;
        for (const declaration of rule[2].split(";")) {
            const colon = declaration.indexOf(":");
            if (colon < 0) continue;
            found[normalize(declaration.slice(0, colon))] = normalize(
                declaration.slice(colon + 1)
            );
        }
    }
    return found;
}

describe("la barre du clic droit sur un lien de la description", () => {
    it("se dessine au-dessus de la fiche, et non derrière", () => {
        /* Portée sur le body, elle ne peut pas compter sur la pile du
           panneau : à 40, l'étage d'une barre qui vit DEDANS, elle s'ouvrait
           sous lui et le clic droit semblait ne rien faire. */
        const menu = declarationsFor(".nc-description-inline-actions");
        expect(menu["position"]).toBe("fixed");
        const dialog = declarationsFor(".nc-description-link-dialog");
        expect(Number(menu["z-index"])).toBeGreaterThanOrEqual(
            Number(dialog["z-index"])
        );
    });
});

describe("la case d'une étape dans la description", () => {
    it("reprend le glyphe compact des tâches sans fond de bouton", () => {
        const checkbox = declarationsFor(".nc-panel-checklist-checkbox");
        expect(checkbox.position).toBe("relative");
        expect(checkbox.width).toBe("14px");
        expect(checkbox.height).toBe("14px");
        expect(checkbox.padding).toBe("0");
        expect(checkbox.border).toBe("0");
        expect(checkbox.background).toBe("transparent !important");
    });

    it("rend l'état coché avec la couleur d'accent", () => {
        expect(
            declarationsFor('.nc-panel-checklist-checkbox[aria-checked="true"]')
                .color
        ).toBe("var(--nc-accent)");
    });
});
