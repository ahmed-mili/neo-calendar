import * as fs from "fs";
import * as path from "path";
import { declarationsFor } from "./cssText";

const mobile = fs.readFileSync(path.join(__dirname, "mobile.css"), "utf8");
const shared = fs.readFileSync(
    path.join(
        __dirname,
        "..",
        "..",
        "..",
        "src",
        "ui",
        "calendar",
        "CalendarVariables.css"
    ),
    "utf8"
);

const BLOCK = "body.nc-platform-android .nc-event-block";
const DROP = "body.nc-platform-android .nc-drop-preview";

describe("the shape of an event on a phone", () => {
    /*
     * A bar three quarters of an hour tall is about 45px on this platform, and
     * an 8px corner on 45px of height is a quarter of the block rounded away at
     * each end — enough that a half-hour event reads as a lozenge rather than
     * as a span of time. Half that leaves the corner visible without softening
     * the block into a pill.
     */
    it("is barely rounded", () => {
        expect(declarationsFor(mobile, BLOCK)["border-radius"]).toBe("4px");
    });

    // The frame showing where a dragged block will land is drawn where the
    // block will be. A different corner there and the landing does not look
    // like the thing that lands in it.
    it("is the shape its landing frame is drawn with", () => {
        expect(declarationsFor(mobile, DROP)["border-radius"]).toBe(
            declarationsFor(mobile, BLOCK)["border-radius"]
        );
    });

    // The desktop keeps the shared value; only the phone is asked to be
    // squarer, so the variable stays where every other surface reads it.
    it("leaves the shared corner alone", () => {
        expect(shared).toContain("--nc-event-radius: 8px");
    });
});
