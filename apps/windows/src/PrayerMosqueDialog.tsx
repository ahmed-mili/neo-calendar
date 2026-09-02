import * as React from "react";
import { createPortal } from "react-dom";
import { Check, Clock, RotateCcw, X } from "lucide-react";
import ColorPicker from "../../../src/ui/calendar/ColorPicker";
import { PRAYER_TIMETABLES } from "../../../src/ui/calendar/prayerTimetables";
import { isAndroidRuntime } from "../../../src/ui/calendar/CalendarUtils";
import { t } from "../../../src/ui/i18n";

export interface PrayerMosqueDialogProps {
    open: boolean;
    /** Le calendrier dont on règle les horaires, pour le nommer dans le titre. */
    calendarName: string;
    /** La mosquée choisie, ou `null` quand ce calendrier n'en suit aucune. */
    mosqueId: string | null;
    /** La couleur réglée pour les traits, ou `null` tant que personne n'y a
     *  touché — auquel cas c'est celle du calendrier qui s'affiche. */
    color: string | null;
    /** Celle du calendrier, qui sert de réponse par défaut et de retour. */
    calendarColor: string;
    onClose: () => void;
    onChoose: (mosqueId: string | null) => void;
    /** `null` retire le réglage : les traits se remettent à suivre le
     *  calendrier au lieu de figer une copie de sa couleur du moment. */
    onColorChange: (color: string | null) => void;
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
    color,
    calendarColor,
    onClose,
    onChoose,
    onColorChange,
}: PrayerMosqueDialogProps) {
    const swatchRef = React.useRef<HTMLButtonElement>(null);
    const [pickerAnchor, setPickerAnchor] = React.useState<DOMRect | null>(
        null
    );
    // Le calendrier repond tant que rien n'a ete regle : la pastille montre
    // toujours la couleur que les traits ont vraiment, pas un reglage vide.
    const shown = color ?? calendarColor;
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

                {/* La couleur des traits se regle ici, avec la mosquee :
                    c'est le meme sujet, et un vert fonce qui se lit dans une
                    pastille de barre laterale se perd en trait de deux pixels
                    par-dessus un fond d'ecran. */}
                <div className="nc-prayer-dialog__colour">
                    <span className="nc-prayer-dialog__colour-label">
                        {t("Line colour")}
                    </span>
                    <button
                        type="button"
                        ref={swatchRef}
                        className="nc-prayer-dialog__swatch"
                        aria-label={t("Line colour")}
                        onClick={() =>
                            setPickerAnchor(
                                swatchRef.current?.getBoundingClientRect() ??
                                    null
                            )
                        }
                    >
                        {/* Le trait lui-meme, a l'echelle, plutot qu'un carre
                            de couleur : la pastille montre ce que la grille
                            dessinera, bouts arrondis compris. */}
                        <span
                            className="nc-prayer-dialog__swatch-line"
                            style={{ background: shown }}
                        />
                        <span aria-hidden="true">{shown}</span>
                    </button>
                    {color !== null && (
                        <button
                            type="button"
                            className="nc-prayer-dialog__reset"
                            title={t("Follow the calendar's colour")}
                            aria-label={t("Follow the calendar's colour")}
                            onClick={() => {
                                setPickerAnchor(null);
                                onColorChange(null);
                            }}
                        >
                            <RotateCcw size={14} />
                        </button>
                    )}
                </div>

                {pickerAnchor && (
                    <ColorPicker
                        color={shown}
                        anchorRect={pickerAnchor}
                        onChange={onColorChange}
                        onClose={() => setPickerAnchor(null)}
                    />
                )}

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
