import * as React from "react";
import { Check } from "lucide-react";
import { SettingsDialog } from "./SettingsPrimitives";
import type { JumuaChoice } from "../../../src/ui/calendar/prayerTimetables";
import { t } from "../../../src/ui/i18n";

export interface JumuaChoiceDialogProps {
    /** Les séances des mosquées enregistrées, seules heures possibles. */
    choices: JumuaChoice[];
    /** Celles qui valent pour ce calendrier, en ce moment. */
    selected: string[];
    /** Celles de la mosquée suivie : la réponse quand rien n'est choisi. */
    inherited: string[];
    /** `null` retire le réglage : la mosquée suivie répond de nouveau. */
    onPick: (times: string[] | null) => void;
    onClose: () => void;
}

/**
 * Où l'on fait la Jumu'a.
 *
 * On suit les horaires d'une mosquée et l'on prie le vendredi dans une autre :
 * les séances se cochent parmi celles que les mosquées enregistrées annoncent,
 * jamais en saisie libre — une heure qu'aucune mosquée ne tient n'a rien à
 * faire sur la grille. Tout décocher, c'est revenir à celles de la mosquée
 * suivie, et non n'en avoir aucune.
 */
export default function JumuaChoiceDialog({
    choices,
    selected,
    inherited,
    onPick,
    onClose,
}: JumuaChoiceDialogProps) {
    const toggle = (time: string) => {
        const next = selected.includes(time)
            ? selected.filter((value) => value !== time)
            : [...selected, time].sort();
        onPick(next.length === 0 ? null : next);
    };

    return (
        <SettingsDialog title={t("Jumu'a")} onClose={onClose}>
            <div className="nc-choice-dialog__options" role="group">
                {choices.map((choice) => {
                    const checked = selected.includes(choice.time);
                    const own = inherited.includes(choice.time);
                    return (
                        <button
                            key={choice.time}
                            type="button"
                            role="checkbox"
                            aria-checked={checked}
                            className="nc-choice-option"
                            onClick={() => toggle(choice.time)}
                        >
                            <span className="nc-choice-option__label">
                                {choice.time}
                                <small className="nc-choice-option__note">
                                    {[
                                        ...(own ? [t("Followed mosque")] : []),
                                        ...choice.mosques,
                                    ].join(" · ")}
                                </small>
                            </span>
                            {checked && (
                                <Check
                                    size={19}
                                    className="nc-choice-option__check"
                                />
                            )}
                        </button>
                    );
                })}
            </div>
        </SettingsDialog>
    );
}
