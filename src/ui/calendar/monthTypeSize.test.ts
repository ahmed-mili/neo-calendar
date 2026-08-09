import { LONG_MONTH_NAME, needsCompactMonthType } from "./CalendarUtils";

describe("needsCompactMonthType", () => {
    it("leaves the short months at full size", () => {
        // The eleven that always fit beside the week number.
        for (const month of [
            "janvier",
            "février",
            "mars",
            "avril",
            "mai",
            "juin",
            "juillet",
            "août",
            "octobre",
        ]) {
            expect(needsCompactMonthType(month)).toBe(false);
        }
    });

    it("steps down the ones that ran over the week beside them", () => {
        for (const month of ["septembre", "novembre", "décembre"]) {
            expect(needsCompactMonthType(month)).toBe(true);
        }
    });

    it("carries to other languages, since it measures the name", () => {
        expect(needsCompactMonthType("February")).toBe(true);
        expect(needsCompactMonthType("March")).toBe(false);
        expect(needsCompactMonthType("septiembre")).toBe(true);
    });

    it("counts the name, not the space around it", () => {
        expect(needsCompactMonthType("  mai  ")).toBe(false);
        expect(needsCompactMonthType("a".repeat(LONG_MONTH_NAME))).toBe(true);
        expect(needsCompactMonthType("a".repeat(LONG_MONTH_NAME - 1))).toBe(
            false
        );
    });
});
