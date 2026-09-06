import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DndContext } from "@dnd-kit/core";
import EventBlock from "./EventBlock";
import { applyLanguage } from "../i18n";
import type { DisplayEvent } from "../types";
import { SyncingFeedsContext } from "./SyncingFeeds";

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

const render = (event: DisplayEvent, compact = false) =>
    renderToStaticMarkup(
        <DndContext>
            <EventBlock
                event={event}
                compact={compact}
                onEventClick={() => {}}
                onContextMenu={() => {}}
                onToggleTask={async () => true}
            />
        </DndContext>
    );

describe("an event in the all-day band", () => {
    it("keeps an all-day title on exactly one line", () => {
        const html = render(
            { ...occurrence, allDay: true, title: "Neo Calendar App" },
            true
        );

        expect(html).toContain('class="nc-event-text nc-event-text-inline"');
    });

    it("does not flatten a full-height timed event outside the band", () => {
        const html = render(occurrence);

        expect(html).not.toContain("nc-event-text-inline");
    });
});

describe("the first occurrence of a series", () => {
    afterEach(() => applyLanguage("fr"));

    // Deleting the occurrences a series began with moves its start, so the
    // occurrence it now begins on has to be recognisable on the grid.
    it("carries a marker saying the series starts there", () => {
        const html = render({ ...occurrence, isSeriesStart: true });

        expect(html).toContain("nc-event-series-start");
        expect(html).toContain('data-nc-tooltip="Début de la série"');
    });

    it("says it in the language the app is set to", () => {
        applyLanguage("en");

        const html = render({ ...occurrence, isSeriesStart: true });

        expect(html).toContain('data-nc-tooltip="Start of the series"');
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

/*
 * Ce qu'un lien a déjà écrit reste à sa place pendant qu'il se rafraîchit.
 *
 * Retirer ses évènements le temps d'une synchronisation ferait lire une
 * journée pleine comme une journée libre. Ils restent donc affichés, et un
 * battement dit que la réponse du lien n'est pas encore arrivée.
 */
describe("an event of a link being refreshed", () => {
    const renderWith = (event: DisplayEvent, syncing: ReadonlySet<string>) =>
        renderToStaticMarkup(
            <SyncingFeedsContext.Provider value={syncing}>
                <DndContext>
                    <EventBlock
                        event={event}
                        compact={false}
                        onEventClick={() => {}}
                        onContextMenu={() => {}}
                        onToggleTask={async () => true}
                    />
                </DndContext>
            </SyncingFeedsContext.Provider>
        );

    const fromFeed: DisplayEvent = { ...occurrence, icsFeedId: "feed-1" };

    it("beats while its own link is loading", () => {
        expect(renderWith(fromFeed, new Set(["feed-1"]))).toContain(
            "nc-event-syncing"
        );
    });

    it("stays still while another link is loading", () => {
        expect(renderWith(fromFeed, new Set(["feed-2"]))).not.toContain(
            "nc-event-syncing"
        );
    });

    it("never beats for an event that belongs to no link", () => {
        expect(renderWith(occurrence, new Set(["feed-1"]))).not.toContain(
            "nc-event-syncing"
        );
    });

    it("is still on the grid while its link loads, not taken away", () => {
        const html = renderWith(fromFeed, new Set(["feed-1"]));
        expect(html).toContain("Standup");
    });
});
