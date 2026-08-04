import { parseSharedCalendar, serializeSharedCalendar } from "./presets";

const calendar = {
    name: "Ramadan",
    icon: "moon-star",
    rules: [{ n: "Jeûne", k: "h" as const, hm: 9, hd: 1, ln: -1 }],
};

describe("sharing a custom calendar", () => {
    it("round-trips through JSON", () => {
        const result = parseSharedCalendar(serializeSharedCalendar(calendar));
        expect(result).toEqual({ ok: true, value: calendar });
    });

    it("rejects text that isn't JSON", () => {
        expect(parseSharedCalendar("not json")).toEqual({
            ok: false,
            error: "That isn't valid JSON.",
        });
    });

    it("rejects a calendar with no usable rules", () => {
        const result = parseSharedCalendar('{"name":"Empty","rules":[]}');
        expect(result.ok).toBe(false);
    });

    it("rejects a rule the engine cannot evaluate", () => {
        const result = parseSharedCalendar(
            '{"name":"Bad","rules":[{"n":"x","k":"f","m":13,"d":1}]}'
        );
        expect(result.ok).toBe(false);
    });

    it("keeps every rule kind intact", () => {
        const every = {
            name: "All kinds",
            icon: "star",
            rules: [
                { n: "a", k: "f" as const, m: 1, d: 1 },
                { n: "b", k: "e" as const, o: 39 },
                { n: "c", k: "n" as const, m: 6, w: 0, i: 3 },
                { n: "d", k: "x" as const, d: ["2026-01-01"] },
                { n: "e", k: "h" as const, hm: 1, hd: 10 },
                { n: "f", k: "hm" as const, hd: 13, ln: 3 },
                { n: "g", k: "w" as const, w: 4 },
            ],
        };
        const result = parseSharedCalendar(serializeSharedCalendar(every));
        expect(result.ok && result.value.rules).toHaveLength(7);
    });
});
