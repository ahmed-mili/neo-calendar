import {
    dayKey,
    nextPrayer,
    prayerLinesFor,
    prayersOn,
    type PrayerTimetable,
} from "./prayerTimes";
import { PRAYER_TIMETABLES, prayerTimetableById } from "./prayerTimetables";

/** Une table minuscule, aux heures rondes, pour que les attentes se lisent. */
const table: PrayerTimetable = {
    id: "essai",
    name: "Mosquée d'essai",
    year: 2026,
    jumua: ["13:00", "14:00"],
    days: {
        // [fajr, chourouk, dhuhr, asr, maghrib, isha]
        "09-01": [6 * 60, 8 * 60, 13 * 60 + 30, 17 * 60, 20 * 60, 21 * 60 + 30],
        "09-04": [6 * 60, 8 * 60, 13 * 60 + 30, 17 * 60, 20 * 60, 21 * 60 + 30],
        "09-05": [6 * 60, 8 * 60, 13 * 60 + 30, 17 * 60, 20 * 60, 21 * 60 + 30],
    },
};

const at = (iso: string) => new Date(iso);

describe("the prayers of a day", () => {
    it("gives five, without sunrise among them", () => {
        const prayers = prayersOn(table, at("2026-09-01T10:00:00"));
        expect(prayers.map((prayer) => prayer.name)).toEqual([
            "fajr",
            "dhuhr",
            "asr",
            "maghrib",
            "isha",
        ]);
        // Chourouk est le lever du soleil, la fin du temps de Fajr : lu dans le
        // PDF, jamais affiché comme une prière.
        expect(prayers.some((prayer) => prayer.minutes === 8 * 60)).toBe(false);
    });

    /*
     * Le vendredi, la prière de midi est la prière commune : Dhuhr n'a pas lieu
     * en plus, il est remplacé. Une mosquée qui annonce deux séances en a bien
     * deux — deux prêches faute de place — donc les deux sont rendues.
     */
    it("replaces Dhuhr by the Jumu'a sessions on a Friday", () => {
        const friday = prayersOn(table, at("2026-09-04T10:00:00"));
        expect(friday.map((prayer) => prayer.name)).toEqual([
            "fajr",
            "jumua",
            "jumua",
            "asr",
            "maghrib",
            "isha",
        ]);
        expect(
            friday
                .filter((prayer) => prayer.name === "jumua")
                .map((prayer) => prayer.minutes)
        ).toEqual([13 * 60, 14 * 60]);
        expect(friday.some((prayer) => prayer.name === "dhuhr")).toBe(false);
    });

    it("says nothing for a day the timetable does not cover", () => {
        expect(prayersOn(table, at("2026-09-02T10:00:00"))).toEqual([]);
        // L'année suivante n'est pas dans la table : rien, plutôt qu'une heure
        // reprise à l'aveugle sur le même jour de l'année précédente.
        expect(prayersOn(table, at("2027-09-01T10:00:00"))).toEqual([]);
    });
});

describe("the next prayer", () => {
    it("is the first one still to come today", () => {
        expect(nextPrayer(table, at("2026-09-01T10:00:00"))).toMatchObject({
            name: "dhuhr",
            minutes: 13 * 60 + 30,
        });
        expect(nextPrayer(table, at("2026-09-01T19:59:00"))).toMatchObject({
            name: "maghrib",
        });
    });

    it("is exclusive: a prayer happening this very minute is not to come", () => {
        expect(nextPrayer(table, at("2026-09-01T13:30:00"))).toMatchObject({
            name: "asr",
        });
    });

    // Passé Isha il n'y a plus rien à attendre du jour, et le trait doit
    // pouvoir désigner une autre colonne que celle d'aujourd'hui.
    it("crosses midnight to tomorrow's Fajr after Isha", () => {
        const next = nextPrayer(table, at("2026-09-04T23:00:00"));
        expect(next).toMatchObject({ name: "fajr", minutes: 6 * 60 });
        expect(next?.date.getDate()).toBe(5);
    });

    it("is nothing at all when tomorrow is not covered either", () => {
        expect(nextPrayer(table, at("2026-09-05T23:00:00"))).toBeNull();
    });

    it("takes the second Jumu'a session as next once the first has passed", () => {
        expect(nextPrayer(table, at("2026-09-04T13:15:00"))).toMatchObject({
            name: "jumua",
            minutes: 14 * 60,
        });
    });
});

describe("the timetables that ship with the app", () => {
    it("covers a whole year each, with its own Jumu'a sessions", () => {
        expect(PRAYER_TIMETABLES.length).toBeGreaterThanOrEqual(3);
        for (const timetable of PRAYER_TIMETABLES) {
            expect(Object.keys(timetable.days)).toHaveLength(365);
            expect(timetable.jumua.length).toBeGreaterThanOrEqual(1);
            for (const minutes of Object.values(timetable.days)) {
                expect(minutes).toHaveLength(6);
            }
        }
    });

    /*
     * Les heures d'un jour montent : Fajr avant le lever, le lever avant Dhuhr,
     * et ainsi de suite. Une table dont la mise en page aurait changé sous le
     * lecteur produirait des colonnes mélangées, et c'est le seul contrôle qui
     * l'attrape sans réimporter le PDF.
     */
    it("keeps every day's hours in ascending order", () => {
        for (const timetable of PRAYER_TIMETABLES) {
            for (const [key, minutes] of Object.entries(timetable.days)) {
                const sorted = [...minutes].sort((a, b) => a - b);
                expect({ id: timetable.id, key, minutes }).toEqual({
                    id: timetable.id,
                    key,
                    minutes: sorted,
                });
            }
        }
    });

    it("is found by id, and nothing is found without one", () => {
        expect(prayerTimetableById("villejuif")?.name).toContain("Villejuif");
        expect(prayerTimetableById(null)).toBeNull();
        expect(prayerTimetableById("mosquée inconnue")).toBeNull();
    });

    it("puts the day keys in the shape dayKey builds", () => {
        for (const timetable of PRAYER_TIMETABLES) {
            expect(timetable.days[dayKey(new Date(2026, 8, 1))]).toBeDefined();
        }
    });
});

describe("the lines the grid is asked to draw", () => {
    /*
     * Ce que le téléphone montre, et ce que l'ordinateur montre au repos : la
     * prochaine prière, une seule.
     */
    it("is the next prayer alone when nothing is held", () => {
        expect(
            prayerLinesFor({
                timetable: table,
                now: at("2026-09-01T10:00:00"),
                showAll: false,
            })
        ).toEqual([
            {
                date: new Date(2026, 8, 1),
                hours: 13.5,
                next: true,
            },
        ]);
    });

    // Tant qu'on tient la touche : les cinq heures du jour, et la prochaine
    // reste la seule marquée comme telle — deux traits à la même hauteur se
    // disputeraient la même rangée.
    it("adds the rest of the day while the key is held, without doubling the next", () => {
        const lines = prayerLinesFor({
            timetable: table,
            now: at("2026-09-01T10:00:00"),
            showAll: true,
        });
        expect(lines).toHaveLength(5);
        expect(lines.filter((line) => line.next)).toHaveLength(1);
        expect(lines.map((line) => line.hours).sort((a, b) => a - b)).toEqual([
            6, 13.5, 17, 20, 21.5,
        ]);
    });

    it("draws six on a Friday, the two Jumu'a sessions counted", () => {
        const lines = prayerLinesFor({
            timetable: table,
            now: at("2026-09-04T10:00:00"),
            showAll: true,
        });
        expect(lines).toHaveLength(6);
        expect(
            lines.filter((line) => line.hours === 13 || line.hours === 14)
        ).toHaveLength(2);
    });

    // Le trait de la prochaine prière peut désigner demain : passé Isha, c'est
    // le Fajr du lendemain, donc une autre colonne.
    it("puts the next line on tomorrow's column after Isha", () => {
        const [line] = prayerLinesFor({
            timetable: table,
            now: at("2026-09-04T23:00:00"),
            showAll: false,
        });
        expect(line.date.getDate()).toBe(5);
        expect(line.hours).toBe(6);
    });

    it("draws nothing at all without a mosque", () => {
        expect(
            prayerLinesFor({
                timetable: null,
                now: at("2026-09-01T10:00:00"),
                showAll: true,
            })
        ).toEqual([]);
    });
});
