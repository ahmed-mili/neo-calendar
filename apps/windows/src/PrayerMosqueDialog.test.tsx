/** @jest-environment jsdom */
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import PrayerMosqueDialog from "./PrayerMosqueDialog";
import { PRAYER_TIMETABLES } from "../../../src/ui/calendar/prayerTimetables";
import { applyLanguage } from "../../../src/ui/i18n";

describe("PrayerMosqueDialog", () => {
    let host: HTMLDivElement;
    let chosen: Array<string | null>;

    beforeEach(() => {
        applyLanguage("fr");
        chosen = [];
        host = document.createElement("div");
        document.body.appendChild(host);
    });

    afterEach(() => {
        act(() => {
            ReactDOM.unmountComponentAtNode(host);
        });
        host.remove();
        document
            .querySelectorAll(".nc-prayer-backdrop")
            .forEach((node) => node.remove());
    });

    const render = (mosqueId: string | null = null) => {
        act(() => {
            ReactDOM.render(
                React.createElement(PrayerMosqueDialog, {
                    open: true,
                    calendarName: "الْإِسْلَامُ",
                    mosqueId,
                    onClose: () => {},
                    onChoose: (id) => chosen.push(id),
                }),
                host
            );
        });
    };

    const options = () =>
        Array.from(
            document.querySelectorAll<HTMLButtonElement>('[role="radio"]')
        );

    it("offers every mosque, plus a way to follow none", () => {
        render();
        expect(options()).toHaveLength(PRAYER_TIMETABLES.length + 1);
        expect(options()[0].textContent).toContain("Aucun horaire");
        for (const timetable of PRAYER_TIMETABLES) {
            expect(document.body.textContent).toContain(timetable.name);
        }
    });

    /*
     * L'année que la table couvre est affichée parce qu'un calendrier importé
     * pour 2026 ne dira rien de 2027 : sans elle, une grille sans traits au
     * 1er janvier ressemblerait à une panne plutôt qu'à un PDF à réimporter.
     */
    it("says which year each timetable covers, and its Jumu'a sessions", () => {
        render();
        const first = PRAYER_TIMETABLES[0];
        const row = options().find((option) =>
            option.textContent?.includes(first.name)
        );
        expect(row?.textContent).toContain(String(first.year));
        expect(row?.textContent).toContain(first.jumua[0]);
    });

    it("marks the mosque already followed", () => {
        const id = PRAYER_TIMETABLES[1].id;
        render(id);
        const selected = options().filter(
            (option) => option.getAttribute("aria-checked") === "true"
        );
        expect(selected).toHaveLength(1);
        expect(selected[0].textContent).toContain(PRAYER_TIMETABLES[1].name);
    });

    it("hands back the chosen mosque, and null for none", () => {
        render();
        act(() => {
            options()[1].click();
        });
        expect(chosen).toEqual([PRAYER_TIMETABLES[0].id]);

        render(PRAYER_TIMETABLES[0].id);
        act(() => {
            options()[0].click();
        });
        expect(chosen).toEqual([PRAYER_TIMETABLES[0].id, null]);
    });

    it("says what the lines will be and how to see the whole day", () => {
        render();
        const hint = document.querySelector(".nc-prayer-dialog__hint");
        expect(hint?.textContent).toContain("prochaine prière");
        expect(hint?.textContent).toContain("P");
    });
});
