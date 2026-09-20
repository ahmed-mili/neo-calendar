import { prayerRemindersFor } from "./prayerReminders";
import type { PrayerTimetable } from "../../../../src/ui/calendar/prayerTimes";
import { applyLanguage } from "../../../../src/ui/i18n";

beforeEach(() => applyLanguage("fr"));

/** Une table minuscule, aux heures rondes, pour que les attentes se lisent. */
const table: PrayerTimetable = {
    id: "essai",
    name: "Mosquée d'essai",
    year: 2026,
    jumua: ["13:00", "14:00"],
    days: {
        // [fajr, chourouk, dhuhr, asr, maghrib, isha]
        "09-01": [6 * 60, 8 * 60, 13 * 60 + 30, 17 * 60, 20 * 60, 21 * 60 + 30],
        "09-02": [6 * 60, 8 * 60, 13 * 60 + 30, 17 * 60, 20 * 60, 21 * 60 + 30],
        "09-04": [6 * 60, 8 * 60, 13 * 60 + 30, 17 * 60, 20 * 60, 21 * 60 + 30],
    },
};

const at = (iso: string) => new Date(iso);

const remind = (now: Date, minutes: number[] = [0]) =>
    prayerRemindersFor({ timetable: table, minutes, now, timeFormat24h: true });

describe("the reminders of a day's prayers", () => {
    it("rings once per prayer of today and tomorrow, at the prayer itself", () => {
        const reminders = remind(at("2026-09-01T10:00:00"));
        expect(reminders.map((item) => item.title)).toEqual([
            "Fajr",
            "Dhuhr",
            "Asr",
            "Maghrib",
            "Isha",
            "Fajr",
            "Dhuhr",
            "Asr",
            "Maghrib",
            "Isha",
        ]);
        expect(reminders[1].atMs).toBe(+at("2026-09-01T13:30:00"));
        expect(reminders[5].atMs).toBe(+at("2026-09-02T06:00:00"));
    });

    it("names Jumu'a on a Friday, once per sitting", () => {
        const friday = remind(at("2026-09-04T10:00:00"));
        const midday = friday.filter((item) => item.title === "Jumu'a");
        expect(midday.map((item) => item.atMs)).toEqual([
            +at("2026-09-04T13:00:00"),
            +at("2026-09-04T14:00:00"),
        ]);
        expect(friday.some((item) => item.title === "Dhuhr")).toBe(false);
    });

    it("says the time and the mosque, so the bubble stands on its own", () => {
        const [fajr] = remind(at("2026-09-01T05:00:00"));
        expect(fajr.body).toBe("C'est l'heure · 06:00 · Mosquée d'essai");
        expect(fajr.details).toBe("Mosquée d'essai");
    });

    it("rings ahead of the prayer when asked, once per delay", () => {
        const reminders = remind(at("2026-09-01T05:00:00"), [0, 10]);
        const fajr = reminders.filter((item) => item.title === "Fajr");
        expect(fajr.map((item) => item.atMs)).toEqual(
            expect.arrayContaining([
                +at("2026-09-01T05:50:00"),
                +at("2026-09-01T06:00:00"),
            ])
        );
        const early = fajr.find(
            (item) => item.atMs === +at("2026-09-01T05:50:00")
        );
        expect(early?.body).toBe("Dans 10 min · 06:00 · Mosquée d'essai");
    });

    it("tells two reminders of the same prayer apart, and two days apart", () => {
        const keys = remind(at("2026-09-01T10:00:00"), [0, 10]).map(
            (item) => item.key
        );
        expect(new Set(keys).size).toBe(keys.length);
    });

    it("stays silent when the list of delays is empty", () => {
        expect(remind(at("2026-09-01T10:00:00"), [])).toEqual([]);
    });

    it("stays silent on a day the table does not cover", () => {
        // Le 3 septembre manque à la table : rien pour demain, et rien
        // d'inventé à sa place.
        const reminders = remind(at("2026-09-02T10:00:00"));
        expect(reminders).toHaveLength(5);
        expect(remind(at("2027-09-01T10:00:00"))).toEqual([]);
    });
});
