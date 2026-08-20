import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DndContext } from "@dnd-kit/core";
import EventBlock from "./EventBlock";
import { applyLanguage } from "../i18n";
import type { DisplayEvent } from "../types";

const occurrence: DisplayEvent = {
    id: "42_2026-07-22",
    title: "Standup",
    start: new Date(2026, 6, 22, 9),
    end: new Date(2026, 6, 22, 10),
    allDay: false,
    color: "#6c8cff",
    editable: true,
    calendarId: "calendar-1",
    calendarName: "Travail",
    isTask: false,
    taskCompleted: false,
    taskStatus: "todo",
    isRecurring: true,
    isMultiDay: false,
    isSomeday: false,
};

const render = (event: DisplayEvent) =>
    renderToStaticMarkup(
        <DndContext>
            <EventBlock
                event={event}
                onEventClick={() => {}}
                onContextMenu={() => {}}
                onToggleTask={async () => true}
            />
        </DndContext>
    );

describe("the first occurrence of a series", () => {
    afterEach(() => applyLanguage("fr"));

    // Deleting the occurrences a series began with moves its start, so the
    // occurrence it now begins on has to be recognisable on the grid.
    it("carries a marker saying the series starts there", () => {
        const html = render({ ...occurrence, isSeriesStart: true });

        expect(html).toContain("nc-event-series-start");
        expect(html).toContain('title="Début de la série"');
    });

    it("says it in the language the app is set to", () => {
        applyLanguage("en");

        const html = render({ ...occurrence, isSeriesStart: true });

        expect(html).toContain('title="Start of the series"');
    });

    it("leaves the occurrences that follow unmarked", () => {
        expect(render(occurrence)).not.toContain("nc-event-series-start");
    });

    it("leaves an event that does not recur unmarked", () => {
        const single = { ...occurrence, isRecurring: false };

        expect(render(single)).not.toContain("nc-event-series-start");
    });
});

describe("an event filled with its own colour", () => {
    /*
     * Selected, the block is painted in the calendar's colour and the title has
     * to be read on it. The title and the time each set their own colour in the
     * stylesheet, so an ink handed down by the block was overridden and lost:
     * the name came out in the theme's pale text on a mid-grey fill, unreadable.
     * The ink travels as a variable those two rules read.
     */
    it("hands the readable ink down as a variable", () => {
        const html = render({ ...occurrence, selected: true });

        expect(html).toContain("--nc-event-ink:#1a1a1a");
        expect(html).toContain("--nc-event-ink-muted:rgba(26, 26, 26,");
    });

    it("hands nothing down while it is not filled", () => {
        expect(render(occurrence)).not.toContain("--nc-event-ink");
    });
});
