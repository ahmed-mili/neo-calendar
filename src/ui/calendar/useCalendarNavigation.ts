import { useState, useCallback } from "react";
import { ViewType } from "../types";
import { addDays, getWeekStart } from "./CalendarUtils";

function alignToView(date: Date, view: ViewType, firstDay: number): Date {
    switch (view) {
        case "week":
        case "list":
            return getWeekStart(date, firstDay);
        case "month":
            return new Date(date.getFullYear(), date.getMonth(), 1);
        case "day":
        case "3days":
        case "days":
        default:
            return date;
    }
}

export function useCalendarNavigation(
    initialView: ViewType,
    firstDay: number = 0
) {
    const [currentDate, setCurrentDate] = useState<Date>(() =>
        alignToView(new Date(), initialView, firstDay)
    );
    const [viewType, setViewType] = useState<ViewType>(initialView);
    // Span of the custom "Number of days" view; only meaningful when
    // viewType === "days". Kept in memory (not persisted) so switching counts
    // never triggers a settings save / cache rebuild.
    const [dayCount, setDayCount] = useState<number>(3);

    // Ancrage de la plage visible. "period" est le comportement classique : la
    // vue Semaine se cale sur le debut de semaine, la vue Mois sur le premier du
    // mois. "today" est une fenetre glissante dont la premiere colonne est
    // aujourd'hui. En memoire seulement : un rechargement repart en "period".
    const [anchor, setAnchor] = useState<"period" | "today">("period");

    // Un seul point de decision : en mode fenetre glissante, aucune date n'est
    // recalee, sinon la premiere colonne cesserait d'etre aujourd'hui.
    const align = useCallback(
        (date: Date, view: ViewType) =>
            anchor === "today" ? date : alignToView(date, view, firstDay),
        [anchor, firstDay]
    );

    const goToday = useCallback(() => {
        // Le bouton Today est le chemin de retour au calendrier classique.
        setAnchor("period");
        setCurrentDate(alignToView(new Date(), viewType, firstDay));
    }, [viewType, firstDay]);

    const alignToday = useCallback(() => {
        // En vue Mois une fenetre glissante n'a pas de sens : on se contente de
        // revenir sur le mois courant.
        if (viewType === "month") {
            setAnchor("period");
            setCurrentDate(alignToView(new Date(), viewType, firstDay));
            return;
        }
        setAnchor("today");
        setCurrentDate(new Date());
    }, [viewType, firstDay]);

    const goPrev = useCallback(() => {
        setCurrentDate((d) => {
            switch (viewType) {
                case "day":
                    return addDays(d, -1);
                case "3days":
                    return addDays(d, -3);
                case "days":
                    return addDays(d, -dayCount);
                case "week":
                case "list":
                    return addDays(d, -7);
                case "month":
                    return new Date(d.getFullYear(), d.getMonth() - 1, 1);
                default:
                    return addDays(d, -7);
            }
        });
    }, [viewType, dayCount]);

    const goNext = useCallback(() => {
        setCurrentDate((d) => {
            switch (viewType) {
                case "day":
                    return addDays(d, 1);
                case "3days":
                    return addDays(d, 3);
                case "days":
                    return addDays(d, dayCount);
                case "week":
                case "list":
                    return addDays(d, 7);
                case "month":
                    return new Date(d.getFullYear(), d.getMonth() + 1, 1);
                default:
                    return addDays(d, 7);
            }
        });
    }, [viewType, dayCount]);

    const shiftDays = useCallback(
        (days: number) => setCurrentDate((d) => addDays(d, days)),
        []
    );

    const shiftMonths = useCallback(
        (months: number) =>
            setCurrentDate(
                (d) => new Date(d.getFullYear(), d.getMonth() + months, 1)
            ),
        []
    );

    // Re-snap when an external consumer sets an arbitrary date (MiniCalendar etc.)
    const setCurrentDateAligned = useCallback(
        (date: Date) => setCurrentDate(align(date, viewType)),
        [align, viewType]
    );

    // Re-snap when switching views (avoid misaligned dates)
    const setViewTypeWithAlign = useCallback(
        (v: ViewType) => {
            setViewType(v);
            setCurrentDate((d) => align(d, v));
        },
        [align]
    );

    /**
     * Land on a given date in a given view, in one go — opening the day behind
     * a month cell, say.
     *
     * Doing it with setCurrentDate + setViewType instead does NOT work:
     * setCurrentDate aligns to whatever view is current when it's called, so
     * from the month view it snaps the date back to the 1st of the month before
     * the view has changed. Both values have to be decided against the TARGET
     * view, which is what this does.
     */
    const goToDateInView = useCallback(
        (date: Date, v: ViewType) => {
            setViewType(v);
            setCurrentDate(alignToView(date, v, firstDay));
        },
        [firstDay]
    );

    // Switch to the custom "Number of days" view with a given span (clamped to a
    // sane range). Used by the header's "Number of days" submenu.
    const setDaysCount = useCallback(
        (n: number) => {
            const count = Math.max(1, Math.min(60, Math.round(n)));
            setDayCount(count);
            setViewType("days");
            setCurrentDate((d) => align(d, "days"));
        },
        [align]
    );

    return {
        currentDate,
        setCurrentDate: setCurrentDateAligned,
        viewType,
        setViewType: setViewTypeWithAlign,
        goToDateInView,
        dayCount,
        setDaysCount,
        goToday,
        alignToday,
        goPrev,
        goNext,
        shiftDays,
        shiftMonths,
    };
}
