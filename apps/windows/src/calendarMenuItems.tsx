import * as React from "react";
import type { CalendarMenuItem } from "../../../src/ui/calendar/CalendarItemMenu";
import { BellIcon, ClockIcon } from "../../../src/ui/calendar/EventPanelIcons";
import { LinkIcon } from "../../../src/ui/calendar/Icons";
import { isPrayerCalendarName } from "../../../src/ui/calendar/prayerCalendarName";
import { reminderDelayLabel } from "../../../src/ui/calendar/reminderDelay";
import { t } from "../../../src/ui/i18n";
import { REMINDER_CHOICES } from "./platform/desktopWorkspacePreferences";
import ReminderCustomField from "./ReminderCustomField";

export interface CalendarMenuContext {
    calendars: readonly { id: string; name: string; relativePath: string }[];
    /** Le rappel des Paramètres, celui de tous les calendriers qui n'ont rien dit. */
    reminderMinutes: number;
    /** Par chemin de calendrier, le délai qui s'en écarte. */
    calendarReminderMinutes: Record<string, number>;
    /** Vrai sur téléphone : pas de survol, les dialogues restent. */
    onPhone: boolean;
    /** `null` retire l'entrée : le calendrier suit de nouveau l'application. */
    setCalendarReminder: (relativePath: string, minutes: number | null) => void;
    openReminderDialog: (calendarId: string) => void;
    openIcsFeeds: (calendarId: string) => void;
    openPrayerTimes: (calendarId: string) => void;
}

/**
 * Le sous-menu Rappel : la même liste que le dialogue, la coche sur le choix
 * courant, et le champ personnalisé en bloc libre à la fin. Choisir une ligne
 * écrit et referme ; écrire dans le champ écrit et laisse ouvert.
 */
function reminderSubmenu(
    context: CalendarMenuContext,
    relativePath: string
): Pick<CalendarMenuItem, "children" | "content"> {
    const current = context.calendarReminderMinutes[relativePath] ?? null;
    const isCustom = current !== null && !REMINDER_CHOICES.includes(current);
    const set = (minutes: number | null) =>
        context.setCalendarReminder(relativePath, minutes);
    return {
        children: [
            {
                key: "inherit",
                label: t("App setting"),
                note: reminderDelayLabel(context.reminderMinutes),
                checked: current === null,
                onClick: () => set(null),
            },
            ...REMINDER_CHOICES.map((preset) => ({
                key: String(preset),
                label: reminderDelayLabel(preset),
                checked: current === preset,
                onClick: () => set(preset),
            })),
            {
                key: "custom",
                label: t("Custom"),
                checked: isCustom,
                keepOpen: true,
                onClick: () => undefined,
            },
        ],
        content: (
            <ReminderCustomField
                // La clé force un champ neuf quand le calendrier ou sa valeur
                // change de l'extérieur : le brouillon repart de la valeur lue.
                key={`${relativePath}:${current ?? "inherit"}`}
                minutes={current}
                fallbackMinutes={context.reminderMinutes}
                onChange={(minutes) => set(minutes)}
            />
        ),
    };
}

/**
 * Ce que l'application ajoute au menu d'un calendrier local : Rappel, Liens
 * ICS, et Horaires de prière pour le seul calendrier qui porte ce nom.
 *
 * Sur PC le rappel est un sous-menu ; sur téléphone, qui n'a pas de survol,
 * il ouvre le dialogue. Les deux autres ouvrent leurs fenêtres partout : ce
 * sont des champs à écrire, pas des choix.
 */
export function buildCalendarMenuItems(
    context: CalendarMenuContext,
    calendarId: string
): CalendarMenuItem[] {
    const calendar = context.calendars.find((entry) => entry.id === calendarId);
    if (!calendar) return [];
    const reminder: CalendarMenuItem = {
        key: "reminder",
        label: t("Reminder"),
        icon: <BellIcon />,
        ...(context.onPhone
            ? { onClick: () => context.openReminderDialog(calendarId) }
            : reminderSubmenu(context, calendar.relativePath)),
    };
    const items: CalendarMenuItem[] = [
        reminder,
        {
            key: "ics-feeds",
            label: t("ICS links"),
            icon: <LinkIcon />,
            onClick: () => context.openIcsFeeds(calendarId),
        },
    ];
    if (isPrayerCalendarName(calendar.name)) {
        items.push({
            key: "prayer-times",
            label: t("Prayer times"),
            icon: <ClockIcon />,
            onClick: () => context.openPrayerTimes(calendarId),
        });
    }
    return items;
}
