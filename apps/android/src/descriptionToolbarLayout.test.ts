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

    it("replaces the compact bar with one horizontally scrollable formatting strip", () => {
        const strip = declarationsFor(
            css,
            ".nc-description-android-format-scroll"
        );
        const tool = declarationsFor(
            css,
            ".nc-description-android-format-button"
        );

        expect(strip.display).toBe("flex");
        expect(strip["overflow-x"]).toBe("auto");
        expect(strip["overflow-y"]).toBe("hidden");
        expect(strip["scrollbar-width"]).toBe("none");
        expect(tool["flex"]).toBe("0 0 44px");
        expect(tool.height).toBe("44px");
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
