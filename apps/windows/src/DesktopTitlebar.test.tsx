/** @jest-environment jsdom */
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import CalendarLayout from "../../../src/ui/calendar/CalendarLayout";
import DesktopTitlebar from "./DesktopTitlebar";
import { DesktopCommands } from "./desktopCommands";
import { applyLanguage, t } from "../../../src/ui/i18n";

/*
 * La barre unifiée, montée comme dans l'application : le layout partagé, son
 * en-tête réel, et un shell simulé qui tient le slot.
 *
 * Ce qui est éprouvé ici est un COMPTE. La barre reprend des contrôles qui
 * existaient déjà ailleurs — Today, le sélecteur de vue, la bascule, la
 * recherche, la version — et le seul défaut qu'elle puisse introduire est d'en
 * laisser deux exemplaires à l'écran.
 */

const commands: DesktopCommands = {
    previous: { enabled: true, run: jest.fn() },
    next: { enabled: true, run: jest.fn() },
};

let host: HTMLDivElement;
let slot: HTMLDivElement;

const layoutProps = (): React.ComponentProps<typeof CalendarLayout> => ({
    currentDate: new Date(2026, 8, 2),
    viewType: "list",
    onViewTypeChange: jest.fn(),
    dayCount: 7,
    onSetDayCount: jest.fn(),
    showWeekNumbers: false,
    onToggleWeekNumbers: jest.fn(),
    onGoPrev: jest.fn(),
    onGoNext: jest.fn(),
    onGoToday: jest.fn(),
    onOpenSettings: jest.fn(),
    onShiftDays: jest.fn(),
    onShiftMonths: jest.fn(),
    onNewEvent: jest.fn(),
    events: [],
    calendarSources: [],
    visibleDates: [new Date(2026, 8, 2)],
    firstDay: 1,
    timeFormat24h: true,
    sidebarVisible: true,
    onToggleSidebar: jest.fn(),
    onEventClick: jest.fn(),
    onEventDrag: jest.fn(async () => true),
    onEventResize: jest.fn(async () => true),
    onSelectRange: jest.fn(),
    onMonthDayClick: jest.fn(),
    onContextMenu: jest.fn(),
    onToggleTask: jest.fn(async () => true),
    onDateSelect: jest.fn(),
    hiddenCalendars: new Set<string>(),
    onToggleCalendar: jest.fn(),
    defaultCalendarId: "",
    soloCalendarId: null,
    onSetDefaultCalendar: jest.fn(),
    onShowOnly: jest.fn(),
    tasks: [],
    today: "2026-09-02",
    onAddTask: jest.fn(),
    onQuickAdd: jest.fn(),
    onOpenSearch: jest.fn(),
    onAddCalendar: jest.fn(),
    onRenameCalendar: jest.fn(async () => {}),
    onEditCalendarLink: jest.fn(),
    onDeleteCalendar: jest.fn(),
    onColorChange: jest.fn(),
    onReorderCalendars: jest.fn(),
    onOpenCalendarFolder: jest.fn(),
    onOpenRootFolder: jest.fn(),
    onCalendarClick: jest.fn(),
    selectedCalendar: null,
    panelEvents: [],
    onAddPanelEvent: jest.fn(),
    onCloseEventsPanel: jest.fn(),
    onPanelEventClick: jest.fn(),
    onAddTimezone: jest.fn(),
    onRemoveTimezone: jest.fn(),
    allDayCollapsed: false,
    onToggleAllDayCollapsed: jest.fn(),
    panelPreview: null,
    onPanelDragTarget: jest.fn(),
    onPanelDrop: jest.fn(),
});

const render = (
    overrides: Partial<React.ComponentProps<typeof CalendarLayout>> = {},
    withSlot = true
) => {
    const props = { ...layoutProps(), ...overrides };
    act(() => {
        ReactDOM.render(
            <CalendarLayout
                {...props}
                desktopTitlebar={
                    withSlot
                        ? (controls) =>
                              ReactDOM.createPortal(
                                  <DesktopTitlebar
                                      controls={controls}
                                      commands={commands}
                                      sidebarVisible={props.sidebarVisible}
                                      onToggleSidebar={props.onToggleSidebar}
                                      onOpenSearch={props.onOpenSearch}
                                      onNewEvent={props.onNewEvent}
                                  />,
                                  slot
                              )
                        : undefined
                }
            />,
            host
        );
    });
};

const countText = (text: string): number =>
    Array.from(document.querySelectorAll("button, span, div")).filter(
        (node) => node.textContent === text && node.children.length === 0
    ).length;

const countSelector = (selector: string): number =>
    document.querySelectorAll(selector).length;

beforeEach(() => {
    applyLanguage("fr");
    host = document.createElement("div");
    slot = document.createElement("div");
    slot.id = "nc-desktop-titlebar-slot";
    document.body.appendChild(slot);
    document.body.appendChild(host);
});

afterEach(() => {
    act(() => {
        ReactDOM.unmountComponentAtNode(host);
    });
    document.body.classList.remove("nc-platform-android");
    document.body.innerHTML = "";
});

describe("un seul exemplaire de chaque contrôle", () => {
    it("ne laisse qu'un Today, un sélecteur de vue et deux flèches", () => {
        render();
        expect(countText(t("Today"))).toBe(1);
        expect(countSelector(".nc-view-dropdown")).toBe(1);
        expect(countSelector(".nc-header")).toBe(1);
        expect(countSelector(`[aria-label="${t("Previous")}"]`)).toBe(1);
        expect(countSelector(`[aria-label="${t("Next")}"]`)).toBe(1);
    });

    it("ne laisse qu'une bascule, une recherche et une création", () => {
        render();
        expect(countSelector(`[aria-label="${t("Toggle sidebar")}"]`)).toBe(1);
        expect(countSelector(`[aria-label="${t("Open command menu")}"]`)).toBe(
            1
        );
        expect(countSelector(`[aria-label="${t("New event")}"]`)).toBe(1);
        expect(countSelector(".nc-app-menu-trigger")).toBe(1);
    });

    it("retire de l'en-tête ce que la barre porte déjà", () => {
        render();
        // La bascule de gauche part : la barre porte la sienne.
        expect(countSelector(".nc-header-left")).toBe(0);
        // L'engrenage, lui, RESTE, et en UN seul exemplaire — le menu porte
        // « Paramètres… » en plus, mais un engrenage introuvable valait pire
        // qu'un doublon de chemin. Tranché par Ahmed le 2026-09-07 après
        // l'avoir vu tourner.
        expect(countSelector(".nc-header .nc-btn-settings")).toBe(1);
        // La version et la pastille de mise à jour ne sont plus dans la
        // colonne : la barre les porte.
        expect(countSelector(".nc-sidebar-top-bar")).toBe(0);
        expect(countSelector(".nc-sidebar-version")).toBe(0);
    });

    it("laisse le titre du mois sous la barre, jamais dedans", () => {
        render();
        const title = document.querySelector(".nc-month-title")!;
        expect(title).not.toBeNull();
        expect(slot.contains(title)).toBe(false);
        expect(document.querySelector(".nc-main")!.contains(title)).toBe(true);
    });
});

describe("la barre latérale repliée", () => {
    it("garde menu, recherche et bascule à portée", () => {
        render({ sidebarVisible: false });
        expect(countSelector(".nc-app-menu-trigger")).toBe(1);
        expect(countSelector(`[aria-label="${t("Open command menu")}"]`)).toBe(
            1
        );
        expect(countSelector(`[aria-label="${t("Toggle sidebar")}"]`)).toBe(1);
        expect(countText(t("Today"))).toBe(1);
        expect(
            slot
                .querySelector(".nc-desktop-toolbar__left")!
                .getAttribute("data-sidebar")
        ).toBe("closed");
    });
});

describe("sans slot", () => {
    it("rend l'en-tête à sa place d'origine, engrenage et bascule compris", () => {
        render({}, false);
        expect(slot.childNodes).toHaveLength(0);
        expect(countSelector(".nc-main > .nc-header")).toBe(1);
        expect(countSelector(".nc-header-left")).toBe(1);
        expect(countSelector(".nc-header .nc-btn-settings")).toBe(1);
        // La colonne reprend sa barre du haut, sa version et sa recherche.
        expect(countSelector(".nc-sidebar-top-bar")).toBe(1);
        expect(countText(t("Today"))).toBe(1);
    });

    it("laisse Android exactement comme il était", () => {
        document.body.classList.add("nc-platform-android");
        render({}, false);
        expect(countSelector(".nc-header--android")).toBe(1);
        expect(countSelector(".nc-android-appbar")).toBe(1);
        expect(countSelector(".nc-app-menu-trigger")).toBe(0);
        expect(countSelector(".nc-sidebar-top-bar")).toBe(1);
    });
});
