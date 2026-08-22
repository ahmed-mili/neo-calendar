import { updateControlState } from "./updateControl";

describe("what the update control is showing", () => {
    /*
     * The update downloads by itself now, so the control has one job at a time:
     * count while it comes down, then offer to install it. Nothing to press
     * while it downloads — pressing would only interrupt what is already
     * happening.
     */
    it("counts while the update comes down", () => {
        expect(updateControlState({ percent: 0, ready: "" })).toEqual({
            kind: "downloading",
            label: "0 %",
        });
        expect(updateControlState({ percent: 63, ready: "" })).toEqual({
            kind: "downloading",
            label: "63 %",
        });
    });

    /*
     * A server that never says how big the file is leaves nothing honest to
     * count. The control spins rather than inventing a number that would stick
     * at 0 % and look broken.
     */
    it("spins when nobody said how big the file is", () => {
        expect(updateControlState({ percent: -1, ready: "" })).toEqual({
            kind: "downloading",
            label: null,
        });
    });

    it("offers to install once it is down", () => {
        expect(updateControlState({ percent: null, ready: "1.50.0" })).toEqual({
            kind: "ready",
            label: "1.50.0",
        });
    });

    /*
     * Both sides announce the version as soon as they have FOUND it, long
     * before it is down. What says the download is over is the download
     * stopping, not the counter reaching 100 — a file can sit at 100 % while it
     * is being verified.
     */
    it("keeps counting until the download itself stops", () => {
        expect(updateControlState({ percent: 100, ready: "1.50.0" })).toEqual({
            kind: "downloading",
            label: "100 %",
        });
        expect(
            updateControlState({ percent: null, ready: "1.50.0" }).kind
        ).toBe("ready");
    });

    /*
     * And nothing at all the rest of the time. A control that says "up to date"
     * is a control asking to be read on every launch to learn that nothing has
     * happened.
     */
    it("is not there when there is nothing to say", () => {
        expect(updateControlState({ percent: null, ready: "" })).toEqual({
            kind: "idle",
            label: null,
        });
    });
});
