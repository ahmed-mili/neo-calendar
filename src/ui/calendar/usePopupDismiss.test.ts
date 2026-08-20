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

    /*
     * La ligne de repetition et la question de portee ouvrent leur choix par
     * dessus la feuille, au niveau du body. Absentes de la liste, elles etaient
     * lues comme un depart : la feuille se demontait sous le doigt et l'option
     * choisie n'etait jamais enregistree — la repetition ne changeait pas.
     */
    it("garde le panneau ouvert sur les choix qu'il ouvre lui-même", () => {
        expect(pressOutcome(pressedOn(".nc-choice-overlay"))).toBe("keep");
        expect(pressOutcome(pressedOn(".nc-scope-overlay"))).toBe("keep");
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

describe("ce qui est porté hors du panneau mais lui appartient", () => {
    // La bulle d'un lien contient le bouton « copier ». Elle est portée au
    // niveau du body, donc `popup.contains()` répond non : sans le marqueur,
    // copier une adresse fermait l'événement qu'on était en train de lire.
    it("garde le panneau ouvert sur la bulle d'un lien", () => {
        expect(pressOutcome(pressedOn("[data-nc-popup-portal='true']"))).toBe(
            "keep"
        );
    });

    // Le bandeau « Lien copié » est porté sur le body lui aussi : sa croix ne
    // doit pas emporter l'éditeur avec elle.
    it("garde le panneau ouvert sur le bandeau de confirmation", () => {
        expect(
            pressOutcome(
                pressedOn("[data-nc-popup-portal='true']", ".nc-toast")
            )
        ).toBe("keep");
    });
});
