import { pickDefaultCalendarAfterHide } from "./defaultCalendar";
import { CalendarSource } from "../types";

const source = (
    id: string,
    editable = true,
    type: CalendarSource["type"] = "local"
): CalendarSource => ({ id, name: id, color: "#fff", editable, type });

describe("pickDefaultCalendarAfterHide", () => {
    it("returns null when the default calendar stays visible", () => {
        expect(
            pickDefaultCalendarAfterHide(
                [source("work"), source("personal")],
                new Set(["personal"]),
                "work"
            )
        ).toBeNull();
    });

    it("falls back to the topmost visible editable calendar", () => {
        expect(
            pickDefaultCalendarAfterHide(
                [source("work"), source("personal"), source("side")],
                new Set(["work"]),
                "work"
            )
        ).toBe("personal");
    });

    it("skips hidden calendars above the candidate", () => {
        expect(
            pickDefaultCalendarAfterHide(
                [source("work"), source("personal"), source("side")],
                new Set(["work", "personal"]),
                "work"
            )
        ).toBe("side");
    });

    it("skips read-only remote calendars", () => {
        expect(
            pickDefaultCalendarAfterHide(
                [source("feed", false, "ical"), source("personal")],
                new Set(["work"]),
                "work"
            )
        ).toBe("personal");
    });

    it("keeps the current default when every calendar is hidden", () => {
        expect(
            pickDefaultCalendarAfterHide(
                [source("work"), source("personal")],
                new Set(["work", "personal"]),
                "work"
            )
        ).toBeNull();
    });

    it("keeps the current default when no editable calendar remains", () => {
        expect(
            pickDefaultCalendarAfterHide(
                [source("work"), source("feed", false, "ical")],
                new Set(["work"]),
                "work"
            )
        ).toBeNull();
    });
});
