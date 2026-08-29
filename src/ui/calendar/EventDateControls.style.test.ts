import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../../..");
const css = fs.readFileSync(
    path.join(root, "src/ui/calendar/EventDateControls.css"),
    "utf8"
);

describe("event panel schedule refresh styles", () => {
    it("keeps All-day and Repeat as one flat two-column row", () => {
        expect(css).toMatch(
            /\.nc-panel-date-options\s*\{[^}]*display: grid;[^}]*grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\);/s
        );
        expect(css).toMatch(
            /\.nc-panel-date-option\s*\{[^}]*background: transparent !important;/s
        );
        expect(css).toContain(
            ".nc-panel-date-option + .nc-panel-date-option"
        );
    });

    it("makes active All-day use the accent while leaving Repeat understated", () => {
        expect(css).toContain(
            '.nc-panel-date-option[data-date-option="all-day"].nc-active'
        );
        expect(css).toMatch(
            /data-date-option="all-day"[^}]*color: var\(--nc-accent\);[^}]*font-weight: 600;/s
        );
        expect(css).toContain(
            '.nc-panel-date-option[data-date-option="repeat"].nc-active'
        );
    });

    it("removes the obsolete View note footer from the panel", () => {
        expect(css).toMatch(
            /\.nc-event-popup \.nc-panel-foot\s*\{\s*display: none !important;/
        );
    });
});
