import * as fs from "fs";
import * as path from "path";

const css = fs.readFileSync(
    path.join(__dirname, "desktopDescriptionEditor.css"),
    "utf8"
);
const normalizedCss = css.replace(/\s+/g, " ").trim();

const cssContains = (snippet: string) =>
    expect(normalizedCss).toContain(snippet.replace(/\s+/g, " ").trim());

describe("desktop Description icon transition", () => {
    it("keeps the Lines icon at rest and morphs its slot into a + with transform transitions", () => {
        cssContains(
            '.nc-panel-row-desc\n    > .nc-panel-row-icon[data-nc-description-action="add"]'
        );
        cssContains("transition: transform 180ms ease");
        cssContains("transform: scale(0.55) rotate(90deg)");
        cssContains(
            "transform: translate(-50%, -50%) scale(1) rotate(0deg)"
        );
    });

    it("does not paint the formatting toolbar until the + menu is opened", () => {
        cssContains(
            ".nc-description-section .nc-description-toolbar {\n    display: none !important;"
        );
        cssContains(".nc-description-menu-open");
        cssContains("position: fixed");
    });
});
