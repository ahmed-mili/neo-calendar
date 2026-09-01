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
