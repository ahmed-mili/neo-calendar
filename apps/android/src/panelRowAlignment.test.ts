import * as fs from "fs";
import * as path from "path";
import { declarationsFor } from "./cssText";

const mobile = fs.readFileSync(path.join(__dirname, "mobile.css"), "utf8");
const desktop = fs.readFileSync(
    path.join(__dirname, "..", "..", "windows", "src", "App.css"),
    "utf8"
);

describe("where a panel row starts on a phone", () => {
    /*
     * "Add links and attachments" is wrapped in a container of its own, and
     * that container carried the same 2px 8px inset the description row has —
     * except the row inside it IS a .nc-panel-row and had already been given
     * the phone's margins. The two added up: measured on the emulator, the
     * links icon sat at 36px and every other row's at 28px, so one line of the
     * sheet was out of line with all the others.
     */
    it("is not decided twice for the links row", () => {
        const wrapper = declarationsFor(
            mobile,
            "body.nc-platform-android .nc-links-attachments"
        );
        expect(wrapper["margin-left"]).toBe("0");
        expect(wrapper["margin-right"]).toBe("0");
    });

    // What the rule above is there to cancel. If this inset ever goes away on
    // its own, the override becomes dead weight rather than a fix.
    it("is what the desktop container asks for and the phone does not want", () => {
        expect(declarationsFor(desktop, ".nc-links-attachments").margin).toBe(
            "2px 8px"
        );
    });
});

const ICON_BTN = "body.nc-platform-android .nc-panel-icon-btn";
const DRAFT_ICON_BTN =
    "body.nc-platform-android .nc-event-popup.nc-event-popup--android-draft .nc-panel-icon-btn";
const HEADER_GLYPH =
    "body.nc-platform-android .nc-panel-header .nc-panel-icon-btn svg";

describe("the X that closes a sheet", () => {
    /*
     * It measured 38px with a 16px glyph inside it, in the corner of a sheet
     * held at arm's length — reported as hard to hit, and it was. Forty-eight
     * is what a thumb is drawn to, and the mark inside it grows with it: a
     * small glyph in a large box is aimed at as though it were the size of the
     * glyph.
     */
    it("is big enough to be aimed at", () => {
        expect(declarationsFor(mobile, ICON_BTN).width).toBe("48px");
        expect(declarationsFor(mobile, ICON_BTN).height).toBe("48px");
    });

    // The draft sheet restated the size a few hundred lines later, and later is
    // what reaches the screen here.
    it("is the same size on the sheet a new event opens in", () => {
        expect(declarationsFor(mobile, DRAFT_ICON_BTN).width).toBe(
            declarationsFor(mobile, ICON_BTN).width
        );
    });

    it("carries a mark you can see from the same distance", () => {
        expect(declarationsFor(mobile, HEADER_GLYPH).width).toBe("22px");
    });
});
