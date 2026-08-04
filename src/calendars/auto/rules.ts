import { z } from "zod";
import { DateTime } from "luxon";
import { endsHijriMonth, hijriIndex } from "./hijri";

/**
 * The rule language behind auto calendars: a compact, declarative description of
 * a recurring observance. Four kinds cover the world's calendars —
 *
 *   f  fixed date        every 25 December
 *   e  Easter offset     Ascension is Easter + 39
 *   n  nth weekday       3rd Sunday of June, or the last (i = -1)
 *   x  explicit dates    lunisolar feasts (Eid, Rosh Hashanah, Lunar New Year)
 *                        that no formula reproduces, listed year by year
 *
 * Field names are one letter because this ships as a 325 KB preset file and is
 * copied verbatim into the user's data.json. `n` is always the display name.
 */
const fixedRule = z.object({
    n: z.string(),
    k: z.literal("f"),
    m: z.number().int().min(1).max(12),
    d: z.number().int().min(1).max(31),
});

const easterRule = z.object({
    n: z.string(),
    k: z.literal("e"),
    o: z.number().int(),
});

const weekdayRule = z.object({
    n: z.string(),
    k: z.literal("n"),
    m: z.number().int().min(1).max(12),
    /** 0 = Sunday … 6 = Saturday, as in `Date#getDay`. */
    w: z.number().int().min(0).max(6),
    /** 1–5, or -1 for "the last one of the month". */
    i: z.number().int().min(-1).max(5),
    /**
     * Easter offset this feast must not collide with; when it does, it moves a
     * week later. France's Mother's Day is the last Sunday of May unless that
     * is Pentecost (Easter + 49), as in 2023.
     */
    a: z.number().int().optional(),
});

const explicitRule = z.object({
    n: z.string(),
    k: z.literal("x"),
    d: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
});

/** A date in the Hijri year: 10 Muharram, 9 Dhul-Hijja, 1 Shawwal. */
const hijriRule = z.object({
    n: z.string(),
    k: z.literal("h"),
    hm: z.number().int().min(1).max(12),
    hd: z.number().int().min(1).max(30),
    /**
     * How many consecutive days the observance runs (default 1). -1 runs to the
     * end of the Hijri month, which is 29 or 30 days depending on the year —
     * that is how "the fast of Ramadan" stays right without hardcoding a length.
     */
    ln: z.number().int().optional(),
});

/** The same day in EVERY Hijri month — the white days are the 13th to 15th. */
const hijriMonthlyRule = z.object({
    n: z.string(),
    k: z.literal("hm"),
    hd: z.number().int().min(1).max(30),
    ln: z.number().int().optional(),
});

/** Every week, on one weekday: the Monday and Thursday fasts. */
const weeklyRule = z.object({
    n: z.string(),
    k: z.literal("w"),
    /** 0 = Sunday … 6 = Saturday. */
    w: z.number().int().min(0).max(6),
});

export const holidayRuleSchema = z.discriminatedUnion("k", [
    fixedRule,
    easterRule,
    weekdayRule,
    explicitRule,
    hijriRule,
    hijriMonthlyRule,
    weeklyRule,
]);

export type HolidayRule = z.infer<typeof holidayRuleSchema>;

/** One dated observance: an ISO `yyyy-MM-dd` date and its label. */
export interface Holiday {
    date: string;
    name: string;
}

/**
 * Easter Sunday, by the anonymous Gregorian algorithm (Meeus/Jones/Butcher).
 * Exact for every year of the Gregorian calendar, which is what lets these
 * calendars work offline and for any year the user scrolls to.
 */
export function easterSunday(year: number): DateTime {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return DateTime.utc(year, month, day);
}

/** Luxon counts 1 = Monday … 7 = Sunday; the rules use 0 = Sunday. */
const toLuxonWeekday = (w: number): number => (w === 0 ? 7 : w);

function nthWeekday(
    year: number,
    month: number,
    weekday: number,
    ordinal: number
): DateTime {
    const target = toLuxonWeekday(weekday);
    if (ordinal === -1) {
        const last = DateTime.utc(year, month, 1).endOf("month").startOf("day");
        return last.minus({ days: (last.weekday - target + 7) % 7 });
    }
    const first = DateTime.utc(year, month, 1);
    const offset = (target - first.weekday + 7) % 7;
    return first.plus({ days: offset + (ordinal - 1) * 7 });
}

/** The date a rule falls on in `year`, or null if it doesn't occur that year. */
function dateFor(
    rule: Exclude<HolidayRule, { k: "h" } | { k: "hm" } | { k: "w" }>,
    year: number
): string | null {
    switch (rule.k) {
        case "f": {
            const date = DateTime.utc(year, rule.m, rule.d);
            // Guards 29 February in a common year.
            return date.isValid ? date.toISODate() : null;
        }
        case "e":
            return easterSunday(year).plus({ days: rule.o }).toISODate();
        case "n": {
            let date = nthWeekday(year, rule.m, rule.w, rule.i);
            if (rule.a !== undefined) {
                const clash = easterSunday(year).plus({ days: rule.a });
                if (date.hasSame(clash, "day")) date = date.plus({ days: 7 });
            }
            return date.toISODate();
        }
        case "x": {
            const prefix = `${year}-`;
            return rule.d.find((date) => date.startsWith(prefix)) ?? null;
        }
    }
}

/**
 * Every observance these rules produce from `firstYear` to `lastYear`, sorted by
 * date. Explicit rules simply contribute nothing outside the window they cover,
 * so a calendar scrolled past 2040 quietly loses its lunisolar feasts rather
 * than inventing wrong ones.
 */
export function expandRules(
    rules: HolidayRule[],
    firstYear: number,
    lastYear: number
): Holiday[] {
    const out: Holiday[] = [];
    // Only pay for the Hijri conversion when a rule actually asks for it.
    const usesHijri = rules.some((rule) => rule.k === "h" || rule.k === "hm");
    const days = usesHijri ? hijriIndex(firstYear, lastYear) : [];

    for (const rule of rules) {
        switch (rule.k) {
            case "h":
            case "hm": {
                for (let i = 0; i < days.length; i++) {
                    const day = days[i];
                    const starts =
                        rule.k === "hm"
                            ? day.hd === rule.hd
                            : day.hm === rule.hm && day.hd === rule.hd;
                    if (!starts) continue;
                    const span = rule.ln ?? 1;
                    for (
                        let step = 0;
                        step < (span === -1 ? days.length : span);
                        step++
                    ) {
                        const current = days[i + step];
                        if (!current) break;
                        out.push({ date: current.iso, name: rule.n });
                        if (span === -1 && endsHijriMonth(days, i + step))
                            break;
                    }
                }
                break;
            }
            case "w": {
                const end = Date.UTC(lastYear, 11, 31);
                let ms = Date.UTC(firstYear, 0, 1);
                while (ms <= end) {
                    if (new Date(ms).getUTCDay() === rule.w) {
                        out.push({
                            date: new Date(ms).toISOString().slice(0, 10),
                            name: rule.n,
                        });
                    }
                    ms += 86400000;
                }
                break;
            }
            default: {
                for (let year = firstYear; year <= lastYear; year++) {
                    const date = dateFor(rule, year);
                    if (date) out.push({ date, name: rule.n });
                }
            }
        }
    }

    // A Hijri rule can spill a day either side of the requested window.
    const first = `${firstYear}-01-01`;
    const last = `${lastYear}-12-31`;
    return out
        .filter((h) => h.date >= first && h.date <= last)
        .sort(
            (a, b) =>
                a.date.localeCompare(b.date) || a.name.localeCompare(b.name)
        );
}
