import { formatPanelDate, panelEndDate } from "./EventPanel.helpers";

describe("event panel date display", () => {
    it("keeps the main date compact by omitting the year", () => {
        const label = formatPanelDate("2026-08-28");

        expect(label).toContain("28");
        expect(label).not.toContain("2026");
    });

    it("uses the stored endDate for a real multi-day timed event", () => {
        expect(
            panelEndDate(
                "2026-08-28",
                "2026-08-31",
                false,
                "14:15",
                "15:15"
            )
        ).toBe("2026-08-31");
    });

    it("uses the stored endDate for a multi-day all-day event", () => {
        expect(
            panelEndDate("2026-08-28", "2026-08-31", true, "", "")
        ).toBe("2026-08-31");
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
