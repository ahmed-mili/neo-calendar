import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ListView from "./ListView";
import { applyLanguage } from "../i18n";
import type { DisplayEvent } from "../types";

const event: DisplayEvent = {
    id: "event-1",
    title: "Réunion",
    start: new Date(2026, 0, 4, 9),
    end: new Date(2026, 0, 4, 10),
    allDay: true,
    color: "#6c8cff",
    editable: true,
    calendarId: "calendar-1",
    calendarName: "Travail",
    isTask: false,
    taskCompleted: false,
    taskStatus: "todo",
    isRecurring: false,
    isMultiDay: false,
    isSomeday: false,
};

const props = {
    events: [event],
    visibleDates: [new Date(2026, 0, 4), new Date(2026, 0, 5)],
    firstDay: 1,
    timeFormat24h: true,
    onEventClick: () => {},
    onEventDrag: async () => true,
    onEventResize: async () => true,
    onSelectRange: () => {},
    onContextMenu: () => {},
    onToggleTask: async () => true,
};

describe("desktop list view", () => {
    afterEach(() => applyLanguage("fr"));

    it("uses the selected language and exposes event rows to the keyboard", () => {
        applyLanguage("fr");
        const html = renderToStaticMarkup(<ListView {...props} />);

        expect(html).toContain("Dimanche");
        expect(html).toContain("janvier");
        expect(html).toContain("Toute la journée");
        expect(html).toContain("Aucun événement");
        expect(html).toContain('role="button"');
        expect(html).toContain('tabindex="0"');
    });

    it("keeps English labels in English", () => {
        applyLanguage("en");
        const html = renderToStaticMarkup(<ListView {...props} />);

        expect(html).toContain("Sunday");
        expect(html).toContain("January");
        expect(html).toContain("All day");
        expect(html).toContain("No events");
    });
});
