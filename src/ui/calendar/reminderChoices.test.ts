import { REMINDER_CHOICES, reminderLabelParts } from "./reminderChoices";
import { applyLanguage } from "../i18n";

describe("the reminders on offer", () => {
    afterEach(() => applyLanguage("fr"));

    it("offers five delays, from the event's own start to an hour out", () => {
        expect(REMINDER_CHOICES).toEqual([0, 5, 10, 30, 60]);
    });

    // Two parts, because they are not written alike: the delay carries the
    // weight, "before" trails behind it in grey.
    it("splits a delay from the word that follows it", () => {
        expect(reminderLabelParts(10)).toEqual({
            amount: "10 min",
            suffix: "avant",
        });
    });

    it("counts a full hour in hours", () => {
        expect(reminderLabelParts(60)).toEqual({
            amount: "1 heure",
            suffix: "avant",
        });
    });

    // Nothing trails "at the start of the event" — it is the whole sentence.
    it("names the start of the event on its own", () => {
        expect(reminderLabelParts(0)).toEqual({
            amount: "Au début de l'événement",
            suffix: "",
        });
    });

    it("speaks the language the app is set to", () => {
        applyLanguage("en");

        expect(reminderLabelParts(0).amount).toBe("At start of event");
        expect(reminderLabelParts(60)).toEqual({
            amount: "1 hour",
            suffix: "before",
        });
    });
});
