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

const PREVIEW =
    'body.nc-platform-android .nc-selection-mirror[data-draft-preview="true"]';
const HANDLE = `${PREVIEW} .nc-draft-preview-resize`;
const TOUCH = `${HANDLE}::after`;

describe("the outline a draft is placed with", () => {
    /*
     * A draft is the event before it exists, so it is drawn as that event will
     * be drawn. It sat flush against the day's rule instead, where every block
     * is held 4px clear of it, so dropping the draft nudged the bar sideways —
     * the calendar looked as though it were correcting the placement rather
     * than keeping it.
     */
    it("clears the day's rule the way a block does", () => {
        expect(declarationsFor(mobile, PREVIEW)["margin-left"]).toBe(
            declarationsFor(mobile, BLOCK)["margin-left"]
        );
    });

    it("is cornered like the block it becomes", () => {
        expect(declarationsFor(mobile, PREVIEW)["border-radius"]).toBe(
            declarationsFor(mobile, BLOCK)["border-radius"]
        );
    });

    /*
     * The two grips were 20px across on a bar barely 26px tall: they read as
     * the thing being placed rather than as handles on it. Small enough to see
     * past, and the invisible square that catches the finger is untouched — it
     * is five times the size and does all the catching.
     */
    it("is gripped by something smaller than what it grips", () => {
        expect(declarationsFor(mobile, HANDLE).width).toBe("12px");
        expect(declarationsFor(mobile, HANDLE).height).toBe("12px");
        expect(declarationsFor(mobile, TOUCH).width).toBe("58px");
    });
});
