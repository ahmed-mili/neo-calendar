import * as React from "react";
import { Check } from "lucide-react";
import { SettingsDialog } from "./SettingsPrimitives";
import ReminderCustomField from "./ReminderCustomField";
import { reminderDelayLabel } from "../../../src/ui/calendar/reminderDelay";
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
                    rouvrir pour la seconde moitié du choix. Le clic ne fait
                    rien d'autre que rester coché : c'est le champ, juste
                    dessous, qui écrit. */}
                {option("custom", t("Custom"), null, isCustom, () => undefined)}
                <ReminderCustomField
                    minutes={minutes}
                    fallbackMinutes={inheritedMinutes ?? 10}
                    onChange={onPick}
                />
            </div>
        </SettingsDialog>
    );
}
