import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../../..");
const css = fs.readFileSync(
    path.join(root, "src/ui/calendar/EventDateControls.css"),
    "utf8"
);
const controls = fs.readFileSync(
    path.join(root, "src/ui/calendar/EventDateControls.tsx"),
    "utf8"
);

describe("event panel schedule refresh styles", () => {
    it("keeps All-day and Repeat flat, one per line, with no divider between them", () => {
        expect(css).toMatch(
            /\.nc-panel-date-options\s*\{[^}]*display: grid;[^}]*grid-template-columns: minmax\(0, 1fr\);/s
        );
        expect(css).toMatch(
            /\.nc-panel-date-option\s*\{[^}]*background: transparent !important;/s
        );
        expect(css).not.toContain(
            ".nc-panel-date-option + .nc-panel-date-option"
        );
    });

    it("makes active All-day use a genuinely lit blue icon and stronger label", () => {
        expect(css).toContain(
            '.nc-panel-date-option[data-date-option="all-day"].nc-active'
        );
        expect(css).toMatch(
            /data-date-option="all-day"[^}]*font-weight: 600;/s
        );
        expect(css).toMatch(
            /data-date-option="all-day"[^}]*\.nc-panel-date-option-icon\s*\{[^}]*color: var\(--nc-accent\);/s
        );
        expect(controls).toContain(
            'data-all-day-icon-state={active ? "active" : "idle"}'
        );
        expect(controls).toContain('fill={active ? "currentColor" : "none"}');
    });

    it("leaves Repeat understated when its rule is active", () => {
        expect(css).toContain(
            '.nc-panel-date-option[data-date-option="repeat"].nc-active'
        );
    });

    it("gives the repeat rule the whole line and keeps the series arrows beside it", () => {
        expect(css).toContain(".nc-panel-date-option-line");
        expect(css).toMatch(
            /\.nc-panel-date-option-line > \.nc-panel-date-option\s*\{[^}]*flex: 1;/s
        );
        expect(css).toMatch(/\.nc-series-step-btn:disabled\s*\{[^}]*opacity/s);
        expect(css).not.toMatch(/\.nc-panel-date-option-label[^}]*nowrap/s);
    });

    it("removes the obsolete View note footer from the panel", () => {
        expect(css).toMatch(
            /\.nc-event-popup \.nc-panel-foot\s*\{\s*display: none !important;/
        );
    });
});
