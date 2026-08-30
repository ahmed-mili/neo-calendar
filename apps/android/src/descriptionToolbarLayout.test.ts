import * as fs from "fs";
import * as path from "path";
import { declarationsFor } from "./cssText";

const sharedCss = fs.readFileSync(
    path.join(
        __dirname,
        "..",
        "..",
        "..",
        "src",
        "ui",
        "calendar",
        "CalendarPanel.css"
    ),
    "utf8"
);
const androidCss = fs.readFileSync(
    path.join(__dirname, "descriptionToolbar.css"),
    "utf8"
);
const editor = fs.readFileSync(
    path.join(__dirname, "androidDescriptionEditor.ts"),
    "utf8"
);
const css = `${sharedCss}\n${androidCss}`;
const main = fs.readFileSync(path.join(__dirname, "main.tsx"), "utf8");

describe("the Android description keyboard accessory", () => {
    it("keeps the React formatting engine out of the permanent Description row", () => {
        const toolbar = declarationsFor(
            css,
            "body.nc-platform-android .nc-description-section .nc-description-toolbar"
        );

        expect(toolbar.display).toBe("none");
    });

    it("anchors the compact accessory above the visible keyboard viewport", () => {
        const accessory = declarationsFor(
            css,
            ".nc-description-android-accessory"
        );
        const button = declarationsFor(
            css,
            ".nc-description-android-accessory-button"
        );

        expect(accessory.position).toBe("fixed");
        expect(accessory.bottom).toContain("--nc-description-keyboard-inset");
        expect(accessory.height).toBe("48px");
        expect(button.width).toBe("44px");
        expect(button.height).toBe("44px");
    });

    it("never applies the hidden expanded-view class to the Description section", () => {
        expect(androidCss).toMatch(
            /\.nc-description-android-expanded\s*\{[^}]*display: none;/s
        );
        expect(editor).toContain(
            'const EXPANDED_CLASS = "nc-description-android-formatting-open";'
        );
        expect(editor).not.toContain(
            'const EXPANDED_CLASS = "nc-description-android-expanded";'
        );
    });

    it("uses SVG editing icons instead of improvised text glyphs", () => {
        const icon = declarationsFor(css, ".nc-description-android-icon");

        expect(icon.width).toBe("21px");
        expect(icon.height).toBe("21px");
        expect(editor).toContain('class="nc-description-android-icon"');
        expect(editor).not.toContain(">•≡</button>");
        expect(editor).not.toContain(">1≡</button>");
        expect(editor).not.toContain(">☑</button>");
        expect(editor).not.toContain(">Tx</button>");
        expect(androidCss).not.toContain(".nc-description-android-format-text");
        expect(androidCss).not.toContain(".nc-description-android-underlined");
    });

    it("keeps formatting scrollable but pins undo and redo at the far right", () => {
        const strip = declarationsFor(
            css,
            ".nc-description-android-format-scroll"
        );
        const tool = declarationsFor(
            css,
            ".nc-description-android-format-button"
        );
        const history = declarationsFor(
            css,
            ".nc-description-android-history"
        );
        const historyButton = declarationsFor(
            css,
            ".nc-description-android-history-button"
        );

        expect(strip.display).toBe("flex");
        expect(strip["overflow-x"]).toBe("auto");
        expect(strip["overflow-y"]).toBe("hidden");
        expect(strip["scrollbar-width"]).toBe("none");
        expect(strip["touch-action"]).toBe("pan-x");
        expect(tool["flex"]).toBe("0 0 44px");
        expect(tool.height).toBe("44px");
        expect(androidCss).toMatch(
            /\.nc-description-android-format-scroll \.nc-description-android-format-button\s*\{[^}]*touch-action: pan-x;/s
        );
        expect(history.display).toBe("flex");
        expect(history["flex"]).toBe("0 0 auto");
        expect(history["border-left"]).toContain("1px solid");
        expect(historyButton["flex"]).toBe("0 0 40px");
        expect(editor.indexOf('data-nc-description-history="undo"')).toBeLessThan(
            editor.indexOf('data-nc-description-history="redo"')
        );
    });

    /*
     * La barre est posee sur le body, et `usePopupDismiss` ferme l'evenement des
     * qu'un `pointerdown` tombe hors du panneau. Sans ce marqueur, toucher une
     * commande refermait la feuille entiere avant que le bouton n'agisse : la
     * description devenait inutilisable au telephone.
     */
    it("declares the accessory as belonging to the event sheet", () => {
        expect(editor).toContain(
            'root.setAttribute("data-nc-popup-portal", "true");'
        );
    });

    it("loads the Android correction after mobile.css and installs its interaction helper", () => {
        const mobileImport = main.indexOf('import "./mobile.css";');
        const toolbarImport = main.indexOf(
            'import "./descriptionToolbar.css";'
        );
        const editorImport = main.indexOf(
            'import "./androidDescriptionEditor";'
        );

        expect(mobileImport).toBeGreaterThanOrEqual(0);
        expect(toolbarImport).toBeGreaterThan(mobileImport);
        expect(editorImport).toBeGreaterThan(toolbarImport);
    });
});
