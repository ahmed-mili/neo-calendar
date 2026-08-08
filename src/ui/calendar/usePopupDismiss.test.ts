import { pressOutcome } from "./usePopupDismiss";

/** An element that answers `closest` from the list of ancestors it is given. */
const pressedOn = (...ancestors: string[]) => ({
    closest: (selector: string) => (ancestors.includes(selector) ? {} : null),
});

describe("pressOutcome", () => {
    it("keeps the editor open when the press picks another event", () => {
        expect(pressOutcome(pressedOn("[data-event-id]"))).toBe("keep");
        expect(pressOutcome(pressedOn("[data-draft-preview]"))).toBe("keep");
    });

    it("keeps the editor open for its own body-portaled menus", () => {
        expect(pressOutcome(pressedOn(".nc-select-menu"))).toBe("keep");
        expect(pressOutcome(pressedOn(".nc-datepicker"))).toBe("keep");
        expect(pressOutcome(pressedOn(".nc-cal-select-menu"))).toBe("keep");
        expect(pressOutcome(pressedOn(".nc-link-results-popover"))).toBe(
            "keep"
        );
    });

    it("keeps the editor open while the surrounding app is used", () => {
        expect(pressOutcome(pressedOn(".nc-sidebar"))).toBe("keep");
        expect(pressOutcome(pressedOn(".mod-left-split"))).toBe("keep");
        expect(pressOutcome(pressedOn(".workspace-ribbon"))).toBe("keep");
    });

    /*
     * A press on a day column is what starts drawing an event. Closing alone
     * would leave that press to the grid, so the click meant to dismiss the
     * editor would draw a new event under it — the state this hook exists to
     * prevent.
     */
    it("swallows the press that leaves the editor over a day column", () => {
        expect(pressOutcome(pressedOn(".nc-main", ".nc-timegrid-day"))).toBe(
            "dismiss-and-swallow"
        );
    });

    /*
     * Everything else keeps its click: the toolbar lives inside .nc-main too,
     * and swallowing there would cost the first press on "Today" or on the view
     * menu while an event is open.
     */
    it("closes without swallowing anywhere else", () => {
        expect(pressOutcome(pressedOn(".nc-main"))).toBe("dismiss");
        expect(pressOutcome(pressedOn(".nc-month-cell"))).toBe("dismiss");
        expect(pressOutcome(pressedOn())).toBe("dismiss");
    });
});
