import * as fs from "fs";
import * as path from "path";
import { declarationsFor } from "./cssText";

const css = fs.readFileSync(
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

    it("uses two rows of finger-sized commands on Android", () => {
        const toolbar = declarationsOrEmpty(
            "body.nc-platform-android .nc-description-toolbar"
        );
        const tool = declarationsFor(
            css,
            "body.nc-platform-android .nc-description-toolbar .nc-description-tool"
        );

        expect(toolbar["grid-template-columns"]).toBe(
            "repeat(4, minmax(0, 1fr))"
        );
        expect(tool.width).toBe("min(44px, 100%)");
        expect(tool.height).toBe("44px");
    });

    it("does not let hidden tooltips widen the scrolling panel", () => {
        const tooltip = declarationsOrEmpty(".nc-description-tool::after");

        expect(tooltip.content).toBeUndefined();
    });
});
