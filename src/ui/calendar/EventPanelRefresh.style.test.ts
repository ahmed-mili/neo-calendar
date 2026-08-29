import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../../..");
const desktop = fs.readFileSync(
    path.join(root, "src/ui/calendar/CalendarPanel.css"),
    "utf8"
);
const mobile = fs.readFileSync(
    path.join(root, "apps/android/src/mobile.css"),
    "utf8"
);
const panel = fs.readFileSync(
    path.join(root, "src/ui/calendar/EventPanel.tsx"),
    "utf8"
);

describe("event panel visual refresh contract", () => {
    it("uses section hairlines instead of a card border between every row", () => {
        expect(desktop).toContain(".nc-panel-section + .nc-panel-section");
        expect(desktop).toContain(
            ".nc-panel-body .nc-panel-row + .nc-panel-row"
        );
        expect(desktop).toMatch(
            /\.nc-panel-body \.nc-panel-row \+ \.nc-panel-row\s*\{\s*border-top: 0;/
        );
        expect(panel).toContain("nc-panel-section-schedule");
        expect(panel).toContain("nc-panel-section-properties");
    });

    it("keeps reminders and description flat at rest", () => {
        expect(desktop).toMatch(
            /\.nc-panel-reminders\s*\{[^}]*background: transparent !important;/s
        );
        expect(desktop).toContain(
            ".nc-panel-row.nc-panel-row-desc:has(.nc-description-toolbar)"
        );
    });

    it("keeps the Android title touch-sized without the old heading weight winning", () => {
        expect(mobile).toContain("NEO_NOTION_PANEL_REFRESH_ANDROID_V1_START");
        expect(mobile).toMatch(
            /\.nc-panel-title-input,[\s\S]*font-size: 16px !important;[\s\S]*font-weight: 400 !important;/
        );
    });
});
