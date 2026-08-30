import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { formatPanelDate, panelEndDate } from "./EventPanel.helpers";
import { DateRow } from "./EventPanelRows";

describe("event panel date display", () => {
    it("keeps the main date compact by omitting the year", () => {
        const label = formatPanelDate("2026-08-28");

        expect(label).toContain("28");
        expect(label).not.toContain("2026");
    });

    it("reproduces the reported Fri-to-Mon multi-day row with both compact dates visible", () => {
        const startDate = "2026-08-28";
        const endDate = panelEndDate(
            startDate,
            "2026-08-31",
            false,
            "14:15",
            "15:15"
        );
        const startLabel = formatPanelDate(startDate);
        const endLabel = formatPanelDate(endDate);

        const html = renderToStaticMarkup(
            React.createElement(DateRow, {
                date: startDate,
                dateLabel: startLabel,
                endDateLabel: endLabel,
                endDate,
                startTime: "14:15",
                endTime: "15:15",
                duration: "1h",
                allDay: false,
                isRecurring: false,
                editable: true,
                firstDay: 1,
                setDate: jest.fn(),
                setStartTime: jest.fn(),
                setEndTime: jest.fn(),
                onAutoSave: jest.fn(),
            })
        );

        expect(html).toContain(startLabel);
        expect(html).toContain(endLabel);
        expect(html).toContain("14:15");
        expect(html).toContain("15:15");
        expect(html).toContain("1h");
        expect(html).not.toContain("2026");
        // Une seule grille, et une date par colonne : chacune sous l'heure
        // dont elle est la date.
        expect(html.match(/nc-panel-datetime-start-date/g)).toHaveLength(1);
        expect(html.match(/nc-panel-datetime-end-date/g)).toHaveLength(1);
    });

    it("uses the stored endDate for a real multi-day timed event", () => {
        expect(
            panelEndDate("2026-08-28", "2026-08-31", false, "14:15", "15:15")
        ).toBe("2026-08-31");
    });

    it("uses the stored endDate for a multi-day all-day event", () => {
        expect(panelEndDate("2026-08-28", "2026-08-31", true, "", "")).toBe(
            "2026-08-31"
        );
    });

    it("still derives tomorrow for a legacy overnight event without endDate", () => {
        expect(
            panelEndDate("2026-08-28", undefined, false, "23:30", "01:00")
        ).toBe("2026-08-29");
    });

    it("does not invent a second date for an ordinary same-day event", () => {
        expect(
            panelEndDate("2026-08-28", undefined, false, "14:15", "15:15")
        ).toBe("");
    });
});
