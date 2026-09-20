import * as React from "react";
import { Check } from "lucide-react";
import { SettingsDialog } from "./SettingsPrimitives";
import DelayCounterField from "./DelayCounterField";
import {
    reminderDelayLabel,
    reminderListLabel,
} from "../../../src/ui/calendar/reminderDelay";
import { REMINDER_CHOICES } from "./platform/desktopWorkspacePreferences";
import { t } from "../../../src/ui/i18n";

interface ReminderChoiceDialogBase {
    title: string;
    onClose: () => void;
}

/** Les Paramètres : les délais de toute l'application, vide pour aucun. */
export interface ReminderAppProps extends ReminderChoiceDialogBase {
    mode?: "app";
    minutes: number[];
    onPick: (minutes: number[]) => void;
}

/**
 * Un calendrier : la liste de ses délais, ou `null` quand c'est le réglage de
 * l'application qui vaut. La même chose que le sous-menu du PC, dans un
 * dialogue : les lignes se cochent et se décochent sans le refermer.
 */
export interface ReminderCalendarProps extends ReminderChoiceDialogBase {
    mode: "calendar";
    minutes: number[] | null;
    /** Le réglage des Paramètres, proposé en première ligne avec sa valeur. */
    inheritedMinutes: number[];
    onPick: (minutes: number[] | null) => void;
}

/**
 * Les prières d'un calendrier : zéro y est un délai comme un autre, « à
 * l'heure », et non le silence — l'adhan sonne à l'heure, pas avant. La liste
 * n'est jamais `null` : il n'y a pas de réglage d'application à hériter.
 */
export interface ReminderPrayerProps extends ReminderChoiceDialogBase {
    mode: "prayer";
    minutes: number[];
    onPick: (minutes: number[]) => void;
}

export type ReminderChoiceDialogProps =
    | ReminderAppProps
    | ReminderCalendarProps
    | ReminderPrayerProps;

/**
 * Le rappel par défaut — celui de l'application, ou ceux d'un calendrier.
 *
 * Une liste plutôt qu'un menu déroulant : les délais courants se choisissent
 * du premier coup, et la dernière ligne porte le compteur jours / heures /
 * minutes pour tous les autres. Sans lui, un délai à quarante-cinq minutes
 * resterait impossible à poser alors que les six autres se posent en un clic.
 *
 * Un calendrier n'enregistre quelque chose que pour s'écarter du réglage de
 * l'application : la première ligne est le retour en arrière, et elle dit à
 * quoi ce réglage est posé pour qu'on sache ce qu'on récupère.
 */
export default function ReminderChoiceDialog(props: ReminderChoiceDialogProps) {
    const { title, onClose } = props;
    const current = props.minutes;
    const chosen = current ?? [];

    const option = (
        key: string,
        label: string,
        note: string | null,
        selected: boolean,
        onClick: () => void,
        muted = false
    ) => (
        <button
            key={key}
            type="button"
            role="checkbox"
            aria-checked={selected}
            className={`nc-choice-option${
                muted ? " nc-choice-option--muted" : ""
            }`}
            onClick={onClick}
        >
            <span className="nc-choice-option__label">
                {label}
                {note && (
                    <small className="nc-choice-option__note">{note}</small>
                )}
            </span>
            {selected && (
                <Check size={19} className="nc-choice-option__check" />
            )}
        </button>
    );

    /* Cocher ou décocher une valeur : la liste reste triée et sans doublon,
       et le dialogue reste ouvert pour la suivante. */
    const write = (minutes: number[]) => props.onPick(minutes);
    const toggle = (minutes: number) =>
        write(
            chosen.includes(minutes)
                ? chosen.filter((value) => value !== minutes)
                : [...chosen, minutes].sort((a, b) => a - b)
        );
    // Pour une prière, zéro est une ligne qui se coche ; pour un évènement, il
    // n'a rien à dire que « Aucun rappel » ne dise déjà.
    const presets = REMINDER_CHOICES.filter(
        (preset) => preset > 0 || props.mode === "prayer"
    );
    /* Les délais cochés que la liste ne propose pas : écrits au compteur, ils
       ont leur ligne pour pouvoir être décochés. */
    const extras = chosen.filter((minutes) => !presets.includes(minutes));

    const none = option(
        "none",
        t("No reminder"),
        null,
        current !== null && current.length === 0,
        () => {
            write([]);
            onClose();
        }
    );

    return (
        <SettingsDialog title={title} onClose={onClose}>
            <div className="nc-choice-dialog__options" role="group">
                {props.mode === "calendar" &&
                    option(
                        "inherit",
                        t("App setting"),
                        reminderListLabel(props.inheritedMinutes),
                        current === null,
                        () => {
                            props.onPick(null);
                            onClose();
                        },
                        // Dès qu'on s'en écarte, la ligne se grise : elle n'est
                        // plus ce qui s'applique. Elle reste cliquable pour y
                        // revenir.
                        current !== null
                    )}
                {props.mode !== "prayer" && none}
                {presets.map((preset) =>
                    option(
                        String(preset),
                        preset === 0
                            ? t("At the prayer")
                            : reminderDelayLabel(preset),
                        null,
                        chosen.includes(preset),
                        () => toggle(preset)
                    )
                )}
                {extras.map((minutes) =>
                    option(
                        `extra-${minutes}`,
                        reminderDelayLabel(minutes),
                        null,
                        true,
                        () => toggle(minutes)
                    )
                )}
                {/* Pour une prière, le silence vient après les délais : la
                    liste s'ouvre sur « à l'heure », ce que presque tout le
                    monde garde. */}
                {props.mode === "prayer" && none}
                {/* La ligne Personnalisé ne se coche pas : c'est le compteur,
                    dessous, qui écrit, et le délai qu'il pose prend sa propre
                    ligne au-dessus. */}
                <div className="nc-choice-option nc-choice-option--static">
                    <span className="nc-choice-option__label">
                        {t("Custom")}
                    </span>
                </div>
                <DelayCounterField onAdd={toggle} />
            </div>
        </SettingsDialog>
    );
}
