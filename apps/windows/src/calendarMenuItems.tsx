import * as React from "react";
import type { CalendarMenuItem } from "../../../src/ui/calendar/CalendarItemMenu";
import { BellIcon, ClockIcon } from "../../../src/ui/calendar/EventPanelIcons";
import { CheckIcon, LinkIcon } from "../../../src/ui/calendar/Icons";
import { isPrayerCalendarName } from "../../../src/ui/calendar/prayerCalendarName";
import {
    reminderDelayLabel,
    reminderMinutesFrom,
} from "../../../src/ui/calendar/reminderDelay";
import { t } from "../../../src/ui/i18n";
import { REMINDER_CHOICES } from "./platform/desktopWorkspacePreferences";

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
                // Dès qu'on s'en écarte, la ligne se grise : elle n'est plus
                // ce qui s'applique. Elle reste cliquable pour y revenir.
                muted: current !== null,
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
                // Un sous-menu à lui : l'unité s'y choisit comme une ligne, et
                // le nombre s'écrit en bas. Aucune ligne : tout est le bloc.
                children: [],
                content: <CustomDelayField onAdd={toggle} />,
            },
        ],
    };
}

/**
 * Le sous-menu « Personnalisé » : un compteur jours / heures / minutes, pour
 * poser un délai précis d'un coup (« 1 jour et 30 minutes »), et une coche
 * qui apparaît dès qu'une part est écrite. Entrée valide aussi.
 */
function CustomDelayField({ onAdd }: { onAdd: (minutes: number) => void }) {
    const [days, setDays] = React.useState("");
    const [hours, setHours] = React.useState("");
    const [minutes, setMinutes] = React.useState("");
    const whole = (value: string) =>
        Math.max(0, Math.floor(Number(value) || 0));
    const total = whole(days) * 1440 + whole(hours) * 60 + whole(minutes);
    const submit = () => {
        if (total < 1) return;
        onAdd(reminderMinutesFrom(total, "minutes"));
        setDays("");
        setHours("");
        setMinutes("");
    };
    /* Une seule case pour les trois nombres : « 1 j 0 h 30 min avant ». Les
       champs y sont nus, séparés par leur unité en abrégé, et la case entière
       se lit comme un seul réglage plutôt que trois. */
    const part = (
        label: string,
        short: string,
        value: string,
        set: (next: string) => void,
        max: number
    ) => (
        <label className="nc-cal-menu-delay__part">
            <input
                type="number"
                min={0}
                max={max}
                placeholder="0"
                aria-label={label}
                value={value}
                onChange={(event) => set(event.target.value)}
                onKeyDown={(event) => {
                    event.stopPropagation();
                    if (event.key === "Enter") submit();
                }}
            />
            <span aria-hidden="true">{short}</span>
        </label>
    );
    return (
        <div className="nc-cal-menu-delay">
            <span className="nc-cal-menu-delay__field">
                {part(t("days"), "j", days, setDays, 28)}
                {part(t("hours"), "h", hours, setHours, 23)}
                {part(t("minutes"), "min", minutes, setMinutes, 59)}
            </span>
            <span className="nc-cal-menu-delay__suffix">{t("before")}</span>
            {total >= 1 && (
                <button
                    type="button"
                    className="nc-cal-menu-minutes__ok"
                    aria-label={t("Add")}
                    data-nc-tooltip={t("Add")}
                    onClick={submit}
                >
                    <CheckIcon size={14} />
                </button>
            )}
        </div>
    );
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
