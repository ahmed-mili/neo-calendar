/** @jest-environment jsdom */
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import CalendarEventsPanel from "./CalendarEventsPanel";
import { applyLanguage, t } from "../i18n";

/*
 * Le menu du panneau propose les mêmes réglages que celui de la colonne, et
 * doit donc les proposer aux mêmes conditions : les horaires de prière au seul
 * calendrier qui porte ce sujet, le rappel à tous.
 */
describe("le menu de calendrier du panneau d'évènements", () => {
    let host: HTMLDivElement;

    const baseProps = (name: string) => ({
        calendar: {
            id: "cal-1",
            name,
            color: "#4a7dfc",
            type: "local" as const,
            editable: true,
        },
        events: [],
        timeFormat24h: true,
        defaultCalendarId: "cal-1",
        pinned: false,
        onEventClick: jest.fn(),
        onClose: jest.fn(),
        onTogglePinned: jest.fn(),
        onAddEvent: jest.fn(),
        onSetDefault: jest.fn(),
        onShowOnly: jest.fn(),
        onRemove: jest.fn(),
        onColorChange: jest.fn(),
        open: true,
        onPanelDragTarget: jest.fn(),
        onPanelDrop: jest.fn(),
    });

    beforeEach(() => {
        applyLanguage("fr");
        host = document.createElement("div");
        document.body.appendChild(host);
    });

    afterEach(() => {
        act(() => {
            ReactDOM.unmountComponentAtNode(host);
        });
        host.remove();
        document
            .querySelectorAll(".nc-cep-slot, .nc-cep-popover")
            .forEach((node) => node.remove());
    });

    const openMenu = (extra: Record<string, unknown>, name = "Cours") => {
        // Repartir d'un panneau fermé : le déclencheur bascule le menu, et
        // deux appels de suite le rouvriraient puis le refermeraient.
        act(() => {
            ReactDOM.unmountComponentAtNode(host);
        });
        act(() => {
            ReactDOM.render(
                React.createElement(CalendarEventsPanel, {
                    ...baseProps(name),
                    ...extra,
                } as React.ComponentProps<typeof CalendarEventsPanel>),
                host
            );
        });
        const trigger = document.body.querySelector(
            `[data-nc-tooltip="${t("More options")}"]`
        );
        act(() => {
            (trigger as HTMLElement)?.dispatchEvent(
                new MouseEvent("click", { bubbles: true })
            );
        });
        return Array.from(
            document.body.querySelectorAll<HTMLButtonElement>(
                ".nc-cep-menu-row"
            )
        );
    };

    const has = (rows: HTMLButtonElement[], label: string) =>
        rows.some((row) => row.textContent?.includes(label));

    it("n'offre les horaires de prière qu'au calendrier qui porte ce nom", () => {
        expect(
            has(
                openMenu({ onManagePrayerTimes: jest.fn() }, "Cours"),
                t("Prayer times")
            )
        ).toBe(false);
        expect(
            has(
                openMenu({ onManagePrayerTimes: jest.fn() }, "Islam"),
                t("Prayer times")
            )
        ).toBe(true);
    });

    it("ouvre le rappel du calendrier depuis son menu", () => {
        const onManageReminder = jest.fn();
        const rows = openMenu({ onManageReminder });
        const entry = rows.find((row) =>
            row.textContent?.includes(t("Reminder"))
        );
        expect(entry).toBeTruthy();
        act(() => {
            entry?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        expect(onManageReminder).toHaveBeenCalledWith("cal-1");
    });

    it("laisse le rappel de côté quand la surface ne sait pas l'enregistrer", () => {
        expect(has(openMenu({}), t("Reminder"))).toBe(false);
    });
});
