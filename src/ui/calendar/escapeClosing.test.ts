import { escapeClosesEventsPanel } from "./escapeClosing";

const layers = {
    eventsPanelOpen: true,
    overlayOpen: false,
    eventPanelOpen: false,
    hasSelection: false,
};

describe("what Escape closes", () => {
    it("closes the events panel when nothing else is open", () => {
        expect(escapeClosesEventsPanel(layers)).toBe(true);
    });

    it("closes nothing when the panel is not open", () => {
        expect(
            escapeClosesEventsPanel({ ...layers, eventsPanelOpen: false })
        ).toBe(false);
    });

    // A dialog, the settings or the command palette answer Escape themselves.
    // Closing the panel underneath at the same time takes away two things for
    // one press.
    it("leaves the panel alone while something sits on top of it", () => {
        expect(escapeClosesEventsPanel({ ...layers, overlayOpen: true })).toBe(
            false
        );
    });

    it("leaves the panel alone while an event is open", () => {
        expect(
            escapeClosesEventsPanel({ ...layers, eventPanelOpen: true })
        ).toBe(false);
    });

    // Escape already clears a selection. One press, one thing.
    it("leaves the panel alone while events are selected", () => {
        expect(escapeClosesEventsPanel({ ...layers, hasSelection: true })).toBe(
            false
        );
    });
});
