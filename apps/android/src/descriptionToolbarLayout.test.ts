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

const declarationsOrEmpty = (selector: string) => {
    try {
        return declarationsFor(css, selector);
    } catch {
        return {};
    }
};

describe("the description toolbar inside the event panel", () => {
    it("keeps every desktop command inside the available width", () => {
        const toolbar = declarationsFor(css, ".nc-description-toolbar");

        expect(toolbar.display).toBe("grid");
        expect(toolbar["grid-template-columns"]).toBe(
            "repeat(8, minmax(0, 1fr))"
        );
        expect(toolbar["overflow-x"]).toBeUndefined();
    });

    it("keeps all Android commands on one compact row", () => {
        const toolbar = declarationsFor(
            css,
            "body.nc-platform-android .nc-description-toolbar"
        );
        const tool = declarationsFor(
            css,
            "body.nc-platform-android .nc-description-toolbar .nc-description-tool"
        );

        expect(toolbar["grid-template-columns"]).toBe(
            "repeat(8, minmax(0, 1fr))"
        );
        expect(toolbar["row-gap"]).toBe("0");
        expect(tool.width).toBe("min(44px, 100%)");
        expect(tool.height).toBe("44px");
    });

    it("loads the Android correction after the general mobile stylesheet", () => {
        const mobileImport = main.indexOf('import "./mobile.css";');
        const toolbarImport = main.indexOf(
            'import "./descriptionToolbar.css";'
        );

        expect(mobileImport).toBeGreaterThanOrEqual(0);
        expect(toolbarImport).toBeGreaterThan(mobileImport);
    });

    it("does not let hidden tooltips widen the scrolling panel", () => {
        const tooltip = declarationsOrEmpty(".nc-description-tool::after");

        expect(tooltip.content).toBeUndefined();
    });
});
