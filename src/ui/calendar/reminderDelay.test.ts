import { applyLanguage, t } from "../i18n";
import {
    REMINDER_UNITS,
    relativeDelayLabel,
    reminderDelayLabel,
    reminderListLabel,
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
        expect(reminderDelayLabel(1470)).toBe("1 jour 30 minutes avant");
        expect(reminderDelayLabel(1501)).toBe("1 jour 1 heure 1 minute avant");
    });
});

describe("reminderListLabel", () => {
    it("names each delay once, and « avant » once at the end", () => {
        expect(reminderListLabel([5, 60])).toBe(
            `5 minutes, 1 heure ${t("before")}`
        );
    });

    it("names the empty list as silence", () => {
        expect(reminderListLabel([])).toBe(t("No reminder"));
    });
});

describe("relativeDelayLabel", () => {
    beforeEach(() => applyLanguage("fr"));

    /* Le défaut signalé par Ahmed le 2026-09-16 : un rappel réglé à 1 h 30
       annonçait « 90 min », et il fallait faire la division soi-même. */
    it("reads a compound delay the way it is said out loud", () => {
        expect(relativeDelayLabel(90)).toBe("1 h 30");
        expect(relativeDelayLabel(125)).toBe("2 h 05");
        expect(relativeDelayLabel(1439)).toBe("23 h 59");
    });

    it("keeps minutes below the hour", () => {
        expect(relativeDelayLabel(1)).toBe("1 min");
        expect(relativeDelayLabel(45)).toBe("45 min");
        expect(relativeDelayLabel(59)).toBe("59 min");
    });

    it("drops the remainder when there is none", () => {
        expect(relativeDelayLabel(60)).toBe("1 h");
        expect(relativeDelayLabel(120)).toBe("2 h");
        expect(relativeDelayLabel(2880)).toBe("2 j");
    });

    /* Un jour entier se dit « 1 j », jamais « 24 h » : c'est la même durée,
       mais pas la même façon de se la représenter. */
    it("counts in days past the day", () => {
        expect(relativeDelayLabel(1440)).toBe("1 j");
        expect(relativeDelayLabel(1470)).toBe("1 j 30 min");
        expect(relativeDelayLabel(3600)).toBe("2 j 12 h");
    });

    it("names silence rather than writing a zero", () => {
        expect(relativeDelayLabel(0)).toBe(t("Starting now"));
        expect(relativeDelayLabel(-10)).toBe(t("Starting now"));
    });
});
