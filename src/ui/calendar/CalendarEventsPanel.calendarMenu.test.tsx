/** @jest-environment jsdom */
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import CalendarEventsPanel from "./CalendarEventsPanel";
import { applyLanguage, t } from "../i18n";

/*
 * Le menu « ⋯ » du panneau rend ses lignes par le même composant que celui de
 * la colonne (`CalendarItemMenu`) plutôt que par sa propre implémentation. Ce
 * que l'application ajoute (rappel, liens ICS, horaires de prière) lui arrive
 * tout construit par `extraMenuItems`, avant « Retirer la vue de la liste ».
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
            .querySelectorAll(
                ".nc-cep-slot, .nc-cep-popover, .nc-cal-menu, .nc-cal-menu-overlay"
            )
            .forEach((node) => node.remove());
    });

    /** Ouvre le menu « ⋯ » du panneau et rend ses lignes, portées sur body. */
    const openMenu = (extra: Record<string, unknown>, name = "Cours") => {
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
                '.nc-cal-menu [role="menuitem"]'
            )
        );
    };

    it("rend son menu par le même composant que la colonne", () => {
        const rows = openMenu({});
        expect(rows.map((r) => r.textContent)).toEqual(
            expect.arrayContaining([
                expect.stringContaining(t("Color")),
                expect.stringContaining(t("Set as default")),
                expect.stringContaining(t("Show only this view")),
                expect.stringContaining(t("Show totals")),
                expect.stringContaining(t("Remove view from list")),
            ])
        );
    });

    it("insère les entrées de l'application avant « Retirer la vue »", () => {
        const rows = openMenu({
            extraMenuItems: () => [
                { key: "reminder", label: t("Reminder"), onClick: () => {} },
            ],
        });
        const texts = rows.map((r) => r.textContent ?? "");
        const reminder = texts.findIndex((x) => x.includes(t("Reminder")));
        expect(reminder).toBeGreaterThan(-1);
        expect(texts[texts.length - 1]).toContain(t("Remove view from list"));
        expect(reminder).toBeLessThan(texts.length - 1);
    });

    it("coche « Afficher les totaux » une fois choisi", () => {
        const first = openMenu({});
        const totals = first.find((r) =>
            r.textContent?.includes(t("Show totals"))
        )!;
        expect(totals.getAttribute("aria-checked")).toBe("false");
        act(() => totals.click());
        // Le clic referme le menu ; le rouvrir montre la coche.
        const trigger = document.body.querySelector(
            `[data-nc-tooltip="${t("More options")}"]`
        );
        act(() => {
            (trigger as HTMLElement).dispatchEvent(
                new MouseEvent("click", { bubbles: true })
            );
        });
        const again = Array.from(
            document.body.querySelectorAll<HTMLButtonElement>(
                '.nc-cal-menu [role="menuitem"]'
            )
        );
        expect(
            again
                .find((r) => r.textContent?.includes(t("Show totals")))!
                .getAttribute("aria-checked")
        ).toBe("true");
    });

    it("n'a rien de plus quand la surface ne passe rien", () => {
        expect(
            openMenu({}).some((r) => r.textContent?.includes(t("Reminder")))
        ).toBe(false);
    });
});
