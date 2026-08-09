import React, { useEffect, useMemo, useRef, useState } from "react";
import { folderDisplayName, isReadablePath } from "./platform/folderLabel";
import { createPortal } from "react-dom";
import { FileText, Flag, Folder, Plus, Wifi, X } from "lucide-react";
import {
    cloneFranceHolidaySource,
    parseExternalCalendarSources,
    type DesktopAutoCalendarSource,
    type DesktopIcalCalendarSource,
} from "./platform/desktopExternalCalendars";
import { t } from "../../../src/ui/i18n";

export type AddCalendarRequest =
    | { type: "local"; name: string }
    | DesktopIcalCalendarSource
    | DesktopAutoCalendarSource;

export interface AddCalendarDialogProps {
    open: boolean;
    rootFolder: string;
    existingNames: string[];
    onClose: () => void;
    onCreate: (request: AddCalendarRequest) => Promise<void>;
}

type CalendarKind = "local" | "ical" | "auto";
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
        value: "ical",
        label: t("Online subscription"),
        description: t("Read-only, from a webcal or HTTPS address."),
    },
    {
        value: "auto",
        label: t("Public holidays"),
        description: t("Read-only, worked out on the device."),
    },
];

function sourceId(): string {
    return (
        globalThis.crypto?.randomUUID?.() ??
        `source-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );
}

export default function AddCalendarDialog({
    open,
    rootFolder,
    existingNames,
    onClose,
    onCreate,
}: AddCalendarDialogProps) {
    const [kind, setKind] = useState<CalendarKind>("local");
    const [name, setName] = useState("");
    const [url, setUrl] = useState("");
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
        setUrl("");
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
            request = { type: "local", name: trimmed };
        } else if (kind === "ical") {
            const trimmedName = name.trim();
            const trimmedUrl = url.trim();
            if (!trimmedName) {
                setError(t("Enter a calendar name."));
                return;
            }
            if (duplicateName(trimmedName)) {
                setError(t("A calendar already has this name."));
                return;
            }
            if (!/^(webcal|https?):\/\//i.test(trimmedUrl)) {
                setError(
                    "Enter a webcal://, https:// or http:// calendar URL."
                );
                return;
            }
            request = {
                type: "ical",
                id: sourceId(),
                name: trimmedName,
                url: trimmedUrl,
                color,
            };
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
                                        ? "Nom du calendrier (facultatif)"
                                        : t("Calendar name")
                                }
                                autoComplete="off"
                                disabled={submitting}
                            />
                        </label>
                    ) : null}

                    {kind === "ical" && (
                        <label className="nc-add-calendar-dialog__field">
                            <span>URL du calendrier</span>
                            <input
                                ref={inputRef}
                                value={url}
                                onChange={(event) => {
                                    setUrl(event.target.value);
                                    setError(null);
                                }}
                                placeholder="webcal://… or https://…"
                                autoComplete="off"
                                disabled={submitting}
                            />
                        </label>
                    )}

                    {kind === "auto" && (
                        <>
                            <label className="nc-add-calendar-dialog__field">
                                <span>Modèle</span>
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
                                        Importer un JSON de règles
                                    </option>
                                </select>
                            </label>
                            {autoPreset === "custom" && (
                                <label className="nc-add-calendar-dialog__field">
                                    <span>JSON du calendrier</span>
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
                            <span>Couleur</span>
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
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="nc-add-calendar-dialog__primary"
                            disabled={submitting}
                        >
                            {submitting ? "Ajout…" : t("Add the calendar")}
                        </button>
                    </footer>
                </form>
            </section>
        </div>
    );

    return createPortal(content, document.body);
}
