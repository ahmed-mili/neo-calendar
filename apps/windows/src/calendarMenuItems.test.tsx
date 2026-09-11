/** @jest-environment jsdom */
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act, Simulate } from "react-dom/test-utils";
import {
    buildCalendarMenuItems,
    CalendarMenuContext,
} from "./calendarMenuItems";
import { applyLanguage, t } from "../../../src/ui/i18n";

describe("buildCalendarMenuItems", () => {
    beforeEach(() => applyLanguage("fr"));

    const context = (
        over: Partial<CalendarMenuContext> = {}
    ): CalendarMenuContext => ({
        calendars: [
            { id: "cours", name: "Cours", relativePath: "Études" },
            { id: "islam", name: "الْإِسْلَامُ", relativePath: "الْإِسْلَامُ" },
        ],
        reminderMinutes: 10,
        calendarReminderMinutes: {},
        onPhone: false,
        setCalendarReminder: jest.fn(),
        openReminderDialog: jest.fn(),
        openIcsFeeds: jest.fn(),
        openPrayerTimes: jest.fn(),
        ...over,
    });

    const labels = (ctx: CalendarMenuContext, id: string) =>
        buildCalendarMenuItems(ctx, id).map((item) => item.label);

    it("propose Rappel et Liens ICS à tout calendrier, Horaires de prière au seul calendrier Islam", () => {
        expect(labels(context(), "cours")).toEqual([
            t("Reminder"),
            t("ICS links"),
        ]);
        expect(labels(context(), "islam")).toEqual([
            t("Reminder"),
            t("ICS links"),
            t("Prayer times"),
        ]);
    });

    it("sur PC, Rappel est un sous-menu qui coche le réglage de l'application par défaut", () => {
        const [reminder] = buildCalendarMenuItems(context(), "cours");
        expect(reminder.children).toBeDefined();
        const app = reminder.children![0];
        expect(app.label).toBe(t("App setting"));
        expect(app.note).toBe("10 minutes avant");
        expect(app.checked).toBe(true);
        expect(reminder.children!.map((c) => c.label)).toEqual([
            t("App setting"),
            t("No reminder"),
            "5 minutes avant",
            "10 minutes avant",
            "15 minutes avant",
            "30 minutes avant",
            "1 heure avant",
            t("Custom"),
        ]);
    });

    it("coche la valeur enregistrée, et écrit celle qu'on choisit", () => {
        const ctx = context({ calendarReminderMinutes: { Études: 30 } });
        const [reminder] = buildCalendarMenuItems(ctx, "cours");
        const thirty = reminder.children!.find(
            (c) => c.label === "30 minutes avant"
        )!;
        expect(thirty.checked).toBe(true);
        reminder.children!.find((c) => c.label === "5 minutes avant")!
            .onClick!();
        expect(ctx.setCalendarReminder).toHaveBeenCalledWith("Études", 5);
    });

    it("« Réglage de l'application » retire l'entrée du calendrier", () => {
        const ctx = context({ calendarReminderMinutes: { Études: 30 } });
        const [reminder] = buildCalendarMenuItems(ctx, "cours");
        reminder.children![0].onClick!();
        expect(ctx.setCalendarReminder).toHaveBeenCalledWith("Études", null);
    });

    it("coche Personnalisé pour un délai hors liste, et son champ écrit en minutes", () => {
        const ctx = context({ calendarReminderMinutes: { Études: 120 } });
        const [reminder] = buildCalendarMenuItems(ctx, "cours");
        const custom = reminder.children!.find((c) => c.label === t("Custom"))!;
        expect(custom.checked).toBe(true);
        expect(custom.keepOpen).toBe(true);
        const host = document.createElement("div");
        document.body.appendChild(host);
        act(() => {
            ReactDOM.render(<>{reminder.content}</>, host);
        });
        const amount = host.querySelector<HTMLInputElement>(
            ".nc-reminder-custom__amount"
        )!;
        expect(amount.value).toBe("2");
        act(() => {
            amount.value = "3";
            Simulate.change(amount);
        });
        expect(ctx.setCalendarReminder).toHaveBeenLastCalledWith("Études", 180);
        act(() => {
            ReactDOM.unmountComponentAtNode(host);
        });
        host.remove();
    });

    it("sur téléphone, Rappel ouvre le dialogue", () => {
        const ctx = context({ onPhone: true });
        const [reminder] = buildCalendarMenuItems(ctx, "cours");
        expect(reminder.children).toBeUndefined();
        reminder.onClick!();
        expect(ctx.openReminderDialog).toHaveBeenCalledWith("cours");
    });

    it("Liens ICS et Horaires de prière ouvrent leurs fenêtres", () => {
        const ctx = context();
        const items = buildCalendarMenuItems(ctx, "islam");
        items[1].onClick!();
        items[2].onClick!();
        expect(ctx.openIcsFeeds).toHaveBeenCalledWith("islam");
        expect(ctx.openPrayerTimes).toHaveBeenCalledWith("islam");
    });

    it("ne construit rien pour un calendrier inconnu", () => {
        expect(buildCalendarMenuItems(context(), "absent")).toEqual([]);
    });
});
