import React, { useEffect, useMemo, useRef, useState } from "react";
import { folderDisplayName, isReadablePath } from "./platform/folderLabel";
import { createPortal } from "react-dom";
import { FileText, Flag, Folder, Link2, Plus, X } from "lucide-react";
import {
    cloneFranceHolidaySource,
    parseExternalCalendarSources,
    type DesktopAutoCalendarSource,
} from "./platform/desktopExternalCalendars";
import { normalizeIcsUrl } from "./platform/icsFeedPreferences";
import { t } from "../../../src/ui/i18n";

export type AddCalendarRequest =
    /** `icsUrl` : le premier lien ICS du calendrier, pose dans la foulee.
     *  Un lien ICS n'est pas un type de calendrier — il vit DANS un calendrier
     *  de notes (c'est ce que la 1.57.0 a tranche en retirant la carte
     *  « Abonnement en ligne ») — mais il fallait jusqu'ici creer le
     *  calendrier, le trouver dans la barre laterale, ouvrir son menu a trois
     *  points et y demander « Liens ICS » pour arriver a l'ajouter. Le
     *  proposer ici ne change pas le modele, seulement le nombre d'endroits
     *  ou il faut passer. */
    | { type: "local"; name: string; icsUrl?: string }
    | DesktopAutoCalendarSource;

export interface AddCalendarDialogProps {
    open: boolean;
    rootFolder: string;
    existingNames: string[];
    onClose: () => void;
    onCreate: (request: AddCalendarRequest) => Promise<void>;
}

type CalendarKind = "local" | "auto";
type AutoPreset = "FR" | "custom";

const TYPE_OPTIONS: Array<{
    value: CalendarKind;
    label: string;
    description: string;
}> = [
    {
        value: "local",
        label: t("Notes folder"),
        description: t("One Markdown file per event, in a folder you pick."),
    },
    {
        value: "auto",
        label: t("Public holidays"),
        description: t("Read-only, worked out on the device."),
    },
];

export default function AddCalendarDialog({
    open,
    rootFolder,
    existingNames,
    onClose,
    onCreate,
}: AddCalendarDialogProps) {
    const [kind, setKind] = useState<CalendarKind>("local");
    const [name, setName] = useState("");
    const [icsUrl, setIcsUrl] = useState("");
    const [color, setColor] = useState("#3264ff");
    const [autoPreset, setAutoPreset] = useState<AutoPreset>("FR");
    const [customJson, setCustomJson] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!open) return;
        setKind("local");
        setName("");
        setIcsUrl("");
        setColor("#3264ff");
        setAutoPreset("FR");
        setCustomJson("");
        setError(null);
        setSubmitting(false);
        const frame = requestAnimationFrame(() => inputRef.current?.focus());
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener("keydown", onKeyDown);
        };
    }, [onClose, open]);

    if (!open) return null;

    const duplicateName = (candidate: string) =>
        existingNames.some(
            (existing) =>
                existing.toLocaleLowerCase() === candidate.toLocaleLowerCase()
        );

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError(null);

        let request: AddCalendarRequest;
        if (kind === "local") {
            const trimmed = name.trim();
            if (!trimmed) {
                setError(t("Enter a calendar name."));
                return;
            }
            if (/[\\/]/.test(trimmed) || trimmed === "." || trimmed === "..") {
                setError("The name cannot contain / or \\.");
                return;
            }
            if (duplicateName(trimmed)) {
                setError(t("A calendar already has this name."));
                return;
            }
            // Le champ est facultatif : vide, il ne pose aucun lien. Rempli, il
            // doit etre une adresse que la synchro saura suivre — la refuser
            // ici vaut mieux que creer le calendrier et laisser le lien
            // echouer en silence a chaque cycle.
            const typedUrl = icsUrl.trim();
            if (typedUrl) {
                const normalized = normalizeIcsUrl(typedUrl);
                if (!normalized) {
                    setError(t("Enter a valid HTTPS or webcal address."));
                    return;
                }
                request = { type: "local", name: trimmed, icsUrl: normalized };
            } else {
                request = { type: "local", name: trimmed };
            }
        } else if (autoPreset === "FR") {
            const source = cloneFranceHolidaySource();
            const trimmedName = name.trim();
            if (trimmedName) source.name = trimmedName;
            source.color = color === "#3264ff" ? source.color : color;
            if (duplicateName(source.name)) {
                setError(t("A calendar already has this name."));
                return;
            }
            request = source;
        } else {
            let parsed: unknown;
            try {
                parsed = JSON.parse(customJson);
            } catch {
                setError(t("The custom calendar JSON is invalid."));
                return;
            }
            const source = parseExternalCalendarSources([
                {
                    ...(parsed as Record<string, unknown>),
                    type: "auto",
                    color,
                },
            ])[0];
            if (!source || source.type !== "auto") {
                setError(
                    t("The JSON must contain id, name and a valid rules array.")
                );
                return;
            }
            if (duplicateName(source.name)) {
                setError(t("A calendar already has this name."));
                return;
            }
            request = source;
        }

        setSubmitting(true);
        try {
            await onCreate(request);
            onClose();
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
            setSubmitting(false);
        }
    };

    const content = (
        <div
            className="nc-add-calendar-backdrop"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <section
                className="nc-add-calendar-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="nc-add-calendar-title"
            >
                <header className="nc-add-calendar-dialog__header">
                    <span className="nc-add-calendar-dialog__tag">
                        Calendrier
                    </span>
                    <button
                        type="button"
                        className="nc-add-calendar-dialog__close"
                        onClick={onClose}
                        disabled={submitting}
                        aria-label={t("Close")}
                    >
                        <X size={18} />
                    </button>
                </header>

                <div className="nc-add-calendar-dialog__root">
                    <Folder size={18} />
                    <div>
                        <strong>{folderDisplayName(rootFolder)}</strong>
                        {/* A content:// handle says nothing you could act on;
                            printing it only makes the dialog look broken. */}
                        {isReadablePath(rootFolder) && (
                            <span>{rootFolder}</span>
                        )}
                    </div>
                </div>

                <form onSubmit={submit}>
                    {/* Cards rather than a dropdown. A dropdown hides two of
                        the three answers behind a tap, and this is the one
                        decision in the dialog that changes what everything
                        below it means — so all three say what they are, side
                        by side. It also drops the native select, the one piece
                        of OS chrome in an otherwise themed dialog. */}
                    <div
                        className="nc-add-calendar-dialog__types"
                        role="radiogroup"
                        aria-label={t("Calendar type")}
                    >
                        {TYPE_OPTIONS.map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                role="radio"
                                aria-checked={kind === option.value}
                                className={`nc-add-calendar-dialog__type-card${
                                    kind === option.value ? " is-selected" : ""
                                }`}
                                disabled={submitting}
                                onClick={() => {
                                    setKind(option.value);
                                    setError(null);
                                }}
                            >
                                <strong>{option.label}</strong>
                                <span>{option.description}</span>
                            </button>
                        ))}
                    </div>

                    {kind !== "auto" || autoPreset === "FR" ? (
                        <label className="nc-add-calendar-dialog__input-row">
                            <Plus size={18} />
                            <input
                                ref={inputRef}
                                value={name}
                                onChange={(event) => {
                                    setName(event.target.value);
                                    setError(null);
                                }}
                                placeholder={
                                    kind === "auto"
                                        ? t("Calendar name (optional)")
                                        : t("Calendar name")
                                }
                                autoComplete="off"
                                disabled={submitting}
                            />
                        </label>
                    ) : null}

                    {/* Le premier lien ICS, la ou l'on cree le calendrier qui
                        va le recevoir. Facultatif, et dit comme tel : la
                        plupart des calendriers n'en ont aucun. La note qui
                        suit dit ou retrouver les liens ensuite, seul endroit
                        d'ou on peut en ajouter d'autres, en changer la
                        frequence ou les retirer. */}
                    {kind === "local" && (
                        <div className="nc-add-calendar-dialog__ics">
                            <label className="nc-add-calendar-dialog__input-row">
                                <Link2 size={18} />
                                <input
                                    name="calendar-ics-url"
                                    value={icsUrl}
                                    onChange={(event) => {
                                        setIcsUrl(event.target.value);
                                        setError(null);
                                    }}
                                    /* Court : sur un telephone, la place d'un
                                       libelle de champ s'arrete a une trentaine
                                       de caracteres, et « webcal:// » se
                                       retrouvait coupe en deux. Le format est
                                       dit juste en dessous. */
                                    placeholder={t("ICS link (optional)")}
                                    autoComplete="off"
                                    inputMode="url"
                                    spellCheck={false}
                                    disabled={submitting}
                                />
                            </label>
                            <p className="nc-add-calendar-dialog__hint">
                                {t(
                                    "An https:// or webcal:// address. Its events are synchronised into this calendar and stay read-only. To add, change or remove links later: three-dot menu of the calendar, “ICS links”."
                                )}
                            </p>
                        </div>
                    )}

                    {kind === "auto" && (
                        <>
                            <label className="nc-add-calendar-dialog__field">
                                <span>{t("Preset")}</span>
                                <select
                                    value={autoPreset}
                                    onChange={(event) => {
                                        setAutoPreset(
                                            event.target.value as AutoPreset
                                        );
                                        setError(null);
                                    }}
                                >
                                    <option value="FR">France</option>
                                    <option value="custom">
                                        {t("Import a rules JSON")}
                                    </option>
                                </select>
                            </label>
                            {autoPreset === "custom" && (
                                <label className="nc-add-calendar-dialog__field">
                                    <span>{t("Calendar JSON")}</span>
                                    <textarea
                                        value={customJson}
                                        onChange={(event) => {
                                            setCustomJson(event.target.value);
                                            setError(null);
                                        }}
                                        placeholder='{"id":"custom","name":"My holidays","icon":"flag","rules":[…]}'
                                        rows={7}
                                    />
                                </label>
                            )}
                        </>
                    )}

                    {kind !== "local" && (
                        <label className="nc-add-calendar-dialog__color">
                            <span>{t("Colour")}</span>
                            <input
                                type="color"
                                value={color}
                                onChange={(event) =>
                                    setColor(event.target.value)
                                }
                            />
                            <code>{color}</code>
                        </label>
                    )}

                    {error && (
                        <p
                            className="nc-add-calendar-dialog__error"
                            role="alert"
                        >
                            {error}
                        </p>
                    )}

                    <footer className="nc-add-calendar-dialog__footer">
                        <button
                            type="button"
                            className="nc-add-calendar-dialog__secondary"
                            onClick={onClose}
                            disabled={submitting}
                        >
                            {/* Le seul mot anglais du dialogue, a cote de
                                « Ajouter le calendrier » : la traduction
                                existait deja. */}
                            {t("Cancel")}
                        </button>
                        <button
                            type="submit"
                            className="nc-add-calendar-dialog__primary"
                            disabled={submitting}
                        >
                            {submitting ? t("Adding…") : t("Add the calendar")}
                        </button>
                    </footer>
                </form>
            </section>
        </div>
    );

    return createPortal(content, document.body);
}
