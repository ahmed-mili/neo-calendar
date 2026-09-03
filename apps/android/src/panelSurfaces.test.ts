import * as fs from "fs";
import * as path from "path";
import { declarationsFor } from "./cssText";

const css = fs.readFileSync(path.join(__dirname, "mobile.css"), "utf8");

const DRAWER =
    "body.nc-platform-android .nc-sidebar:not(.nc-sidebar-collapsed)";
const SOMEDAY = "body.nc-platform-android .nc-cep-slot .nc-cep";

describe("the surfaces a panel covering the calendar is painted with", () => {
    /*
     * Measured on the emulator before this: the drawer came out rgb(21, 21, 34)
     * and the someday panel rgb(27, 27, 44) — one asked for the theme's
     * secondary surface, the other for its primary one. They are the same
     * panel to whoever opens them, one from the other, at the same width and
     * off the same edge, so arriving at a lighter surface reads as a different
     * screen.
     */
    it("are the same for the drawer and the someday panel", () => {
        expect(declarationsFor(css, SOMEDAY).background).toBe(
            declarationsFor(css, DRAWER).background
        );
    });

    /*
     * `--background-secondary` and not `--nc-bg-secondary`: the latter is
     * redefined on .nc-desktop--calendar as 58% of the former over transparent,
     * so asking for it leaves the panel see-through however opaque the fallback
     * is — a fallback never applies to a variable that IS defined.
     */
    it("name the theme's secondary surface, which is opaque here", () => {
        expect(declarationsFor(css, DRAWER).background).toContain(
            "--background-secondary"
        );
        expect(declarationsFor(css, DRAWER).background).not.toContain(
            "--nc-bg-secondary"
        );
    });
});

describe("what a panel covering the calendar throws on the wallpaper beside it", () => {
    /*
     * Nothing, now. The drawer cast 48px of #1e1e2e at 76% — lighter than the
     * dimmed calendar under it, so it did not read as a shadow but as a haze
     * bleeding out of the panel's edge; the someday panel cast 50px of black
     * doing the same in the other direction. Both smeared the photo behind
     * them over a fifth of the screen. The 1px rule down the edge is what
     * separates a panel from the calendar.
     */
    it("throws nothing at all", () => {
        expect(declarationsFor(css, DRAWER)["box-shadow"]).toBe("none");
        expect(declarationsFor(css, SOMEDAY)["box-shadow"]).toBe("none");
    });

    it("is edged instead", () => {
        expect(declarationsFor(css, DRAWER)["border-right"]).toContain("1px");
        expect(declarationsFor(css, SOMEDAY)["border-right"]).toContain("1px");
    });
});

const SETTINGS = "body.nc-platform-android .nc-settings-backdrop";
const SETTINGS_ROWS = "body.nc-platform-android .nc-set-group__rows > *";
const PANEL_TOKENS = "body.nc-platform-android";

describe("the surface the settings are written on", () => {
    /*
     * The settings are opened from the drawer and they now start from its
     * colour, so the two do not read as different screens. They cannot simply
     * name the drawer's variable: the settings are portaled to <body>, where
     * --background-secondary is the value App.tsx generates — lighter — while
     * inside the calendar the theme class wins with the darker one. The panel
     * colour is therefore stated once, as a step down from the theme's surface.
     */
    it("is the one the drawer is painted with", () => {
        expect(declarationsFor(css, SETTINGS).background).toContain(
            "--nc-android-panel-surface"
        );
        expect(
            declarationsFor(css, PANEL_TOKENS)["--nc-android-panel-surface"]
        ).toBeDefined();
    });

    /*
     * And what sits ON the page stays darker than the page, the way Obsidian's
     * own settings do. Left where they were, the cards would have landed within
     * a unit of the page's new colour and the screen would have read as one
     * flat slab.
     */
    it("is lighter than the cards laid on it", () => {
        expect(declarationsFor(css, SETTINGS_ROWS).background).toContain(
            "--nc-android-panel-sunken"
        );
        expect(
            declarationsFor(css, PANEL_TOKENS)["--nc-android-panel-sunken"]
        ).toBeDefined();
    });
});

/*
 * Le voile de flou passe DERRIÈRE la feuille, jamais devant.
 *
 * Il ne floute que ce qu'il y a derrière le panneau : il n'a rien à recevoir et
 * il le dit lui-même, `pointer-events: none` et `aria-hidden`. Sur Android
 * pourtant, l'hôte d'overlay renumérote toute la famille — feuille à 10, menus
 * à 30 — sans toucher au voile, resté à 49 : il repassait donc au-dessus de la
 * feuille entière. Et la règle qui rend les appuis à chaque enfant de l'hôte
 * lui rendait les siens par-dessus le marché. Résultat mesuré sur l'émulateur :
 * `elementsFromPoint` au centre de n'importe quelle ligne du panneau renvoyait
 * le voile en premier, le premier appui était lu comme « je quitte la fiche »,
 * et la fiche se refermait avant d'avoir rien pu ouvrir.
 */
describe("the blur behind the event sheet", () => {
    const HOST = "body.nc-platform-android #nc-android-overlay-root";
    const SHEET = `${HOST} .nc-event-popup`;
    const BACKDROP = `${HOST} .nc-event-popup-backdrop`;

    const layer = (selector: string) =>
        Number(
            declarationsFor(css, selector)["z-index"].replace(
                /\s*!important\s*$/,
                ""
            )
        );

    it("sits under the sheet it blurs, not over it", () => {
        expect(layer(BACKDROP)).toBeLessThan(layer(SHEET));
    });

    it("keeps refusing pointers, whatever the host hands back to its children", () => {
        expect(declarationsFor(css, BACKDROP)["pointer-events"]).toBe("none");
        // `declarationsFor` normalise le `!important` : il faut le lire dans la
        // regle elle-meme, car c'est lui, et rien d'autre, qui tient tete au
        // `pointer-events: auto !important` que l'hote pose sur ses enfants.
        const rule = css.slice(css.indexOf(BACKDROP));
        expect(rule.slice(0, rule.indexOf("}"))).toContain(
            "pointer-events: none !important"
        );
    });

    it("does not hand pointers back to a child that hides itself", () => {
        // L'hôte est transparent aux appuis et les rend a ses enfants. Un
        // enfant `aria-hidden` n'est pas de l'interface : lui rendre les
        // appuis, c'est poser un attrape-clic devant ce qu'il décore.
        expect(css).toContain(`${HOST} > *:not([aria-hidden="true"])`);
    });
});

/*
 * Le panneau du mois, ouvert par le titre de la barre du haut.
 *
 * Mesure sur le telephone d'Ahmed (2026-09-02, capture) : la grille de la
 * semaine et le fond d'ecran se lisaient au travers, nets, alors que la regle
 * annoncait 94 % d'opacite et un flou de 22 px. Ni l'un ni l'autre n'arrivait
 * a l'ecran. Plutot que de monter le pourcentage — un reglage de plus sur un
 * mecanisme dont on ne sait pas s'il s'applique —, la surface ne depend plus
 * de la transparence du tout : un fond plein ne peut rien laisser passer,
 * quelle que soit la WebView. C'est aussi ce que montre Notion Calendar, dont
 * le panneau est opaque.
 */
describe("le panneau du mois sur le telephone", () => {
    const SHEET = "body.nc-platform-android .nc-android-month-sheet";

    it("is painted with a solid surface, so nothing can read through it", () => {
        const background = declarationsFor(css, SHEET).background;
        expect(background).not.toContain("transparent");
        expect(background).not.toContain("color-mix");
    });

    it("asks for no blur it cannot be shown to perform", () => {
        const sheet = declarationsFor(css, SHEET);
        expect(sheet["backdrop-filter"]).toBeUndefined();
        expect(sheet["-webkit-backdrop-filter"]).toBeUndefined();
    });

    /* Notion centre les jours sous leurs initiales. La regle de bureau les
       colle a gauche, ce qui sur les cases larges du telephone laisse le
       nombre flotter loin de sa colonne. */
    it("centres the day numbers under their initials, as Notion does", () => {
        expect(
            declarationsFor(css, `${SHEET} .nc-mini-cal-day`)[
                "justify-content"
            ]
        ).toBe("center");
        expect(
            declarationsFor(css, `${SHEET} .nc-mini-cal-day-header`)[
                "text-align"
            ]
        ).toBe("center");
    });
});

/*
 * La bande de la semaine courante, derriere les sept jours a l'ecran.
 *
 * Notion en dessine UN galet continu ; le notre sortait en sept pastilles
 * detachees. La cause n'est pas la bande mais la case : la regle de bureau
 * plafonne `.nc-mini-cal-day` a 26 px de large, taille juste pour la barre
 * laterale d'un ordinateur. Sur les colonnes larges du telephone, la case
 * flotte au milieu de sa colonne et le pseudo-element de la bande, qui ne
 * deborde que de 2 px pour franchir la gouttiere de la grille, ne peut pas
 * rejoindre la case voisine. La case reprend donc toute sa colonne, et le
 * rouge d'aujourd'hui redevient une pastille par un pseudo-element centre —
 * sans quoi il s'etalerait sur toute la colonne, ce que Notion ne fait pas.
 */
describe("la bande de la semaine courante sur le telephone", () => {
    const DAY =
        "body.nc-platform-android .nc-android-month-sheet .nc-mini-cal-day";

    it("lets a day cell fill its column, so the band can be continuous", () => {
        expect(declarationsFor(css, DAY)["max-width"]).toBe("none");
    });

    it("keeps today a compact badge rather than a full-width bar", () => {
        const badge = declarationsFor(css, `${DAY}.nc-today::after`);
        expect(badge.width).toBeDefined();
        expect(badge.width).not.toBe("100%");
        expect(badge.background).toContain("--nc-today");
    });

    /* Une bande ecrite en `color-mix` disparait entierement si la WebView ne
       connait pas la fonction — et c'est justement ce dont on soupconne celle
       du telephone. Une valeur litterale ne peut pas etre ecartee. */
    it("states its tint literally, so it cannot be dropped", () => {
        const band = declarationsFor(css, `${DAY}.nc-current-week::before`);
        expect(band.background).not.toContain("color-mix");
    });
});

/*
 * La feuille par laquelle on choisit la carte qui ouvre un lieu.
 *
 * Elle monte du bas et non de la rangée : sur un écran tenu à la main, ce qui
 * propose un choix se pose sous le pouce. Le reste suit ce qu'Android fait de
 * ses propres feuilles — pleine largeur, coins arrondis en haut seulement, et
 * un voile qui l'isole de ce qu'elle couvre.
 */
describe("the sheet that picks which map opens a place", () => {
    const SHEET = "body.nc-platform-android .nc-panel-maps-sheet";
    const VEIL = "body.nc-platform-android .nc-panel-maps-veil";

    it("is anchored to the bottom edge, right across", () => {
        const sheet = declarationsFor(css, SHEET);

        expect(sheet.position).toBe("fixed");
        expect(sheet.bottom).toBe("0");
        expect(sheet.left).toBe("0");
        expect(sheet.right).toBe("0");
    });

    /* Arrondie en haut seulement : arrondir le bas ferait flotter une carte au
       ras de l'écran, ce qu'Android ne fait pas. */
    it("is rounded where it leaves the edge, and square against it", () => {
        expect(declarationsFor(css, SHEET)["border-radius"]).toBe(
            "16px 16px 0 0"
        );
    });

    /* Le voile doit passer sous la feuille et au-dessus de la fiche : entre les
       deux, il avalerait les touchers de la feuille elle-meme. */
    it("lays its veil under itself", () => {
        const sheet = declarationsFor(css, SHEET);
        const veil = declarationsFor(css, VEIL);

        expect(Number(veil["z-index"])).toBeLessThan(Number(sheet["z-index"]));
    });

    /* 48 px : la cible qu'Android demande pour ce qu'on touche. Une entree de
       30 px va a la souris, pas au pouce. */
    it("gives each app a target a thumb can hit", () => {
        expect(
            declarationsFor(
                css,
                "body.nc-platform-android .nc-panel-maps-option"
            )["min-height"]
        ).toBe("48px");
    });
});
