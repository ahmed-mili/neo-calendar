import * as React from "react";
import { createPortal } from "react-dom";
import { Check, Clock, X } from "lucide-react";
import { PRAYER_TIMETABLES } from "../../../src/ui/calendar/prayerTimetables";
import { isAndroidRuntime } from "../../../src/ui/calendar/CalendarUtils";
import { t } from "../../../src/ui/i18n";

export interface PrayerMosqueDialogProps {
    open: boolean;
    /** Le calendrier dont on règle les horaires, pour le nommer dans le titre. */
    calendarName: string;
    /** La mosquée choisie, ou `null` quand ce calendrier n'en suit aucune. */
    mosqueId: string | null;
    onClose: () => void;
    onChoose: (mosqueId: string | null) => void;
}

/**
 * De quelle mosquée un calendrier suit les horaires.
 *
 * Une liste, pas un menu déroulant : les mosquées se choisissent par leur nom
 * et il y en a trois, donc les cacher derrière un clic ne gagnerait rien. Le
 * premier choix est « aucune », parce que c'est l'état de tous les calendriers
 * sauf un et qu'il faut pouvoir y revenir.
 *
 * Chaque table est le calendrier annuel que la mosquée publie, importé tel
 * quel : l'année qu'elle couvre est affichée, faute de quoi on ne saurait pas
 * qu'un 1er janvier sans traits est une année à réimporter et non une panne.
 */
export default function PrayerMosqueDialog({
    open,
    calendarName,
    mosqueId,
    onClose,
    onChoose,
}: PrayerMosqueDialogProps) {
    React.useEffect(() => {
        if (!open) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [onClose, open]);

    if (!open) return null;

    const rows: Array<{ id: string | null; name: string; note: string }> = [
        {
            id: null,
            name: t("No prayer times"),
            note: t("This calendar shows nothing of the prayers."),
        },
        ...PRAYER_TIMETABLES.map((timetable) => ({
            id: timetable.id,
            name: timetable.name,
            note: `${t("Timetable")} ${timetable.year} · ${t(
                "Jumu'a"
            )} ${timetable.jumua.join(" & ")}`,
        })),
    ];

    const content = (
        <div
            className="nc-prayer-backdrop"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <section
                className="nc-prayer-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="nc-prayer-dialog-title"
            >
                <header className="nc-prayer-dialog__header">
                    <span className="nc-prayer-dialog__icon">
                        <Clock size={16} />
                    </span>
                    <h2 id="nc-prayer-dialog-title">
                        {t("Prayer times")} — {calendarName}
                    </h2>
                    <button
                        type="button"
                        className="nc-prayer-dialog__close"
                        onClick={onClose}
                        aria-label={t("Close")}
                    >
                        <X size={16} />
                    </button>
                </header>

                <div
                    className="nc-prayer-dialog__list"
                    role="radiogroup"
                    aria-label={t("Prayer times")}
                >
                    {rows.map((row) => {
                        const selected = row.id === mosqueId;
                        return (
                            <button
                                key={row.id ?? "none"}
                                type="button"
                                role="radio"
                                aria-checked={selected}
                                className={`nc-prayer-dialog__option${
                                    selected ? " is-selected" : ""
                                }`}
                                onClick={() => {
                                    onChoose(row.id);
                                    onClose();
                                }}
                            >
                                <span className="nc-prayer-dialog__option-text">
                                    <strong>{row.name}</strong>
                                    <span>{row.note}</span>
                                </span>
                                {selected && (
                                    <span className="nc-prayer-dialog__mark">
                                        <Check size={15} />
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* La seconde phrase parle d'une touche a tenir : elle
                    n'a rien a faire sur un telephone, qui n'en a pas et ou
                    seule la prochaine priere est marquee. */}
                <p className="nc-prayer-dialog__hint">
                    {isAndroidRuntime()
                        ? t(
                              "A line marks the next prayer, in this calendar's colour."
                          )
                        : t(
                              "A line marks the next prayer, in this calendar's colour. Hold P to see the whole day's."
                          )}
                </p>
            </section>
        </div>
    );

    return createPortal(content, document.body);
}
