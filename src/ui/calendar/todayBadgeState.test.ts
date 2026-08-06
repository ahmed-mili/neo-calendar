import { todayBadgeState } from "./CalendarUtils";

const day = (iso: string) => new Date(`${iso}T00:00:00`);
const range = (...isos: string[]) => isos.map(day);

// 2026-08-07 is a Friday. The clock time must never matter: a view showing
// today is "present" whether it is looked at just past midnight or at 23:59.
const NOON = new Date("2026-08-07T12:00:00");

describe("todayBadgeState", () => {
    it("reports present when today is one of the visible days", () => {
        expect(todayBadgeState(range("2026-08-07", "2026-08-08"), NOON)).toBe(
            "present"
        );
    });

    it("reports present when today is the last visible day", () => {
        expect(
            todayBadgeState(
                range("2026-08-05", "2026-08-06", "2026-08-07"),
                NOON
            )
        ).toBe("present");
    });

    it("reports back when every visible day is after today", () => {
        expect(todayBadgeState(range("2026-08-08", "2026-08-09"), NOON)).toBe(
            "back"
        );
    });

    it("reports forward when every visible day is before today", () => {
        expect(todayBadgeState(range("2026-08-05", "2026-08-06"), NOON)).toBe(
            "forward"
        );
    });

    it("ignores the time of day when today is the only visible day", () => {
        const justBeforeMidnight = new Date("2026-08-07T23:59:59");
        expect(todayBadgeState(range("2026-08-07"), justBeforeMidnight)).toBe(
            "present"
        );
    });

    it("reports present for an empty range rather than colouring the badge", () => {
        expect(todayBadgeState([], NOON)).toBe("present");
    });
});
