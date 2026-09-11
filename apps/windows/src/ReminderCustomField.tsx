import * as React from "react";
import {
    REMINDER_UNITS,
    ReminderDelay,
    reminderMinutesFrom,
    splitReminderDelay,
} from "../../../src/ui/calendar/reminderDelay";
import { t } from "../../../src/ui/i18n";

export interface ReminderCustomFieldProps {
    /** Le délai enregistré, ou `null` quand c'est celui de l'application qui vaut. */
    minutes: number | null;
    /** Le délai de l'application : ce dont on part pour s'en écarter. */
    fallbackMinutes: number;
    onChange: (minutes: number) => void;
}

/**
 * Un nombre et son unité, pour les délais que la liste ne propose pas.
 *
 * Partagé par le dialogue (Android, Paramètres) et par le sous-menu du
 * calendrier (PC) : c'est le même champ, avec le même brouillon.
 */
export default function ReminderCustomField({
    minutes,
    fallbackMinutes,
    onChange,
}: ReminderCustomFieldProps) {
    // Le champ s'ouvre sur le délai en cours, relu dans son unité ; à défaut
    // sur celui de l'application, qui est ce dont on part pour s'en écarter.
    const [draft, setDraft] = React.useState(() =>
        splitReminderDelay(minutes ?? fallbackMinutes)
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
        onChange(reminderMinutesFrom(next.amount, next.unit));
    };

    return (
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
            {/* Trois unités, donc trois boutons : un menu déroulant natif
                ouvrirait un popup dessiné par le système, que le thème ne sait
                pas habiller. */}
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
            <span className="nc-reminder-custom__suffix">{t("before")}</span>
        </div>
    );
}
