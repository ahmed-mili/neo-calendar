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
