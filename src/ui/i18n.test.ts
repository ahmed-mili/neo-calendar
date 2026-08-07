import { applyLanguage, getLanguage, t, tList } from "./i18n";

afterEach(() => applyLanguage("fr"));

describe("t", () => {
    it("reads a phrase in French", () => {
        applyLanguage("fr");
        expect(t("Add event")).toBe("Ajouter un événement");
    });

    // The English string IS the key, so English needs no dictionary of its own
    // and can never fall out of step with the call sites.
    it("reads the key itself in English", () => {
        applyLanguage("en");
        expect(t("Add event")).toBe("Add event");
    });

    // A phrase nobody has translated yet must still be readable: showing the
    // English is a gap, showing `calendar.event.add` is a bug on screen.
    it("falls back to the phrase rather than to a key", () => {
        applyLanguage("fr");
        expect(t("Something nobody translated")).toBe(
            "Something nobody translated"
        );
    });
});

describe("tList", () => {
    it("reads the months in French", () => {
        applyLanguage("fr");
        expect(tList("months.short", [])[0]).toBe("janv.");
        expect(tList("months.short", [])).toHaveLength(12);
    });

    it("reads the days in French", () => {
        applyLanguage("fr");
        expect(tList("days.short", [])).toEqual([
            "dim.",
            "lun.",
            "mar.",
            "mer.",
            "jeu.",
            "ven.",
            "sam.",
        ]);
    });

    it("hands back the English list when there is no entry", () => {
        applyLanguage("en");
        expect(tList("months.short", ["Jan", "Feb"])).toEqual(["Jan", "Feb"]);
    });
});

describe("getLanguage", () => {
    it("reports the language in force", () => {
        applyLanguage("en");
        expect(getLanguage()).toBe("en");
        applyLanguage("fr");
        expect(getLanguage()).toBe("fr");
    });
});
