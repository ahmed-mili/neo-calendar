import * as React from "react";
import { CheckIcon } from "../../../src/ui/calendar/Icons";
import { reminderMinutesFrom } from "../../../src/ui/calendar/reminderDelay";
import { t } from "../../../src/ui/i18n";

/**
 * Le compteur jours / heures / minutes, pour poser un délai précis d'un coup
 * (« 1 jour et 30 minutes »), et une coche qui apparaît dès qu'une part est
 * écrite. Entrée valide aussi.
 *
 * Partagé par le sous-menu du calendrier (PC) et par le dialogue (Android,
 * Paramètres) : c'est le même contrôle, aux mêmes couleurs, des deux côtés.
 */
export default function DelayCounterField({
    onAdd,
}: {
    onAdd: (minutes: number) => void;
}) {
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
                inputMode="numeric"
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
