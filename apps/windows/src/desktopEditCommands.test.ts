/** @jest-environment jsdom */
import { addDays, startOfDay } from "../../../src/ui/calendar/CalendarUtils";
import { DisplayEvent } from "../../../src/ui/types";
import {
    captureEditTarget,
    restoreEditTarget,
    visibleEventIds,
    visibleSelectionRange,
} from "./desktopEditCommands";

const startOfDayLocal = startOfDay;
const addDaysLocal = addDays;

const event = (id: string, start: Date, end: Date) =>
    ({ id, start, end } as DisplayEvent);

describe("visibleEventIds", () => {
    test("sélectionne le chevauchement mais pas le tampon", () => {
        const start = new Date(2026, 8, 7);
        const end = new Date(2026, 8, 14);
        expect(
            visibleEventIds(
                [
                    event("avant", new Date(2026, 8, 6), start),
                    event(
                        "traversant",
                        new Date(2026, 8, 6),
                        new Date(2026, 8, 8)
                    ),
                    event("après", end, new Date(2026, 8, 15)),
                ],
                start,
                end
            )
        ).toEqual(["traversant"]);
    });

    test("inclut un évènement ponctuel tombant dans la plage", () => {
        const start = new Date(2026, 8, 7);
        const end = new Date(2026, 8, 14);
        const instant = new Date(2026, 8, 9, 10, 0);
        expect(
            visibleEventIds([event("ponctuel", instant, instant)], start, end)
        ).toEqual(["ponctuel"]);
    });

    test("inclut un évènement multijour même partiellement recouvert", () => {
        const start = new Date(2026, 8, 7);
        const end = new Date(2026, 8, 14);
        expect(
            visibleEventIds(
                [event("multi", new Date(2026, 8, 12), new Date(2026, 8, 20))],
                start,
                end
            )
        ).toEqual(["multi"]);
    });

    test("déduplique un id d'occurrence répété", () => {
        const start = new Date(2026, 8, 7);
        const end = new Date(2026, 8, 14);
        expect(
            visibleEventIds(
                [
                    event("dup", new Date(2026, 8, 8), new Date(2026, 8, 9)),
                    event("dup", new Date(2026, 8, 9), new Date(2026, 8, 10)),
                ],
                start,
                end
            )
        ).toEqual(["dup"]);
    });

    test("une grille sans évènement rend une liste vide", () => {
        expect(
            visibleEventIds([], new Date(2026, 8, 7), new Date(2026, 8, 14))
        ).toEqual([]);
    });
});

/** Une colonne `.nc-timegrid-day[data-date]`, positionnée comme
    `gridColumns.test.ts` sait le faire : un rectangle mesuré, pas déduit. */
function column(date: string, left: number, width = 100): HTMLElement {
    return {
        getAttribute: (name: string) => (name === "data-date" ? date : null),
        getBoundingClientRect: () => ({ left, width }),
    } as unknown as HTMLElement;
}

function scroller(columns: HTMLElement[], clientWidth = 300): HTMLElement {
    return {
        clientWidth,
        getBoundingClientRect: () => ({ left: 0 }),
        querySelectorAll: () => columns,
    } as unknown as HTMLElement;
}

function calendarRoot(scrollerEl: HTMLElement | null): HTMLElement {
    return {
        querySelector: () => scrollerEl,
    } as unknown as HTMLElement;
}

describe("visibleSelectionRange en grille horaire", () => {
    const dayDates = [
        new Date(2026, 8, 7),
        new Date(2026, 8, 8),
        new Date(2026, 8, 9),
        new Date(2026, 8, 10),
    ];

    test("lit les dates DOM après un scroll de 2,5 colonnes", () => {
        // Fenêtre de 300px posée à 250px : seules les colonnes 3 et 4
        // dépassent le seuil minimal de largeur visible (voir gridColumns).
        const shifted = dayDates.map((day, index) =>
            column(day.toISOString(), index * 100 - 250)
        );
        const root = calendarRoot(scroller(shifted));
        const range = visibleSelectionRange(root, true, []);
        expect(range).not.toBeNull();
        // Colonnes 3 et 4 (index 2 et 3) sont les seules à dépasser le seuil
        // minimal de largeur visible : le tampon de scroll partiel écarte
        // les deux premières.
        expect(range?.start).toEqual(startOfDayLocal(dayDates[2]));
        // Fin exclusive : lendemain du dernier jour mesuré.
        expect(range?.end).toEqual(
            addDaysLocal(startOfDayLocal(dayDates[3]), 1)
        );
    });

    test("retombe sur visibleDates quand la mesure DOM est absente", () => {
        const root = calendarRoot(null);
        const visibleDates = [
            new Date(2026, 8, 1),
            new Date(2026, 8, 2),
            new Date(2026, 8, 3),
        ];
        const range = visibleSelectionRange(root, true, visibleDates);
        expect(range?.start).toEqual(new Date(2026, 8, 1));
        expect(range?.end).toEqual(new Date(2026, 8, 4));
    });

    test("vue mois : reprend les 42 cellules de visibleDates, tampon compris", () => {
        const visibleDates = Array.from(
            { length: 42 },
            (_, offset) => new Date(2026, 7, 26 + offset)
        );
        const range = visibleSelectionRange(
            calendarRoot(null),
            false,
            visibleDates
        );
        expect(range?.start).toEqual(visibleDates[0]);
        expect(range?.end).toEqual(new Date(2026, 9, 7));
    });
});

describe("captureEditTarget / restoreEditTarget", () => {
    test("mémorise et restaure la sélection d'un input", () => {
        const input = document.createElement("input");
        input.value = "bonjour le monde";
        document.body.appendChild(input);
        input.focus();
        input.setSelectionRange(3, 8);

        const snapshot = captureEditTarget(document.activeElement);
        expect(snapshot).not.toBeNull();

        // Le focus part ailleurs, comme quand un menu s'ouvre.
        const decoy = document.createElement("button");
        document.body.appendChild(decoy);
        decoy.focus();
        expect(document.activeElement).toBe(decoy);

        expect(restoreEditTarget(snapshot)).toBe(true);
        expect(document.activeElement).toBe(input);
        expect(input.selectionStart).toBe(3);
        expect(input.selectionEnd).toBe(8);

        document.body.removeChild(input);
        document.body.removeChild(decoy);
    });

    test("mémorise et restaure une sélection contenteditable", () => {
        const editable = document.createElement("div");
        editable.setAttribute("contenteditable", "true");
        editable.textContent = "bonjour";
        document.body.appendChild(editable);
        editable.focus();

        const range = document.createRange();
        range.selectNodeContents(editable);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);

        const snapshot = captureEditTarget(editable);
        expect(snapshot).not.toBeNull();

        selection?.removeAllRanges();
        (document.activeElement as HTMLElement | null)?.blur();

        expect(restoreEditTarget(snapshot)).toBe(true);
        expect(document.activeElement).toBe(editable);
        expect(window.getSelection()?.rangeCount).toBe(1);

        document.body.removeChild(editable);
    });

    test("rien de focalisé : aucune cible à capturer", () => {
        document.body.focus();
        expect(captureEditTarget(document.body)).toBeNull();
    });

    test("cible désactivée entre-temps : la restauration échoue proprement", () => {
        const input = document.createElement("input");
        input.value = "abc";
        document.body.appendChild(input);
        input.focus();
        input.setSelectionRange(0, 1);
        const snapshot = captureEditTarget(document.activeElement);

        input.disabled = true;
        expect(restoreEditTarget(snapshot)).toBe(false);

        document.body.removeChild(input);
    });

    test("cible démontée entre-temps : la restauration échoue proprement", () => {
        const input = document.createElement("input");
        input.value = "abc";
        document.body.appendChild(input);
        input.focus();
        const snapshot = captureEditTarget(document.activeElement);

        document.body.removeChild(input);
        expect(restoreEditTarget(snapshot)).toBe(false);
    });

    test("aucune cible mémorisée : restaurer ne fait rien", () => {
        expect(restoreEditTarget(null)).toBe(false);
    });
});
