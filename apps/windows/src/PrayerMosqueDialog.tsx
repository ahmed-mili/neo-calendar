import * as React from "react";
import { createPortal } from "react-dom";
import {
    Bell,
    Check,
    ChevronDown,
    Clock,
    RotateCcw,
    Users,
    X,
} from "lucide-react";
import ColorPicker from "../../../src/ui/calendar/ColorPicker";
import ReminderChoiceDialog from "./ReminderChoiceDialog";
import JumuaChoiceDialog from "./JumuaChoiceDialog";
import { prayerReminderListLabel } from "../../../src/ui/calendar/reminderDelay";
import {
    PRAYER_TIMETABLES,
    jumuaChoices,
    prayerTimetableById,
} from "../../../src/ui/calendar/prayerTimetables";
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
    /** Les délais du rappel de chaque prière ; zéro est « à l'heure », vide
     *  le silence. PC seulement : le téléphone a son application de mosquée. */
    reminderMinutes: number[];
    /** Les séances de Jumu'a choisies, ou `null` quand ce sont celles de la
     *  mosquée suivie. */
    jumua: string[] | null;
    onClose: () => void;
    onChoose: (mosqueId: string | null) => void;
    /** `null` retire le réglage : les traits se remettent à suivre le
     *  calendrier au lieu de figer une copie de sa couleur du moment. */
    onColorChange: (color: string | null) => void;
    onReminderChange: (minutes: number[]) => void;
    /** `null` retire le réglage : la mosquée suivie répond de nouveau. */
    onJumuaChange: (times: string[] | null) => void;
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
    reminderMinutes,
    jumua,
    onClose,
    onChoose,
    onColorChange,
    onReminderChange,
    onJumuaChange,
}: PrayerMosqueDialogProps) {
    const swatchRef = React.useRef<HTMLButtonElement>(null);
    const [pickerAnchor, setPickerAnchor] = React.useState<DOMRect | null>(
        null
    );
    const [reminderOpen, setReminderOpen] = React.useState(false);
    const [jumuaOpen, setJumuaOpen] = React.useState(false);
    // Sans mosquée suivie il n'y a pas de vendredi à corriger : la ligne
    // n'existe pas. Sinon ses séances répondent tant que rien n'est choisi.
    const mosque = prayerTimetableById(mosqueId);
    const jumuaShown = jumua ?? mosque?.jumua ?? [];
    // Le calendrier repond tant que rien n'a ete regle : la pastille montre
    // toujours la couleur que les traits ont vraiment, pas un reglage vide.
    const shown = color ?? calendarColor;
    React.useEffect(() => {
        if (!open) return;
        // Le choix du rappel, ouvert par-dessus, prend Échap pour lui : la
        // fiche de la mosquée ne doit pas se fermer en même temps.
        if (reminderOpen || jumuaOpen) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [jumuaOpen, onClose, open, reminderOpen]);

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
                    {/* La rangee entiere ouvre le choix : sur un telephone, un
                        pave de la largeur du dialogue se vise, la pastille
                        seule non. Et un chevron, comme partout ce qui ouvre
                        quelque chose. */}
                    <button
                        type="button"
                        ref={swatchRef}
                        className="nc-prayer-dialog__swatch"
                        aria-haspopup="dialog"
                        aria-expanded={pickerAnchor !== null}
                        onClick={() =>
                            setPickerAnchor(
                                swatchRef.current?.getBoundingClientRect() ??
                                    null
                            )
                        }
                    >
                        <span className="nc-prayer-dialog__colour-label">
                            {t("Line colour")}
                        </span>
                        <span className="nc-prayer-dialog__swatch-value">
                            {/* Le trait lui-meme, a l'echelle, plutot qu'un
                                carre de couleur : ce que la grille dessinera,
                                bouts arrondis et ombre compris. */}
                            <span
                                className="nc-prayer-dialog__swatch-line"
                                style={{ background: shown }}
                            />
                            <span className="nc-prayer-dialog__swatch-hex">
                                {shown}
                            </span>
                            <ChevronDown size={14} aria-hidden="true" />
                        </span>
                    </button>
                    {color !== null && (
                        <button
                            type="button"
                            className="nc-prayer-dialog__reset"
                            data-nc-tooltip={t("Follow the calendar's colour")}
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

                {/* Le rappel se regle ici aussi, avec la mosquee et la
                    couleur : c'est le meme sujet. Pas sur le telephone, qui a
                    son application de mosquee pour sonner l'adhan. */}
                {!isAndroidRuntime() && (
                    <div className="nc-prayer-dialog__colour">
                        <button
                            type="button"
                            className="nc-prayer-dialog__swatch nc-prayer-dialog__reminder"
                            aria-haspopup="dialog"
                            aria-expanded={reminderOpen}
                            onClick={() => setReminderOpen(true)}
                        >
                            <span className="nc-prayer-dialog__colour-label">
                                <Bell size={14} aria-hidden="true" />
                                {t("Reminder")}
                            </span>
                            <span className="nc-prayer-dialog__swatch-value">
                                <span className="nc-prayer-dialog__reminder-value">
                                    {prayerReminderListLabel(reminderMinutes)}
                                </span>
                                <ChevronDown size={14} aria-hidden="true" />
                            </span>
                        </button>
                    </div>
                )}

                {/* Ou l'on fait la Jumu'a : parmi les seances des mosquees
                    enregistrees, jamais en saisie libre. */}
                {mosque && (
                    <div className="nc-prayer-dialog__colour">
                        <button
                            type="button"
                            className="nc-prayer-dialog__swatch nc-prayer-dialog__jumua"
                            aria-haspopup="dialog"
                            aria-expanded={jumuaOpen}
                            onClick={() => setJumuaOpen(true)}
                        >
                            <span className="nc-prayer-dialog__colour-label">
                                <Users size={14} aria-hidden="true" />
                                {t("Jumu'a")}
                            </span>
                            <span className="nc-prayer-dialog__swatch-value">
                                <span className="nc-prayer-dialog__reminder-value">
                                    {jumuaShown.join(" & ")}
                                </span>
                                <ChevronDown size={14} aria-hidden="true" />
                            </span>
                        </button>
                        {jumua !== null && (
                            <button
                                type="button"
                                className="nc-prayer-dialog__reset nc-prayer-dialog__jumua-reset"
                                data-nc-tooltip={t("Followed mosque")}
                                aria-label={t("Followed mosque")}
                                onClick={() => onJumuaChange(null)}
                            >
                                <RotateCcw size={14} />
                            </button>
                        )}
                    </div>
                )}

                {jumuaOpen && mosque && (
                    <JumuaChoiceDialog
                        choices={jumuaChoices()}
                        selected={jumuaShown}
                        inherited={mosque.jumua}
                        onPick={onJumuaChange}
                        onClose={() => setJumuaOpen(false)}
                    />
                )}

                {reminderOpen && (
                    <ReminderChoiceDialog
                        mode="prayer"
                        title={`${t("Reminder")} — ${t("Prayer times")}`}
                        minutes={reminderMinutes}
                        onPick={onReminderChange}
                        onClose={() => setReminderOpen(false)}
                    />
                )}

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
