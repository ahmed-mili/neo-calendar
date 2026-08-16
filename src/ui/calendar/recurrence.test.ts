import {
    orderedDayCodes,
    dayCodeOf,
    recurrenceToRRule,
    rruleToRecurrence,
    defaultRecurrence,
    recurringToRecurrence,
    eventToRecurrenceState,
    recurrenceToEventFields,
    recurrenceSummary,
    presetToRecurrence,
    matchPreset,
} from "./recurrence";
import { NeoEvent } from "../../types";

describe("orderedDayCodes", () => {
    it("firstDay=0 (Sunday) starts on U", () => {
        expect(orderedDayCodes(0)).toEqual(["U", "M", "T", "W", "R", "F", "S"]);
    });
    it("firstDay=1 (Monday) starts on M", () => {
        expect(orderedDayCodes(1)).toEqual(["M", "T", "W", "R", "F", "S", "U"]);
    });
});

describe("dayCodeOf", () => {
    it("maps an ISO date to its weekday code", () => {
        // 2026-06-22 is a Monday
        expect(dayCodeOf("2026-06-22")).toBe("M");
        // 2026-06-27 is a Saturday
        expect(dayCodeOf("2026-06-27")).toBe("S");
    });
});

describe("recurrenceToRRule", () => {
    const start = "2026-06-02"; // Tuesday

    it("weekly with interval and days", () => {
        expect(
            recurrenceToRRule(
                {
                    freq: "weekly",
                    interval: 2,
                    byDay: ["T"],
                    monthMode: "dayOfMonth",
                    end: { kind: "never" },
                },
                start
            )
        ).toBe("RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TU");
    });

    it("weekly falls back to start weekday when no day selected", () => {
        expect(
            recurrenceToRRule(
                {
                    freq: "weekly",
                    interval: 1,
                    byDay: [],
                    monthMode: "dayOfMonth",
                    end: { kind: "never" },
                },
                start
            )
        ).toBe("RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=TU");
    });

    it("daily with count", () => {
        expect(
            recurrenceToRRule(
                {
                    freq: "daily",
                    interval: 3,
                    byDay: [],
                    monthMode: "dayOfMonth",
                    end: { kind: "count", count: 13 },
                },
                start
            )
        ).toBe("RRULE:FREQ=DAILY;INTERVAL=3;COUNT=13");
    });

    it("monthly by day-of-month uses startDate day", () => {
        expect(
            recurrenceToRRule(
                {
                    freq: "monthly",
                    interval: 1,
                    byDay: [],
                    monthMode: "dayOfMonth",
                    end: { kind: "never" },
                },
                "2026-06-15"
            )
        ).toBe("RRULE:FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=15");
    });

    it("monthly by nth weekday uses startDate position", () => {
        // 2026-06-16 is the 3rd Tuesday of June 2026
        expect(
            recurrenceToRRule(
                {
                    freq: "monthly",
                    interval: 1,
                    byDay: [],
                    monthMode: "dayOfWeek",
                    end: { kind: "never" },
                },
                "2026-06-16"
            )
        ).toBe("RRULE:FREQ=MONTHLY;INTERVAL=1;BYDAY=+3TU");
    });

    it("yearly", () => {
        expect(
            recurrenceToRRule(
                {
                    freq: "yearly",
                    interval: 1,
                    byDay: [],
                    monthMode: "dayOfMonth",
                    end: { kind: "never" },
                },
                start
            )
        ).toBe("RRULE:FREQ=YEARLY;INTERVAL=1");
    });
});

describe("rruleToRecurrence", () => {
    const start = "2026-06-02";

    it("round-trips weekly with interval + until", () => {
        const rule = recurrenceToRRule(
            {
                freq: "weekly",
                interval: 2,
                byDay: ["M", "W"],
                monthMode: "dayOfMonth",
                end: { kind: "until", date: "2026-09-22" },
            },
            start
        );
        expect(rruleToRecurrence(rule, start)).toEqual({
            freq: "weekly",
            interval: 2,
            byDay: ["M", "W"],
            monthMode: "dayOfMonth",
            end: { kind: "until", date: "2026-09-22" },
        });
    });

    it("round-trips daily with count", () => {
        const rule = recurrenceToRRule(
            {
                freq: "daily",
                interval: 3,
                byDay: [],
                monthMode: "dayOfMonth",
                end: { kind: "count", count: 13 },
            },
            start
        );
        const state = rruleToRecurrence(rule, start);
        expect(state.freq).toBe("daily");
        expect(state.interval).toBe(3);
        expect(state.end).toEqual({ kind: "count", count: 13 });
    });

    it("detects monthly nth-weekday mode", () => {
        const rule = "RRULE:FREQ=MONTHLY;INTERVAL=1;BYDAY=+3TU";
        expect(rruleToRecurrence(rule, "2026-06-16").monthMode).toBe(
            "dayOfWeek"
        );
    });

    it("empty weekly BYDAY falls back to start weekday", () => {
        const state = rruleToRecurrence(
            "RRULE:FREQ=WEEKLY;INTERVAL=1",
            "2026-06-02"
        );
        expect(state.byDay).toEqual(["T"]);
    });
});

describe("defaultRecurrence", () => {
    it("is weekly on the start weekday, never-ending", () => {
        expect(defaultRecurrence("2026-06-02")).toEqual({
            freq: "weekly",
            interval: 1,
            byDay: ["T"],
            monthMode: "dayOfMonth",
            end: { kind: "never" },
        });
    });
});

describe("recurringToRecurrence", () => {
    it("maps daysOfWeek + endRecur to a weekly state with until", () => {
        expect(
            recurringToRecurrence(
                ["M", "W"],
                "2026-06-01",
                "2026-09-22",
                "2026-06-02"
            )
        ).toEqual({
            freq: "weekly",
            interval: 1,
            byDay: ["M", "W"],
            monthMode: "dayOfMonth",
            end: { kind: "until", date: "2026-09-22" },
        });
    });
    it("empty daysOfWeek falls back to start weekday", () => {
        expect(
            recurringToRecurrence([], undefined, undefined, "2026-06-02").byDay
        ).toEqual(["T"]);
    });
});

describe("eventToRecurrenceState", () => {
    it("single event → not recurring, default state", () => {
        const ev = {
            type: "single",
            title: "x",
            date: "2026-06-02",
            allDay: true,
        } as NeoEvent;
        const r = eventToRecurrenceState(ev, "2026-06-02");
        expect(r.isRecurring).toBe(false);
        expect(r.recurrence.freq).toBe("weekly");
    });
    it("rrule event → recurring, parsed state", () => {
        const ev = {
            type: "rrule",
            title: "x",
            allDay: true,
            startDate: "2026-06-02",
            rrule: "RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TU",
            skipDates: [],
        } as NeoEvent;
        const r = eventToRecurrenceState(ev, "2026-06-02");
        expect(r.isRecurring).toBe(true);
        expect(r.recurrence.interval).toBe(2);
        expect(r.recurrence.byDay).toEqual(["T"]);
    });
});

describe("recurrenceToEventFields", () => {
    it("produces an rrule event payload fragment", () => {
        expect(
            recurrenceToEventFields(
                defaultRecurrence("2026-06-02"),
                "2026-06-02"
            )
        ).toEqual({
            type: "rrule",
            startDate: "2026-06-02",
            rrule: "RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=TU",
            skipDates: [],
        });
    });
});

describe("recurrenceSummary", () => {
    const weekly = (
        extra: Partial<Parameters<typeof recurrenceSummary>[0]> = {}
    ) =>
        recurrenceSummary(
            {
                freq: "weekly",
                interval: 2,
                byDay: ["T"],
                monthMode: "dayOfMonth",
                end: { kind: "never" },
                ...extra,
            },
            "2026-06-02"
        );

    // It is read out in the calendar's own language, which is what rrule's
    // toText() could never do — it answered in English inside French wording.
    it("reads a weekly rule out in the calendar's language", () => {
        expect(weekly()).toBe("Toutes les 2 semaines le mardi");
    });

    it("says a repeat that happens every time", () => {
        expect(weekly({ interval: 1 })).toBe("Toutes les semaines le mardi");
    });

    it("names every day a weekly rule falls on, in week order", () => {
        expect(weekly({ interval: 1, byDay: ["F", "M"] })).toBe(
            "Toutes les semaines le lundi, vendredi"
        );
    });

    it("adds the end, when there is one", () => {
        expect(
            weekly({ end: { kind: "until", date: "2026-08-30" } })
        ).toContain("jusqu'au");
        expect(weekly({ end: { kind: "count", count: 13 } })).toContain(
            "13 fois"
        );
    });

    it("keeps a rule with no weekday to a single clause", () => {
        expect(
            recurrenceSummary({
                freq: "daily",
                interval: 1,
                byDay: [],
                monthMode: "dayOfMonth",
                end: { kind: "never" },
            })
        ).toBe("Tous les jours");
    });
});

describe("presets", () => {
    it("weekly preset is on the start weekday", () => {
        const state = presetToRecurrence("weekly", "2026-06-02");
        expect(state.freq).toBe("weekly");
        expect(state.byDay).toEqual(["T"]);
    });
    it("matchPreset recognises a plain weekly-on-start-day rule", () => {
        expect(
            matchPreset(
                presetToRecurrence("weekly", "2026-06-02"),
                "2026-06-02"
            )
        ).toBe("weekly");
    });
    it("matchPreset returns custom for a 2-week interval", () => {
        expect(
            matchPreset(
                {
                    freq: "weekly",
                    interval: 2,
                    byDay: ["T"],
                    monthMode: "dayOfMonth",
                    end: { kind: "never" },
                },
                "2026-06-02"
            )
        ).toBe("custom");
    });
});
