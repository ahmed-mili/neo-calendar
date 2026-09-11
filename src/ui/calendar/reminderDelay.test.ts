import { applyLanguage, t } from "../i18n";
import {
    REMINDER_UNITS,
    reminderDelayLabel,
    reminderMinutesFrom,
    splitReminderDelay,
} from "./reminderDelay";

describe("splitReminderDelay", () => {
    it("reads a delay back in the largest unit that leaves no remainder", () => {
        expect(splitReminderDelay(45)).toEqual({ amount: 45, unit: "minutes" });
        expect(splitReminderDelay(60)).toEqual({ amount: 1, unit: "hours" });
        expect(splitReminderDelay(150)).toEqual({
            amount: 150,
            unit: "minutes",
        });
        expect(splitReminderDelay(1440)).toEqual({ amount: 1, unit: "days" });
        expect(splitReminderDelay(2880)).toEqual({ amount: 2, unit: "days" });
    });

    /* Zéro veut dire « aucun rappel », pas « zéro minute » : le champ
       personnalisé doit s'ouvrir sur une valeur qu'on peut enregistrer. */
    it("opens on ten minutes rather than on nothing at all", () => {
        expect(splitReminderDelay(0)).toEqual({ amount: 10, unit: "minutes" });
    });
});

describe("reminderMinutesFrom", () => {
    it("ranges every unit into minutes", () => {
        expect(reminderMinutesFrom(45, "minutes")).toBe(45);
        expect(reminderMinutesFrom(2, "hours")).toBe(120);
        expect(reminderMinutesFrom(3, "days")).toBe(4320);
    });

    it("holds the value inside what the preferences accept", () => {
        expect(reminderMinutesFrom(0, "minutes")).toBe(1);
        expect(reminderMinutesFrom(-5, "minutes")).toBe(1);
        expect(reminderMinutesFrom(12.7, "minutes")).toBe(12);
        expect(reminderMinutesFrom(99, "days")).toBe(40320);
    });

    it("offers the three units a delay is written in", () => {
        expect(REMINDER_UNITS).toEqual(["minutes", "hours", "days"]);
    });
});

describe("reminderDelayLabel", () => {
    beforeEach(() => applyLanguage("fr"));

    it("names the silence rather than a delay of zero", () => {
        expect(reminderDelayLabel(0)).toBe(t("No reminder"));
    });

    it("spells a delay out in the unit it was written in", () => {
        expect(reminderDelayLabel(1)).toBe("1 minute avant");
        expect(reminderDelayLabel(45)).toBe("45 minutes avant");
        expect(reminderDelayLabel(60)).toBe("1 heure avant");
        expect(reminderDelayLabel(120)).toBe("2 heures avant");
        expect(reminderDelayLabel(1440)).toBe("1 jour avant");
        expect(reminderDelayLabel(2880)).toBe("2 jours avant");
    });
});
