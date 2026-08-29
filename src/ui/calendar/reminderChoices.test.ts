import {
    ALL_DAY_REMINDER_CHOICES,
    REMINDER_CHOICES,
    TIMED_REMINDER_CHOICES,
    allDayReminderLabelParts,
    reminderLabelParts,
    setReminderDisplayAllDay,
} from "./reminderChoices";
import { applyLanguage } from "../i18n";

describe("the reminders on offer", () => {
    afterEach(() => {
        setReminderDisplayAllDay(false);
        applyLanguage("fr");
    });

    it("offers five timed delays, from the event's own start to an hour out", () => {
        expect(TIMED_REMINDER_CHOICES).toEqual([0, 5, 10, 30, 60]);
        expect(REMINDER_CHOICES).toEqual([0, 5, 10, 30, 60]);
    });

    // Two parts, because they are not written alike: the delay carries the
    // weight, "before" trails behind it in grey.
    it("splits a timed delay from the word that follows it", () => {
        expect(reminderLabelParts(10)).toEqual({
            amount: "10 min",
            suffix: "avant",
        });
    });

    it("counts a full timed hour in hours", () => {
        expect(reminderLabelParts(60)).toEqual({
            amount: "1 heure",
            suffix: "avant",
        });
    });

    // Nothing trails "at the start of the event" — it is the whole sentence.
    it("names the start of a timed event on its own", () => {
        expect(reminderLabelParts(0)).toEqual({
            amount: "Au début de l'événement",
            suffix: "",
        });
    });

    it("switches the shared row to clock-time all-day presets", () => {
        setReminderDisplayAllDay(true);

        expect(ALL_DAY_REMINDER_CHOICES).toEqual([-540, 900, 2340, 9540]);
        expect(REMINDER_CHOICES).toEqual([-540, 900, 2340, 9540]);
        expect(reminderLabelParts(-540)).toEqual({
            amount: "09:00",
            suffix: "Same day",
        });
        expect(reminderLabelParts(900)).toEqual({
            amount: "09:00",
            suffix: "1 jour avant",
        });
    });

    it("reads an old arbitrary all-day offset as an actual day and clock time", () => {
        expect(allDayReminderLabelParts(10)).toEqual({
            amount: "23:50",
            suffix: "1 jour avant",
        });
    });

    it("speaks the language the app is set to", () => {
        applyLanguage("en");

        expect(reminderLabelParts(0, false).amount).toBe("At start of event");
        expect(reminderLabelParts(60, false)).toEqual({
            amount: "1 hour",
            suffix: "before",
        });
        expect(reminderLabelParts(-540, true)).toEqual({
            amount: "09:00",
            suffix: "Same day",
        });
        expect(reminderLabelParts(900, true)).toEqual({
            amount: "09:00",
            suffix: "1 day before",
        });
    });
});
