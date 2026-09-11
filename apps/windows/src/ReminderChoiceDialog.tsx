import * as React from "react";
import { Check } from "lucide-react";
import { SettingsDialog } from "./SettingsPrimitives";
import {
    REMINDER_UNITS,
    ReminderDelay,
    reminderDelayLabel,
    reminderMinutesFrom,
    splitReminderDelay,
} from "../../../src/ui/calendar/reminderDelay";
import { REMINDER_CHOICES } from "./platform/desktopWorkspacePreferences";
import { t } from "../../../src/ui/i18n";

export interface ReminderChoiceDialogProps {
    title: string;
    /** Le délai réglé, ou `null` quand c'est celui de l'application qui vaut. */
    minutes: number | null;
    /**
     * Le réglage des Paramètres, proposé en première ligne et affiché avec sa
     * valeur du moment. Absent quand c'est ce réglage-là qu'on choisit : lui
     * proposer de se suivre lui-même ne voudrait rien dire.
     */
    inheritedMinutes?: number;
    onPick: (minutes: number | null) => void;
    onClose: () => void;
}

/**
 * Le rappel par défaut — celui de l'application, ou celui d'un calendrier.
 *
 * Une liste plutôt qu'un menu déroulant : les délais courants se choisissent
 * du premier coup, et la dernière ligne ouvre un champ pour tous les autres.
 * Sans ce champ, un défaut à quarante-cinq minutes resterait impossible à
 * poser alors que les six autres se posent en un clic.
 *
 * Un calendrier n'enregistre quelque chose que pour s'écarter du réglage de
 * l'application : la première ligne est le retour en arrière, et elle dit à
 * quoi ce réglage est posé pour qu'on sache ce qu'on récupère.
 */
export default function ReminderChoiceDialog({
    title,
    minutes,
    inheritedMinutes,
    onPick,
    onClose,
}: ReminderChoiceDialogProps) {
    const isCustom = minutes !== null && !REMINDER_CHOICES.includes(minutes);
    // Le champ s'ouvre sur le délai en cours, relu dans son unité ; à défaut
    // sur celui de l'application, qui est ce dont on part pour s'en écarter.
    const [draft, setDraft] = React.useState(() =>
        splitReminderDelay(minutes ?? inheritedMinutes ?? 10)
    );

    /*
     * Le brouillon est tenu dans une référence autant que dans un état.
     *
     * Changer le nombre puis l'unité, c'est deux modifications avant que React
     * ne redessine : lue depuis l'état, la seconde repartirait du nombre
     * d'avant et « 2 heures » serait enregistré comme quarante-cinq heures.
     */
    const draftRef = React.useRef(draft);

    const commit = (patch: Partial<ReminderDelay>) => {
        const next = { ...draftRef.current, ...patch };
        draftRef.current = next;
        setDraft(next);
        onPick(reminderMinutesFrom(next.amount, next.unit));
    };

    const option = (
        key: string,
        label: string,
        note: string | null,
        selected: boolean,
        onClick: () => void
    ) => (
        <button
            key={key}
            type="button"
            role="radio"
            aria-checked={selected}
            className="nc-choice-option"
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

    return (
        <SettingsDialog title={title} onClose={onClose}>
            <div className="nc-choice-dialog__options" role="radiogroup">
                {inheritedMinutes !== undefined &&
                    option(
                        "inherit",
                        t("App setting"),
                        reminderDelayLabel(inheritedMinutes),
                        minutes === null,
                        () => {
                            onPick(null);
                            onClose();
                        }
                    )}
                {REMINDER_CHOICES.map((preset) =>
                    option(
                        String(preset),
                        reminderDelayLabel(preset),
                        null,
                        minutes === preset,
                        () => {
                            onPick(preset);
                            onClose();
                        }
                    )
                )}
                {/* La ligne reste ouverte pendant qu'on y écrit : on y revient
                    pour corriger l'unité juste après le nombre, et un
                    dialogue qui se referme au premier chiffre obligerait à le
                    rouvrir pour la seconde moitié du choix. */}
                {option("custom", t("Custom"), null, isCustom, () =>
                    commit({})
                )}
                <div className="nc-reminder-custom">
                    <input
                        type="number"
                        min={1}
                        className="nc-reminder-custom__amount"
                        aria-label={t("Custom")}
                        value={draft.amount}
                        onChange={(event) =>
                            commit({ amount: Number(event.target.value) })
                        }
                    />
                    {/* Trois unités, donc trois boutons : un menu déroulant
                        natif ouvrirait un popup dessiné par le système, que le
                        thème ne sait pas habiller — c'est la raison qui a déjà
                        écarté `<select>` du panneau d'évènement. */}
                    <div
                        className="nc-reminder-custom__units"
                        role="group"
                        aria-label={t("Unit")}
                    >
                        {REMINDER_UNITS.map((unit) => (
                            <button
                                key={unit}
                                type="button"
                                data-unit={unit}
                                className="nc-reminder-custom__unit"
                                aria-pressed={draft.unit === unit}
                                onClick={() => commit({ unit })}
                            >
                                {t(unit)}
                            </button>
                        ))}
                    </div>
                    <span className="nc-reminder-custom__suffix">
                        {t("before")}
                    </span>
                </div>
            </div>
        </SettingsDialog>
    );
}
