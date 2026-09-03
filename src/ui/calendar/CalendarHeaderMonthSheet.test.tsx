/** @jest-environment jsdom */

import * as React from "react";
import * as ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import CalendarHeader from "./CalendarHeader";
import { applyLanguage } from "../i18n";

/*
 * Le panneau du mois du téléphone, déroulé par le titre de la barre du haut.
 *
 * La référence est Notion Calendar, dont le panneau ne porte pas de colonne de
 * numéros de semaine : les sept colonnes de jours occupent toute la largeur, et
 * rien ne s'intercale entre le bord et le lundi. Le réglage « Numéros de
 * semaine » continue de valoir partout ailleurs — la barre latérale du bureau
 * le respecte —, mais il ne suit pas jusque dans cette feuille-là, qui n'a que
 * la largeur d'un téléphone à donner à sept colonnes.
 */
describe("le panneau du mois sur le téléphone", () => {
    let host: HTMLDivElement;

    beforeEach(() => {
        applyLanguage("fr");
        document.body.classList.add("nc-platform-android");
        host = document.createElement("div");
        document.body.appendChild(host);
    });

    afterEach(() => {
        act(() => {
            ReactDOM.unmountComponentAtNode(host);
        });
        document.body.classList.remove("nc-platform-android");
        document.body.innerHTML = "";
    });

    const openMonthSheet = (showWeekNumbers: boolean) => {
        act(() => {
            ReactDOM.render(
                <CalendarHeader
                    currentDate={new Date(2026, 8, 2)}
                    firstDay={1}
                    onDateSelect={jest.fn()}
                    viewType="week"
                    onViewTypeChange={jest.fn()}
                    dayCount={7}
                    onSetDayCount={jest.fn()}
                    showWeekNumbers={showWeekNumbers}
                    onToggleWeekNumbers={jest.fn()}
                    onGoPrev={jest.fn()}
                    onGoNext={jest.fn()}
                    onGoToday={jest.fn()}
                    onOpenSettings={jest.fn()}
                    onOpenSearch={jest.fn()}
                    onToggleSidebar={jest.fn()}
                    visibleDates={[new Date(2026, 8, 2)]}
                />,
                host
            );
        });
        act(() => {
            host.querySelector<HTMLElement>(
                ".nc-android-month-button"
            )?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        return host.querySelector<HTMLElement>(".nc-android-month-sheet");
    };

    it("opens on the month title", () => {
        expect(openMonthSheet(false)).not.toBeNull();
    });

    it("gives its seven columns the whole width, as Notion does", () => {
        const sheet = openMonthSheet(true);

        expect(sheet?.querySelector(".nc-mini-cal-week")).toBeNull();
        expect(sheet?.querySelector(".nc-mini-cal-week-corner")).toBeNull();
        expect(sheet?.querySelector(".nc-with-week-numbers")).toBeNull();
    });

    it("looks the same whether or not the setting is on", () => {
        const withSetting = openMonthSheet(true)?.innerHTML;
        act(() => {
            ReactDOM.unmountComponentAtNode(host);
        });
        const without = openMonthSheet(false)?.innerHTML;

        expect(withSetting).toBe(without);
    });
});
