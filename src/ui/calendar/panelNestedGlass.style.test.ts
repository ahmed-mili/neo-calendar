import * as fs from "fs";
import * as path from "path";

/**
 * Le verre du panneau d'évènement, sur PC.
 *
 * Deux flous empilés, c'est une couture : le calque de fond floutait la grille
 * à 6 px, le panneau la refloutait à 28 px par-dessus, et la limite entre les
 * deux se lisait comme un rectangle plus flou que le reste de l'écran. La
 * planche de comparaison du 2026-09-04 tranchait pour sa carte C, « nested in
 * a blurred parent » : un seul flou, porté par ce qui est derrière, et la carte
 * posée dessus sans en porter aucun.
 *
 * C'est du CSS seul — le calque garde sa place de frère du panneau plutôt que
 * de le contenir. Un parent portant `backdrop-filter` devient le bloc conteneur
 * ET le contexte d'empilement de ses descendants : le panneau y serait plafonné
 * à z 49, et un `.nc-datepicker` portalisé sur le `body` à z 1000 passerait
 * par-dessus les dialogues du panneau. Le rendu, lui, est le même au pixel :
 * un panneau à 88 % d'opacité laisse voir 12 % de ce qui est derrière, et ce
 * qui est derrière est le calque déjà flouté.
 */

const read = (name: string) =>
    fs
        .readFileSync(path.join(__dirname, name), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "");

const normalize = (value: string) => value.trim().replace(/\s+/g, " ");

/** La valeur qu'une règle donne à une propriété, la dernière l'emportant. */
function propertyOf(
    css: string,
    selector: string,
    property: string
): string | null {
    let found: string | null = null;

    for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (!rule[1].split(",").map(normalize).includes(selector)) continue;
        for (const declaration of rule[2].split(";")) {
            const separator = declaration.indexOf(":");
            if (separator < 0) continue;
            if (normalize(declaration.slice(0, separator)) !== property)
                continue;
            found = normalize(declaration.slice(separator + 1));
        }
    }

    return found;
}

const overlays = read("CalendarOverlays.css");
const DESKTOP = "body:not(.nc-platform-android)";

describe("le verre du panneau d'évènement sur PC", () => {
    it("porte le flou sur le calque de fond, pas sur le panneau", () => {
        expect(
            propertyOf(
                overlays,
                `${DESKTOP} .nc-event-popup-backdrop`,
                "backdrop-filter"
            )
        ).toBe("blur(28px) brightness(1.16)");
        expect(
            propertyOf(
                overlays,
                `${DESKTOP} .nc-event-popup`,
                "backdrop-filter"
            )
        ).toBe("none");
    });

    it("préfixe les deux, la WebView ne lisant que -webkit-", () => {
        expect(
            propertyOf(
                overlays,
                `${DESKTOP} .nc-event-popup-backdrop`,
                "-webkit-backdrop-filter"
            )
        ).toBe("blur(28px) brightness(1.16)");
        expect(
            propertyOf(
                overlays,
                `${DESKTOP} .nc-event-popup`,
                "-webkit-backdrop-filter"
            )
        ).toBe("none");
    });

    it("laisse à Android le verre qu'il avait, porté par le panneau", () => {
        /* Le téléphone garde deux flous : sa feuille monte du bas et couvre la
           largeur, il n'y a pas de couture à voir. Coupé sans distinguer les
           deux plateformes, le panneau du téléphone aurait perdu son verre. */
        expect(propertyOf(overlays, ".nc-event-popup", "backdrop-filter")).toBe(
            "blur(28px) brightness(1.16)"
        );
        expect(
            propertyOf(overlays, ".nc-event-popup-backdrop", "backdrop-filter")
        ).toBe("blur(6px)");
    });

    it("garde le calque hors du chemin de la souris", () => {
        /* Il couvre l'écran entier : le moindre événement qu'il intercepterait
           rendrait la grille inerte tant que la fiche est ouverte. */
        expect(
            propertyOf(overlays, ".nc-event-popup-backdrop", "pointer-events")
        ).toBe("none");
    });
});
