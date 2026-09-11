import * as React from "react";
import type { CalendarMenuItem } from "../../../src/ui/calendar/CalendarItemMenu";
import { BellIcon, ClockIcon } from "../../../src/ui/calendar/EventPanelIcons";
import { LinkIcon } from "../../../src/ui/calendar/Icons";
import { isPrayerCalendarName } from "../../../src/ui/calendar/prayerCalendarName";
import { reminderDelayLabel } from "../../../src/ui/calendar/reminderDelay";
import { t } from "../../../src/ui/i18n";
import {
    MAX_REMINDER_MINUTES,
    REMINDER_CHOICES,
} from "./platform/desktopWorkspacePreferences";

export interface CalendarMenuContext {
    calendars: readonly { id: string; name: string; relativePath: string }[];
    /** Le rappel des Paramètres, celui de tous les calendriers qui n'ont rien dit. */
    reminderMinutes: number;
    /** Par chemin de calendrier, le délai qui s'en écarte. */
    calendarReminderMinutes: Record<string, number[]>;
    /** Vrai sur téléphone : pas de survol, les dialogues restent. */
    onPhone: boolean;
    /** `null` retire l'entrée : le calendrier suit de nouveau l'application. */
    setCalendarReminder: (
        relativePath: string,
        minutes: number[] | null
    ) => void;
    openReminderDialog: (calendarId: string) => void;
    openIcsFeeds: (calendarId: string) => void;
    openPrayerTimes: (calendarId: string) => void;
}

/**
 * Le sous-menu Rappel : la même liste que le dialogue, la coche sur le choix
 * courant, et un nombre de minutes au bout de la ligne Personnalisé. Choisir
 * une ligne écrit et referme ; écrire dans le champ écrit et laisse ouvert.
 */
function reminderSubmenu(
    context: CalendarMenuContext,
    relativePath: string
): Pick<CalendarMenuItem, "children"> {
    const current = context.calendarReminderMinutes[relativePath] ?? null;
    const set = (minutes: number[] | null) =>
        context.setCalendarReminder(relativePath, minutes);
    /* Cocher ou décocher une valeur : la liste reste triée et sans doublon. */
    const toggle = (minutes: number) => {
        const list = current ?? [];
        const next = list.includes(minutes)
            ? list.filter((value) => value !== minutes)
            : [...list, minutes].sort((a, b) => a - b);
        set(next);
    };
    /* Les délais cochés que la liste ne propose pas : écrits au champ, ils
       ont leur ligne pour pouvoir être décochés. */
    const extras = (current ?? []).filter(
        (minutes) => !REMINDER_CHOICES.includes(minutes)
    );
    return {
        children: [
            {
                key: "inherit",
                label: t("App setting"),
                note: reminderDelayLabel(context.reminderMinutes),
                checked: current === null,
                onClick: () => set(null),
            },
            {
                key: "none",
                label: t("No reminder"),
                checked: current !== null && current.length === 0,
                onClick: () => set([]),
            },
            ...REMINDER_CHOICES.filter((preset) => preset > 0).map(
                (preset) => ({
                    key: String(preset),
                    label: reminderDelayLabel(preset),
                    checked: current?.includes(preset) ?? false,
                    keepOpen: true,
                    onClick: () => toggle(preset),
                })
            ),
            ...extras.map((minutes) => ({
                key: `extra-${minutes}`,
                label: reminderDelayLabel(minutes),
                checked: true,
                keepOpen: true,
                onClick: () => toggle(minutes),
            })),
            {
                key: "custom",
                label: t("Custom"),
                keepOpen: true,
                onClick: () => undefined,
                // Un nombre de minutes, et rien d'autre : Entrée l'ajoute à
                // la liste, puis le champ se vide pour le suivant.
                trailing: (
                    <label className="nc-cal-menu-minutes">
                        <input
                            type="number"
                            min={1}
                            max={MAX_REMINDER_MINUTES}
                            aria-label={t("Custom")}
                            placeholder={String(context.reminderMinutes)}
                            onKeyDown={(event) => {
                                if (event.key !== "Enter") return;
                                const input = event.currentTarget;
                                const minutes = Math.floor(Number(input.value));
                                if (minutes >= 1) {
                                    toggle(
                                        Math.min(MAX_REMINDER_MINUTES, minutes)
                                    );
                                    input.value = "";
                                }
                            }}
                        />
                        min
                    </label>
                ),
            },
        ],
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
