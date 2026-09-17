import * as fs from "fs";
import * as path from "path";

/**
 * Ce que l'écran des paramètres d'ordinateur tient pour acquis.
 *
 * Les quatre défauts gardés ici se sont tous logés dans la même faille : le
 * bloc d'ordinateur redéfinit la géométrie de la ligne (plus de retrait à
 * gauche, plus de carte autour du groupe) sans reprendre les mesures que le
 * bloc commun avait taillées pour le téléphone. Un test lit donc le CSS, faute
 * de pouvoir lire le rendu.
 */

const css = fs.readFileSync(path.join(__dirname, "App.css"), "utf8");
const normalizedCss = css.replace(/\s+/g, " ").trim();

const cssContains = (snippet: string) =>
    expect(normalizedCss).toContain(snippet.replace(/\s+/g, " ").trim());

describe("paramètres d'ordinateur : le survol d'une ligne", () => {
    it("pose le galet sur un pseudo-élément, débordant d'autant des deux côtés", () => {
        cssContains(
            '.nc-settings__desktop-page .nc-set-row--action::after { content: ""; position: absolute; z-index: -1; inset: 3px -12px;'
        );
        cssContains("border-radius: 10px;");
    });

    it("garde 3 px de retrait vertical, pour ne pas mordre les filets voisins", () => {
        expect(normalizedCss).toContain("inset: 3px -12px");
        // Un galet collé aux bords (`inset: 0 -12px`) recouvrirait le filet du
        // dessus et celui du dessous : la ligne survolée sortirait de son bloc.
        expect(normalizedCss).not.toContain("inset: 0 -12px");
    });

    it("ne déplace plus la ligne de 8 px au passage de la souris", () => {
        expect(normalizedCss).not.toContain(
            ".nc-settings__desktop-page .nc-set-row--action:hover { padding-left: 8px; margin-left: -8px;"
        );
        cssContains(
            ".nc-settings__desktop-page .nc-set-row { position: relative;"
        );
        // Sans contexte d'empilement propre, le galet en z-index négatif
        // passerait sous le fond de la page au lieu de passer sous le texte.
        cssContains("isolation: isolate;");
    });

    it("laisse le liseré du clavier épouser le galet plutôt que la boîte", () => {
        cssContains(
            ".nc-settings__desktop-page .nc-set-row--action:focus-visible { outline: none; }"
        );
        cssContains(
            ".nc-settings__desktop-page .nc-set-row--action:focus-visible::after { border-color: var(--nc-accent);"
        );
    });
});

describe("paramètres d'ordinateur : les filets entre les lignes", () => {
    it("les aligne sur l'icône, la ligne d'ordinateur n'ayant aucun retrait à gauche", () => {
        cssContains(
            ".nc-settings__desktop-page .nc-set-group__rows > * + *::before { right: 0; left: 0; }"
        );
    });
});

describe("paramètres d'ordinateur : la colonne de gauche", () => {
    it("dit survol, ouvert et appui par la seule densité de la surface", () => {
        cssContains(
            ".nc-settings__nav-item:hover { color: var(--text-normal); background: color-mix(in srgb, var(--nc-accent) 12%, transparent); }"
        );
        cssContains(
            '.nc-settings__nav-item[aria-current="page"] { color: var(--text-normal); background: color-mix(in srgb, var(--nc-accent) 30%, transparent); }'
        );
        cssContains(
            ".nc-settings__nav-item:active { background: color-mix(in srgb, var(--nc-accent) 24%, transparent); transition-duration: 0s; }"
        );
        // L'onglet déjà ouvert s'enfonce depuis sa propre densité : sans cette
        // règle, un clic dessus l'éclaircirait au lieu de l'enfoncer.
        cssContains(
            '.nc-settings__nav-item[aria-current="page"]:active { background: color-mix(in srgb, var(--nc-accent) 44%, transparent); }'
        );
    });

    it("ne porte plus ni contour ni balle verticale", () => {
        // Trois façons de dire « celui-ci » dans un galet de 38 px, c'était
        // deux de trop.
        expect(normalizedCss).not.toContain(
            '.nc-settings__nav-item[aria-current="page"]::before'
        );
        expect(normalizedCss).not.toContain(
            ".nc-settings__nav-item:hover { border-color:"
        );
        // L'onglet ouvert était à l'accent 12 % mélangé au gris de survol :
        // à un cheveu du survol lui-même.
        expect(normalizedCss).not.toContain(
            "var(--nc-accent) 12%, var(--background-modifier-hover)"
        );
    });
});

describe("le choix d'un fond d'écran sur ordinateur", () => {
    it("est une grille de vignettes dans le dialogue centré", () => {
        cssContains(
            "body:not(.nc-platform-android) .nc-choice-dialog .nc-wallpaper-options { grid-template-columns: repeat(auto-fill, minmax(176px, 1fr));"
        );
        cssContains(
            "body:not(.nc-platform-android) .nc-choice-dialog .nc-wallpaper-option__image { width: 100%; height: auto; aspect-ratio: 16 / 9;"
        );
    });

    it("n'a plus de menu ancré : ni règle, ni placement, ni débordement", () => {
        // Le menu ancré se calait sous le champ, hors du panneau, et le
        // débordait par le bas. Le dialogue centré n'a aucun de ces calculs.
        expect(normalizedCss).not.toContain(".nc-wallpaper-menu");
    });
});

describe("paramètres d'ordinateur : la colorimétrie", () => {
    it("enfonce la colonne sous la page, au lieu de deux valeurs jumelles", () => {
        cssContains(
            "background: color-mix(in srgb, var(--background-primary) 84%, #000);"
        );
        cssContains(
            ".nc-settings__desktop-main { min-width: 0; min-height: 0; display: flex; flex-direction: column; background: var(--background-primary); }"
        );
    });

    it("donne au galet une teinte propre à ce panneau, plus franche que celle des menus", () => {
        cssContains(
            "--nc-settings-hover-tint: color-mix( in srgb, var(--nc-accent) 22%, transparent );"
        );
        // Le galet dit le survol par sa seule surface : pas de contour, là non
        // plus — c'est la grammaire qu'Ahmed a tranchée le 2026-09-17.
        cssContains(
            ".nc-settings__desktop-page .nc-set-row--action:hover::after { background: var(--nc-settings-hover-tint); }"
        );
    });

    it("descend le titre de groupe sous le poids des libellés qu'il titre", () => {
        cssContains(
            ".nc-settings__desktop-page .nc-set-group__title { margin: 0 0 9px; color: var(--nc-text-secondary, var(--text-muted)); font-size: 13px;"
        );
    });
});

describe("paramètres d'ordinateur : la barre de défilement", () => {
    it("reçoit celle de l'application, et non celle brute de la WebView", () => {
        for (const rule of [
            "::-webkit-scrollbar",
            "::-webkit-scrollbar-thumb",
            "::-webkit-scrollbar-thumb:hover",
        ]) {
            expect(normalizedCss).toContain(
                `.nc-settings__desktop-page${rule},`
            );
        }
    });
});

describe("survol = surface, jamais contour (hors panneau d'évènement)", () => {
    const pcCss = fs
        .readFileSync(path.join(__dirname, "App.css"), "utf8")
        .replace(/\s+/g, " ");

    it("ne dessine plus de contour au survol dans le chrome de bureau", () => {
        for (const rule of [
            "button.nc-settings__theme-card:hover",
            ".nc-prayer-dialog__reset:hover",
            ".nc-ics-feed-address__input:hover",
            ".nc-ics-feed-row__name:hover",
            ".nc-ics-feed-row__action:hover",
            ".nc-ics-feed-row__action--danger:hover",
        ]) {
            const at = pcCss.indexOf(rule + " {");
            expect(at).toBeGreaterThan(-1);
            const body = pcCss.slice(at, pcCss.indexOf("}", at));
            expect(body).not.toMatch(/border(-[a-z]+)?-color\s*:/);
        }
    });

    it("met une surface là où le contour était tout le survol", () => {
        // Sans elle, « Adresse » et le nom d'un lien ICS n'auraient plus aucun
        // retour au survol : leur règle ne portait que `border-color`.
        for (const rule of [
            ".nc-ics-feed-address__input:hover",
            ".nc-ics-feed-row__name:hover",
        ]) {
            const at = pcCss.indexOf(rule + " {");
            const body = pcCss.slice(at, pcCss.indexOf("}", at));
            expect(body).toContain("background:");
        }
    });

    it("laisse le panneau d'évènement à sa grammaire, qui est une règle du projet", () => {
        const panel = fs
            .readFileSync(
                path.join(
                    __dirname,
                    "../../../src/ui/calendar/CalendarPanel.css"
                ),
                "utf8"
            )
            .replace(/\s+/g, " ");
        expect(panel).toContain(
            ".nc-panel-title-row:hover { border-color: var(--nc-border)"
        );
    });
});
