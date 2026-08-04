/**
 * Gregorian ↔ Hijri, via the Umm al-Qura calendar built into the runtime's
 * Intl data — the civil calendar Saudi Arabia publishes and the one almanacs,
 * Google and date-holidays agree with (Eid al-Fitr 2026 = 1 Shawwal 1447 =
 * 20 March 2026, checked in `rules.test.ts`).
 *
 * A caveat worth stating plainly: religious observance follows the local moon
 * sighting, so a real date can land one day either side of the tabular one.
 * These calendars mark the expected day, not a fatwa.
 */

/** One indexed day: its ISO date alongside the Hijri date it falls on. */
export interface HijriDay {
    iso: string;
    /** Hijri year, month (1-12) and day (1-30). */
    hy: number;
    hm: number;
    hd: number;
}

const formatter = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    timeZone: "UTC",
});

const DAY = 86400000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function hijriOf(ms: number): { hy: number; hm: number; hd: number } {
    // Noon UTC keeps the conversion clear of any midnight rounding.
    const parts = formatter.formatToParts(new Date(ms + DAY / 2));
    let hy = 0;
    let hm = 0;
    let hd = 0;
    for (const part of parts) {
        if (part.type === "year") hy = parseInt(part.value, 10);
        else if (part.type === "month") hm = parseInt(part.value, 10);
        else if (part.type === "day") hd = parseInt(part.value, 10);
    }
    return { hy, hm, hd };
}

/**
 * Every day of the Gregorian window, paired with its Hijri date.
 *
 * Built once and memoized: the rules that need it (a Hijri date, the white days
 * of every month, the fasts of Ramadan) all read the same index instead of each
 * walking the calendar again. Sixteen years is roughly 5800 conversions.
 */
const cache = new Map<string, HijriDay[]>();

export function hijriIndex(firstYear: number, lastYear: number): HijriDay[] {
    const key = `${firstYear}-${lastYear}`;
    const hit = cache.get(key);
    if (hit) return hit;

    const days: HijriDay[] = [];
    let ms = Date.UTC(firstYear, 0, 1);
    const end = Date.UTC(lastYear, 11, 31);
    while (ms <= end) {
        days.push({ iso: iso(ms), ...hijriOf(ms) });
        ms += DAY;
    }
    cache.set(key, days);
    return days;
}

/** Whether `day` is the last of its Hijri month (they run 29 or 30 days). */
export function endsHijriMonth(days: HijriDay[], index: number): boolean {
    const next = days[index + 1];
    return !next || next.hm !== days[index].hm;
}
