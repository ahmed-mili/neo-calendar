import * as fs from "fs";
import * as path from "path";
import { easterSunday, expandRules, holidayRuleSchema } from "./rules";
import type { HolidayRule } from "./rules";
import { GOOGLE_FEED_2021_2031 } from "./frenchHolidays.fixture";

interface Preset {
    name: string;
    icon: string;
    rules: HolidayRule[];
}

const presets: Record<string, Preset> = JSON.parse(
    fs.readFileSync(
        path.join(__dirname, "../../../presets/holiday-presets.json"),
        "utf8"
    )
);

describe("auto calendar rules", () => {
    it("reproduces the French feed Notion ships, entry for entry", () => {
        const generated = expandRules(presets.FR.rules, 2021, 2031).map(
            ({ date, name }) => [date, name]
        );
        expect(generated).toEqual(GOOGLE_FEED_2021_2031);
    });

    it("computes Easter for years outside any feed", () => {
        expect(easterSunday(1961).toISODate()).toBe("1961-04-02");
        expect(easterSunday(2000).toISODate()).toBe("2000-04-23");
        expect(easterSunday(2100).toISODate()).toBe("2100-03-28");
    });

    it("resolves each rule kind", () => {
        const rules: HolidayRule[] = [
            { n: "Fixed", k: "f", m: 12, d: 25 },
            { n: "Easter", k: "e", o: 39 },
            { n: "Third Sunday", k: "n", m: 6, w: 0, i: 3 },
            { n: "Last Sunday", k: "n", m: 10, w: 0, i: -1 },
            { n: "Explicit", k: "x", d: ["2026-05-27", "2027-05-16"] },
        ];
        const byName = new Map(
            expandRules(rules, 2026, 2026).map((h) => [h.name, h.date])
        );
        expect(byName.get("Fixed")).toBe("2026-12-25");
        expect(byName.get("Easter")).toBe("2026-05-14");
        expect(byName.get("Third Sunday")).toBe("2026-06-21");
        expect(byName.get("Last Sunday")).toBe("2026-10-25");
        expect(byName.get("Explicit")).toBe("2026-05-27");
    });

    it("shifts a feast off the Easter offset it must avoid", () => {
        // Last Sunday of May 2023 IS Pentecost, so Mother's Day moves to June.
        const mothersDay: HolidayRule = {
            n: "Fête des Mères",
            k: "n",
            m: 5,
            w: 0,
            i: -1,
            a: 49,
        };
        expect(expandRules([mothersDay], 2023, 2023)[0].date).toBe(
            "2023-06-04"
        );
        expect(expandRules([mothersDay], 2026, 2026)[0].date).toBe(
            "2026-05-31"
        );
    });

    it("drops a fixed rule on a date the year does not have", () => {
        const leapOnly: HolidayRule = { n: "Leap", k: "f", m: 2, d: 29 };
        expect(expandRules([leapOnly], 2025, 2025)).toEqual([]);
        expect(expandRules([leapOnly], 2028, 2028)[0].date).toBe("2028-02-29");
    });

    it("yields nothing outside an explicit rule's window instead of guessing", () => {
        const eid: HolidayRule = { n: "Eid", k: "x", d: ["2040-12-14"] };
        expect(expandRules([eid], 2041, 2045)).toEqual([]);
    });
});

describe("hijri rules", () => {
    const islam: Record<string, Preset> = JSON.parse(
        fs.readFileSync(
            path.join(__dirname, "../../../presets/custom-presets.json"),
            "utf8"
        )
    );
    const rules = islam.islam.rules;
    const on = (year: number, needle: string) =>
        expandRules(rules, year, year)
            .filter((h) => h.name.includes(needle))
            .map((h) => h.date);

    it("agrees with the published Umm al-Qura dates", () => {
        // Cross-checked against the Moroccan holiday feed in date-holidays.
        expect(on(2026, "عيد الفطر")).toEqual(["2026-03-20"]);
        expect(on(2026, "عيد الأضحى")).toEqual(["2026-05-27"]);
        // Arafat is the eve of Eid al-Adha, by definition.
        expect(on(2026, "عرفة")).toEqual(["2026-05-26"]);
    });

    it("runs the Ramadan fast to the end of the Hijri month", () => {
        // Ramadan 1447 runs 30 days, 18 February to 19 March 2026.
        const fast = on(2026, "صيام رمضان");
        expect(fast[0]).toBe("2026-02-18");
        expect(fast).toHaveLength(30);
        // The last fast is the eve of Eid al-Fitr (20 March).
        expect(fast[fast.length - 1]).toBe("2026-03-19");
    });

    it("marks the white days three at a time, every Hijri month", () => {
        const white = on(2026, "الأيام البيض");
        expect(white.length).toBeGreaterThanOrEqual(33);
        expect(white.length).toBeLessThanOrEqual(39);
    });

    it("covers the weekly fasts", () => {
        const mondays = on(2026, "الاثنين");
        expect(mondays).toHaveLength(52);
        expect(new Date(mondays[0] + "T00:00:00Z").getUTCDay()).toBe(1);
    });

    it("keeps every rule inside the requested window", () => {
        const dates = expandRules(rules, 2026, 2026).map((h) => h.date);
        expect(dates.every((d) => d.startsWith("2026"))).toBe(true);
    });

    it("validates against the rule schema", () => {
        for (const rule of rules) {
            expect(() => holidayRuleSchema.parse(rule)).not.toThrow();
        }
    });
});

describe("shipped presets", () => {
    it("covers the world and validates against the rule schema", () => {
        const codes = Object.keys(presets);
        expect(codes.length).toBeGreaterThan(190);
        for (const code of codes) {
            expect(typeof presets[code].name).toBe("string");
            for (const rule of presets[code].rules) {
                expect(() => holidayRuleSchema.parse(rule)).not.toThrow();
            }
        }
    });

    it("every preset produces events for the current decade", () => {
        for (const [code, preset] of Object.entries(presets)) {
            const count = expandRules(preset.rules, 2026, 2030).length;
            expect([code, count > 0]).toEqual([code, true]);
        }
    });

    it("keeps lunisolar feasts as explicit dates", () => {
        const eid = presets.MA.rules.find((rule) => rule.n.includes("الأضحى"));
        expect(eid?.k).toBe("x");
        const dates = expandRules([eid!], 2026, 2026);
        expect(dates[0].date).toBe("2026-05-27");
    });
});
