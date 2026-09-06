/** @jest-environment jsdom */
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { useCalendarNavigation } from "./useCalendarNavigation";
import { ViewType } from "../types";
import { addDays } from "./CalendarUtils";

/**
 * Le pas de navigation vu depuis le hook, sans dependre de la date reelle : ces
 * tests disent ce que les fleches du clavier declenchent, puisqu'elles appellent
 * exactement `goPrev` / `goNext`.
 */
type Nav = ReturnType<typeof useCalendarNavigation>;

/** Monte le hook seul et rend son etat courant lisible entre deux `act`. */
function mountNavigation(
    view: ViewType,
    firstDay: number,
    dayCount: number
): { nav: () => Nav; unmount: () => void } {
    const host = document.createElement("div");
    let latest!: Nav;
    function Harness() {
        latest = useCalendarNavigation(view, firstDay, dayCount);
        return null;
    }
    act(() => {
        ReactDOM.render(<Harness />, host);
    });
    return {
        nav: () => latest,
        unmount: () =>
            act(() => {
                ReactDOM.unmountComponentAtNode(host);
            }),
    };
}

test.each<[ViewType, number, number]>([
    ["day", 3, 1],
    ["3days", 3, 3],
    ["days", 5, 5],
    ["week", 3, 7],
    ["list", 3, 7],
])("%s avance puis revient au point de départ", (view, count, step) => {
    const { nav, unmount } = mountNavigation(view, 1, count);
    act(() => {
        nav().setCurrentDate(new Date(2026, 9, 24));
    });
    const start = nav().currentDate;
    act(() => {
        nav().goNext();
    });
    expect(nav().currentDate.toDateString()).toBe(
        addDays(start, step).toDateString()
    );
    act(() => {
        nav().goPrev();
    });
    expect(nav().currentDate.toDateString()).toBe(start.toDateString());
    unmount();
});

test("le mois avance sur le mois civil suivant et revient sur le précédent", () => {
    const { nav, unmount } = mountNavigation("month", 1, 3);
    act(() => {
        // Une date en milieu de mois : la vue Mois se cale sur le premier jour.
        nav().setCurrentDate(new Date(2026, 11, 15));
    });
    expect(nav().currentDate.toDateString()).toBe(
        new Date(2026, 11, 1).toDateString()
    );
    act(() => {
        nav().goNext();
    });
    // Le passage d'annee est le seul cas ou un pas de 30 jours se verrait.
    expect(nav().currentDate.toDateString()).toBe(
        new Date(2027, 0, 1).toDateString()
    );
    act(() => {
        nav().goPrev();
    });
    expect(nav().currentDate.toDateString()).toBe(
        new Date(2026, 11, 1).toDateString()
    );
    unmount();
});

test("le pas de la vue « nombre de jours » suit setDaysCount", () => {
    const { nav, unmount } = mountNavigation("days", 1, 3);
    act(() => {
        nav().setCurrentDate(new Date(2026, 9, 24));
    });
    act(() => {
        nav().goNext();
    });
    expect(nav().currentDate.toDateString()).toBe(
        new Date(2026, 9, 27).toDateString()
    );
    act(() => {
        nav().setDaysCount(5);
    });
    act(() => {
        nav().goNext();
    });
    expect(nav().currentDate.toDateString()).toBe(
        new Date(2026, 10, 1).toDateString()
    );
    unmount();
});

test("la vue Semaine cale une date arbitraire sur le début de semaine", () => {
    const { nav, unmount } = mountNavigation("week", 1, 3);
    act(() => {
        // Samedi 24 octobre 2026, semaine commencant le lundi 19.
        nav().setCurrentDate(new Date(2026, 9, 24));
    });
    expect(nav().currentDate.toDateString()).toBe(
        new Date(2026, 9, 19).toDateString()
    );
    unmount();
});

test("après alignToday, une date arbitraire n'est plus recalée", () => {
    const { nav, unmount } = mountNavigation("week", 1, 3);
    act(() => {
        nav().alignToday();
    });
    expect(nav().currentDate.toDateString()).toBe(new Date().toDateString());
    act(() => {
        nav().setCurrentDate(new Date(2026, 9, 24));
    });
    // La fenetre glissante garde la date telle quelle : la recaler sur le lundi
    // 19 ferait cesser la premiere colonne d'etre celle demandee.
    expect(nav().currentDate.toDateString()).toBe(
        new Date(2026, 9, 24).toDateString()
    );
    act(() => {
        nav().goNext();
    });
    expect(nav().currentDate.toDateString()).toBe(
        new Date(2026, 9, 31).toDateString()
    );
    unmount();
});
