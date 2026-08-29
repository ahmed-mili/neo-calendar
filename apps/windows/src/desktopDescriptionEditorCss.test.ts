import * as fs from "fs";
import * as path from "path";

const css = fs.readFileSync(
    path.join(__dirname, "desktopDescriptionEditor.css"),
    "utf8"
);

describe("desktop Description icon transition", () => {
    it("keeps the Lines icon at rest and morphs its slot into a + with transform transitions", () => {
        expect(css).toContain(
            '.nc-panel-row-desc\n    > .nc-panel-row-icon[data-nc-description-action="add"]'
        );
        expect(css).toContain("transition: transform 180ms ease");
        expect(css).toContain("transform: scale(0.55) rotate(90deg)");
        expect(css).toContain(
            "transform: translate(-50%, -50%) scale(1) rotate(0deg)"
        );
    });

    it("does not paint the formatting toolbar until the + menu is opened", () => {
        expect(css).toContain(
            ".nc-description-section .nc-description-toolbar {\n    display: none !important;"
        );
        expect(css).toContain(".nc-description-menu-open");
        expect(css).toContain("position: fixed");
    });
});
