import { isPrayerCalendarName } from "./prayerCalendarName";

describe("isPrayerCalendarName", () => {
    it("recognises the calendar however its name is capitalised or spaced", () => {
        expect(isPrayerCalendarName("Islam")).toBe(true);
        expect(isPrayerCalendarName("islam")).toBe(true);
        expect(isPrayerCalendarName("  ISLAM  ")).toBe(true);
    });

    it("recognises the Arabic name, with or without its article and hamza", () => {
        // Le calendrier d'Ahmed, tel qu'il est écrit sur le disque : article,
        // hamza et toutes les voyelles.
        expect(isPrayerCalendarName("الْإِسْلَامُ")).toBe(true);
        expect(isPrayerCalendarName("إسلام")).toBe(true);
        expect(isPrayerCalendarName("الإسلام")).toBe(true);
        expect(isPrayerCalendarName("اسلام")).toBe(true);
        expect(isPrayerCalendarName("الاسلام")).toBe(true);
    });

    it("turns down every other name", () => {
        expect(isPrayerCalendarName("Cours")).toBe(false);
        expect(isPrayerCalendarName("Islamic studies")).toBe(false);
        expect(isPrayerCalendarName("Mon islam")).toBe(false);
        expect(isPrayerCalendarName("")).toBe(false);
        expect(isPrayerCalendarName(undefined)).toBe(false);
    });
});
