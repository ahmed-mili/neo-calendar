import { RRule, rrulestr, Weekday, Options } from "rrule";
import { DateTime } from "luxon";
import { NeoEvent } from "../../types";
import { formatDateLong } from "./EventPanel.helpers";
import { t, tList } from "../i18n";

export type DayCode = "U" | "M" | "T" | "W" | "R" | "F" | "S";
export type Freq = "daily" | "weekly" | "monthly" | "yearly";
export type RecurEnd =
    | { kind: "never" }
    | { kind: "until"; date: string }
    | { kind: "count"; count: number };

export interface RecurrenceState {
    freq: Freq;
    interval: number;
    byDay: DayCode[];
    monthMode: "dayOfMonth" | "dayOfWeek";
    end: RecurEnd;
}

// Follows Date.getDay(): index 0 = Sunday. settings.firstDay uses the same base.
export const DAY_ORDER: DayCode[] = ["U", "M", "T", "W", "R", "F", "S"];

export function orderedDayCodes(firstDay: number): DayCode[] {
    return Array.from({ length: 7 }, (_, i) => DAY_ORDER[(i + firstDay) % 7]);
}

export function dayCodeOf(dateISO: string): DayCode {
    const d = new Date(dateISO + "T00:00:00");
    return DAY_ORDER[d.getDay()];
}

// ─── Task 2: recurrenceToRRule ────────────────────────────────────────────────

const FREQ_MAP: Record<Freq, Options["freq"]> = {
    daily: RRule.DAILY,
    weekly: RRule.WEEKLY,
    monthly: RRule.MONTHLY,
    yearly: RRule.YEARLY,
};

const DAY_CODE_TO_RRULE: Record<DayCode, Weekday> = {
    U: RRule.SU,
    M: RRule.MO,
    T: RRule.TU,
    W: RRule.WE,
    R: RRule.TH,
    F: RRule.FR,
    S: RRule.SA,
};

export function recurrenceToRRule(
    state: RecurrenceState,
    startDateISO: string
): string {
    const options: Partial<Options> = {
        freq: FREQ_MAP[state.freq],
        interval: Math.max(1, state.interval || 1),
    };

    if (state.freq === "weekly") {
        const days = state.byDay.length
            ? state.byDay
            : [dayCodeOf(startDateISO)]; // guard: never an empty BYDAY
        options.byweekday = days.map(
            (c) => DAY_CODE_TO_RRULE[c]
        ) as Options["byweekday"];
    }

    if (state.freq === "monthly") {
        const d = new Date(startDateISO + "T00:00:00");
        if (state.monthMode === "dayOfWeek") {
            const nth = Math.ceil(d.getDate() / 7);
            options.byweekday = [
                DAY_CODE_TO_RRULE[DAY_ORDER[d.getDay()]].nth(nth),
            ] as Options["byweekday"];
        } else {
            options.bymonthday = d.getDate() as Options["bymonthday"];
        }
    }

    if (state.end.kind === "until") {
        // UTC end-of-day to stay consistent with expandRrule, which anchors and
        // reads occurrences in UTC. A local end-of-day here would, on a machine
        // west of UTC, push UNTIL past a same-day UTC occurrence and render one
        // extra occurrence beyond the chosen date.
        options.until = DateTime.fromISO(state.end.date, { zone: "utc" })
            .endOf("day")
            .toJSDate();
    } else if (state.end.kind === "count") {
        options.count = Math.max(1, state.end.count || 1);
    }

    return new RRule(options).toString();
}

// ─── Task 3: rruleToRecurrence ───────────────────────────────────────────────

const FREQ_REVERSE: Record<number, Freq> = {
    [RRule.DAILY]: "daily",
    [RRule.WEEKLY]: "weekly",
    [RRule.MONTHLY]: "monthly",
    [RRule.YEARLY]: "yearly",
};

// index = RRule weekday (MO=0 … SU=6)
const RRULE_WEEKDAY_TO_CODE: DayCode[] = ["M", "T", "W", "R", "F", "S", "U"];

type RawWeekday = number | { weekday: number; n?: number };

function weekdayIndex(w: RawWeekday): number {
    return typeof w === "number" ? w : w.weekday;
}
function weekdayNth(w: RawWeekday): boolean {
    return typeof w === "object" && w.n !== undefined && w.n !== null;
}
function toWeekdayArray(v: unknown): RawWeekday[] {
    if (v === undefined || v === null) return [];
    return (Array.isArray(v) ? v : [v]) as RawWeekday[];
}

export function rruleToRecurrence(
    rruleStr: string,
    startDateISO: string
): RecurrenceState {
    const o = rrulestr(rruleStr).origOptions;
    const freq = FREQ_REVERSE[o.freq as number] ?? "weekly";
    const state: RecurrenceState = {
        freq,
        interval: (o.interval as number) || 1,
        byDay: [],
        monthMode: "dayOfMonth",
        end: { kind: "never" },
    };

    const byweekday = toWeekdayArray(o.byweekday);

    if (freq === "weekly") {
        state.byDay = byweekday
            .map((w) => RRULE_WEEKDAY_TO_CODE[weekdayIndex(w)])
            .filter(Boolean);
        if (state.byDay.length === 0) state.byDay = [dayCodeOf(startDateISO)];
    }

    if (freq === "monthly") {
        state.monthMode =
            byweekday.length > 0 && weekdayNth(byweekday[0])
                ? "dayOfWeek"
                : "dayOfMonth";
    }

    if (o.until) {
        state.end = {
            kind: "until",
            // Read back in UTC to mirror the UTC end-of-day written above.
            date: DateTime.fromJSDate(o.until as Date, {
                zone: "utc",
            }).toISODate()!,
        };
    } else if (o.count) {
        state.end = { kind: "count", count: o.count as number };
    }

    return state;
}

// ─── Task 4: helpers for bridging NeoEvent ───────────────────────────────────

export function defaultRecurrence(startDateISO: string): RecurrenceState {
    return {
        freq: "weekly",
        interval: 1,
        byDay: [dayCodeOf(startDateISO)],
        monthMode: "dayOfMonth",
        end: { kind: "never" },
    };
}

export function recurringToRecurrence(
    daysOfWeek: DayCode[],
    startRecur: string | undefined,
    endRecur: string | undefined,
    startDateISO: string
): RecurrenceState {
    const byDay = daysOfWeek.length ? daysOfWeek : [dayCodeOf(startDateISO)];
    return {
        freq: "weekly",
        interval: 1,
        byDay,
        monthMode: "dayOfMonth",
        end: endRecur ? { kind: "until", date: endRecur } : { kind: "never" },
    };
}

export function eventToRecurrenceState(
    event: NeoEvent,
    startDateISO: string
): { isRecurring: boolean; recurrence: RecurrenceState } {
    if (event.type === "rrule") {
        return {
            isRecurring: true,
            recurrence: rruleToRecurrence(
                event.rrule,
                event.startDate || startDateISO
            ),
        };
    }
    if (event.type === "recurring") {
        return {
            isRecurring: true,
            recurrence: recurringToRecurrence(
                event.daysOfWeek as DayCode[],
                event.startRecur,
                event.endRecur,
                event.startRecur || startDateISO
            ),
        };
    }
    return { isRecurring: false, recurrence: defaultRecurrence(startDateISO) };
}

export function recurrenceToEventFields(
    state: RecurrenceState,
    startDateISO: string
): { type: "rrule"; startDate: string; rrule: string; skipDates: string[] } {
    return {
        type: "rrule",
        startDate: startDateISO,
        rrule: recurrenceToRRule(state, startDateISO),
        skipDates: [],
    };
}

// ─── Task 5: summary text + presets ──────────────────────────────────────────

/** The names the summary reads a repeat out with, in the calendar's language. */
const FREQ_EVERY: Record<Freq, string> = {
    daily: "Every day",
    weekly: "Every week",
    monthly: "Every month",
    yearly: "Every year",
};

const FREQ_EVERY_N: Record<Freq, string> = {
    daily: "every {n} days",
    weekly: "every {n} weeks",
    monthly: "every {n} months",
    yearly: "every {n} years",
};

/** Spelled out, and cased for the middle of a sentence: French writes its days
    in lower case, English does not, so the list carries the difference. */
const dayNames = () =>
    tList("days.long", [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
    ]);

/**
 * The repeat, read back as a sentence.
 *
 * It used to be rrule's own `toText()`, which speaks English and only English:
 * a French calendar answered "every day until August 30, 2026" in the middle of
 * its own wording. The rule is small enough to say out loud from its own parts,
 * and saying it here is what lets it be said in the language the calendar is
 * set to.
 */
export function recurrenceSummary(
    state: RecurrenceState,
    /** Kept in the signature: every caller has one, and a rule that reads its
        start date back — "every month on the 12th" — would need it. */
    _startDateISO?: string
): string {
    const interval = Math.max(1, state.interval || 1);
    const parts: string[] = [
        interval === 1
            ? t(FREQ_EVERY[state.freq])
            : t(FREQ_EVERY_N[state.freq]).replace("{n}", String(interval)),
    ];

    if (state.freq === "weekly" && state.byDay.length) {
        const names = dayNames();
        const days = DAY_ORDER.filter((code) => state.byDay.includes(code)).map(
            (code) => names[DAY_ORDER.indexOf(code)]
        );
        parts.push(t("on {days}").replace("{days}", days.join(", ")));
    }

    if (state.end.kind === "until" && state.end.date) {
        parts.push(
            t("until {date}").replace("{date}", formatDateLong(state.end.date))
        );
    }
    if (state.end.kind === "count") {
        parts.push(
            t("{n} times").replace("{n}", String(Math.max(1, state.end.count)))
        );
    }

    // The day list belongs to the frequency it qualifies; an end condition is
    // a second statement about it, and reads as one.
    const head = parts.slice(0, state.freq === "weekly" ? 2 : 1).join(" ");
    const tail = parts.slice(state.freq === "weekly" ? 2 : 1);
    const sentence = tail.length ? `${head}, ${tail.join(", ")}` : head;
    // "every 2 weeks" is written for the middle of a sentence, and here it
    // starts one.
    return sentence.charAt(0).toLocaleUpperCase() + sentence.slice(1);
}

export type PresetKey = "daily" | "weekly" | "monthly" | "yearly" | "custom";

export function presetToRecurrence(
    key: PresetKey,
    startDateISO: string
): RecurrenceState {
    const base = defaultRecurrence(startDateISO);
    switch (key) {
        case "daily":
            return { ...base, freq: "daily", byDay: [] };
        case "monthly":
            return {
                ...base,
                freq: "monthly",
                byDay: [],
                monthMode: "dayOfMonth",
            };
        case "yearly":
            return { ...base, freq: "yearly", byDay: [] };
        case "weekly":
        case "custom":
        default:
            return base; // weekly on start weekday
    }
}

export function matchPreset(
    state: RecurrenceState,
    startDateISO: string
): PresetKey {
    if (state.interval !== 1 || state.end.kind !== "never") return "custom";
    const startDay = dayCodeOf(startDateISO);
    if (state.freq === "daily") return "daily";
    if (state.freq === "yearly") return "yearly";
    if (state.freq === "weekly") {
        return state.byDay.length === 1 && state.byDay[0] === startDay
            ? "weekly"
            : "custom";
    }
    if (state.freq === "monthly") {
        return state.monthMode === "dayOfMonth" ? "monthly" : "custom";
    }
    return "custom";
}
