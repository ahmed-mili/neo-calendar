import * as React from "react";
import { Check } from "lucide-react";
import { SettingsDialog } from "./SettingsPrimitives";
import DelayCounterField from "./DelayCounterField";
import { reminderDelayLabel } from "../../../src/ui/calendar/reminderDelay";
import { REMINDER_CHOICES } from "./platform/desktopWorkspacePreferences";
import { t } from "../../../src/ui/i18n";

interface ReminderChoiceDialogBase {
    title: string;
    onClose: () => void;
}

/** Les Paramètres : un seul délai, celui de toute l'application. */
export interface ReminderSingleProps extends ReminderChoiceDialogBase {
    mode?: "single";
    minutes: number;
    onPick: (minutes: number) => void;
}

/**
 * Un calendrier : la liste de ses délais, ou `null` quand c'est le réglage de
 * l'application qui vaut. La même chose que le sous-menu du PC, dans un
 * dialogue : les lignes se cochent et se décochent sans le refermer.
 */
export interface ReminderListProps extends ReminderChoiceDialogBase {
    mode: "list";
    minutes: number[] | null;
    /** Le réglage des Paramètres, proposé en première ligne avec sa valeur. */
    inheritedMinutes: number;
    onPick: (minutes: number[] | null) => void;
}

export type ReminderChoiceDialogProps = ReminderSingleProps | ReminderListProps;

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
    const list = props.mode === "list";
    const role = list ? "checkbox" : "radio";

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
            role={role}
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

    const presets = REMINDER_CHOICES.filter((preset) => preset > 0);

    let rows: React.ReactNode[];
    let onAdd: (minutes: number) => void;

    if (props.mode === "list") {
        const { minutes: current, inheritedMinutes, onPick } = props;
        const chosen = current ?? [];
        /* Cocher ou décocher une valeur : la liste reste triée et sans
           doublon, et le dialogue reste ouvert pour la suivante. */
        const toggle = (minutes: number) =>
            onPick(
                chosen.includes(minutes)
                    ? chosen.filter((value) => value !== minutes)
                    : [...chosen, minutes].sort((a, b) => a - b)
            );
        /* Les délais cochés que la liste ne propose pas : écrits au compteur,
           ils ont leur ligne pour pouvoir être décochés. */
        const extras = chosen.filter((minutes) => !presets.includes(minutes));
        onAdd = toggle;
        rows = [
            option(
                "inherit",
                t("App setting"),
                reminderDelayLabel(inheritedMinutes),
                current === null,
                () => {
                    onPick(null);
                    onClose();
                },
                // Dès qu'on s'en écarte, la ligne se grise : elle n'est plus
                // ce qui s'applique. Elle reste cliquable pour y revenir.
                current !== null
            ),
            option(
                "none",
                t("No reminder"),
                null,
                current !== null && current.length === 0,
                () => {
                    onPick([]);
                    onClose();
                }
            ),
            ...presets.map((preset) =>
                option(
                    String(preset),
                    reminderDelayLabel(preset),
                    null,
                    chosen.includes(preset),
                    () => toggle(preset)
                )
            ),
            ...extras.map((minutes) =>
                option(
                    `extra-${minutes}`,
                    reminderDelayLabel(minutes),
                    null,
                    true,
                    () => toggle(minutes)
                )
            ),
        ];
    } else {
        const { minutes, onPick } = props;
        const pick = (value: number) => {
            onPick(value);
            onClose();
        };
        onAdd = pick;
        rows = [
            option(
                "none",
                t("No reminder"),
                null,
                minutes === 0,
                () => pick(0)
            ),
            ...presets.map((preset) =>
                option(
                    String(preset),
                    reminderDelayLabel(preset),
                    null,
                    minutes === preset,
                    () => pick(preset)
                )
            ),
            /* Un délai que la liste ne propose pas a été écrit au compteur :
               il a sa ligne, cochée, pour qu'on voie ce qui vaut. */
            ...(minutes > 0 && !presets.includes(minutes)
                ? [
                      option(
                          "extra",
                          reminderDelayLabel(minutes),
                          null,
                          true,
                          () => undefined
                      ),
                  ]
                : []),
        ];
    }

    return (
        <SettingsDialog title={title} onClose={onClose}>
            <div
                className="nc-choice-dialog__options"
                role={list ? "group" : "radiogroup"}
            >
                {rows}
                {/* La ligne Personnalisé ne se coche pas : c'est le compteur,
                    dessous, qui écrit, et le délai qu'il pose prend sa propre
                    ligne au-dessus. */}
                <div className="nc-choice-option nc-choice-option--static">
                    <span className="nc-choice-option__label">
                        {t("Custom")}
                    </span>
                </div>
                <DelayCounterField onAdd={onAdd} />
            </div>
        </SettingsDialog>
    );
}
