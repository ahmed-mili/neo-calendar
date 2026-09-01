/** @jest-environment jsdom */
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import CalendarEventsPanel from "./CalendarEventsPanel";
import { DisplayEvent } from "../types";
import { applyLanguage } from "../i18n";

function event(overrides: Partial<DisplayEvent> = {}): DisplayEvent {
    return {
        id: "event-1",
        title: "Cours",
        start: new Date("2026-09-02T09:00:00"),
        end: new Date("2026-09-02T10:00:00"),
        allDay: false,
        color: "#4a7dfc",
        editable: false,
        calendarId: "cal-1",
        calendarName: "Études",
        isTask: false,
        taskCompleted: false,
        taskStatus: "todo",
        isRecurring: false,
        isMultiDay: false,
        isSomeday: false,
        ...overrides,
    };
}

describe("CalendarEventsPanel ICS link filter", () => {
    let host: HTMLDivElement;

    const baseProps = () => ({
        calendar: {
            id: "cal-1",
            name: "Études",
            color: "#4a7dfc",
            type: "local" as const,
            editable: true,
        },
        events: [
            event({ id: "feed-1-event", icsFeedId: "feed-1", title: "EFREI" }),
            event({
                id: "feed-2-event",
                icsFeedId: "feed-2",
                title: "Autre lien",
            }),
            event({
                id: "personal-event",
                icsFeedId: undefined,
                title: "Note perso",
            }),
        ],
        timeFormat24h: true,
        defaultCalendarId: "cal-1",
        pinned: false,
        onEventClick: jest.fn(),
        onClose: jest.fn(),
        onTogglePinned: jest.fn(),
        onAddEvent: jest.fn(),
        onSetDefault: jest.fn(),
        onShowOnly: jest.fn(),
        icsFeeds: [
            { id: "feed-1", name: "EFREI" },
            { id: "feed-2", name: "Autre lien" },
        ],
        onRemove: jest.fn(),
        onColorChange: jest.fn(),
        open: true,
        onPanelDragTarget: jest.fn(),
        onPanelDrop: jest.fn(),
    });

    beforeEach(() => {
        applyLanguage("en");
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
        applyLanguage("en");
    });

    const click = (el: Element | null) => {
        expect(el).toBeTruthy();
        act(() => {
            (el as HTMLElement).dispatchEvent(
                new MouseEvent("click", { bubbles: true })
            );
        });
    };

    const findByText = (text: string) =>
        Array.from(document.body.querySelectorAll<HTMLElement>("button")).find(
            (button) => button.textContent?.includes(text)
        ) ?? null;

    it("hides every other link's events and marks the button active once clicked", () => {
        const props = baseProps();
        act(() => {
            ReactDOM.render(React.createElement(CalendarEventsPanel, props), host);
        });

        // All three visible before any filtering.
        expect(document.body.textContent).toContain("EFREI");
        expect(document.body.textContent).toContain("Autre lien");
        expect(document.body.textContent).toContain("Note perso");

        click(document.body.querySelector('[title="Filters"]'));
        click(findByText("ICS links"));

        const feed1Row = findByText("EFREI");
        expect(feed1Row).toBeTruthy();
        const moreButton = feed1Row!
            .closest(".nc-cep-ics-link-row")
            ?.querySelector<HTMLButtonElement>(".nc-cep-ics-link-more");
        click(moreButton ?? null);

        const showOnlyButton = findByText("Show only this link");
        expect(showOnlyButton).toBeTruthy();
        expect(showOnlyButton!.className).not.toContain("nc-active");

        click(showOnlyButton);

        // The button confirms the click landed: it stays put, relabels
        // itself, and turns active.
        const showOnlyButtonAfter = findByText("Stop isolating");
        expect(showOnlyButtonAfter).toBeTruthy();
        expect(showOnlyButtonAfter!.className).toContain("nc-active");
        expect(showOnlyButtonAfter!.getAttribute("aria-pressed")).toBe("true");

        // The other link's card AND the unrelated personal note are both
        // gone; only this link's card remains. Isolating to one link means
        // only that link — a personal note with no feed at all is not this
        // link either.
        const cardTitles = Array.from(
            document.body.querySelectorAll(".nc-cep-card-title")
        ).map((node) => node.textContent);
        expect(cardTitles).toContain("EFREI");
        expect(cardTitles).not.toContain("Autre lien");
        expect(cardTitles).not.toContain("Note perso");

        // Clicking it again while already isolated must undo it — a second
        // click that re-applies the identical state would look, and be, a
        // no-op button.
        click(showOnlyButtonAfter);

        const cardTitlesRestored = Array.from(
            document.body.querySelectorAll(".nc-cep-card-title")
        ).map((node) => node.textContent);
        expect(cardTitlesRestored).toEqual(
            expect.arrayContaining(["EFREI", "Autre lien", "Note perso"])
        );
        expect(findByText("Show only this link")).toBeTruthy();
    });
});
