import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, Flag, Folder, Plus, Wifi, X } from "lucide-react";
import {
    cloneFranceHolidaySource,
    parseExternalCalendarSources,
    type DesktopAutoCalendarSource,
    type DesktopIcalCalendarSource,
} from "./platform/desktopExternalCalendars";

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
        label: "Full note",
        description: "Each event is stored as a Markdown file.",
    },
    {
        value: "ical",
        label: "Remote (.ics format)",
        description: "Read-only subscription from a webcal or HTTPS URL.",
    },
    {
        value: "auto",
        label: "Auto (public holidays)",
        description: "Read-only events computed locally from calendar rules.",
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

    const selectedType = useMemo(
        () => TYPE_OPTIONS.find((item) => item.value === kind)!,
        [kind]
    );

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
                setError("Enter a calendar name.");
                return;
            }
            if (/[\\/]/.test(trimmed) || trimmed === "." || trimmed === "..") {
                setError("The name cannot contain / or \\.");
                return;
            }
            if (duplicateName(trimmed)) {
                setError("A calendar with this name already exists.");
                return;
            }
            request = { type: "local", name: trimmed };
        } else if (kind === "ical") {
            const trimmedName = name.trim();
            const trimmedUrl = url.trim();
            if (!trimmedName) {
                setError("Enter a calendar name.");
                return;
            }
            if (duplicateName(trimmedName)) {
                setError("A calendar with this name already exists.");
                return;
            }
            if (!/^(webcal|https?):\/\//i.test(trimmedUrl)) {
                setError("Enter a webcal://, https:// or http:// calendar URL.");
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
                setError("A calendar with this name already exists.");
                return;
            }
            request = source;
        } else {
            let parsed: unknown;
            try {
                parsed = JSON.parse(customJson);
            } catch {
                setError("The custom calendar JSON is invalid.");
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
                setError("The JSON must contain id, name and a valid rules array.");
                return;
            }
            if (duplicateName(source.name)) {
                setError("A calendar with this name already exists.");
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

    const TypeIcon =
        kind === "local" ? FileText : kind === "ical" ? Wifi : Flag;

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
                    <span className="nc-add-calendar-dialog__tag">Calendar</span>
                    <button
                        type="button"
                        className="nc-add-calendar-dialog__close"
                        onClick={onClose}
                        disabled={submitting}
                        aria-label="Close"
                    >
                        <X size={18} />
                    </button>
                </header>

                <div className="nc-add-calendar-dialog__root">
                    <Folder size={18} />
                    <div>
                        <strong>{rootFolder.split(/[\\/]/).pop() || rootFolder}</strong>
                        <span>{rootFolder}</span>
                    </div>
                </div>

                <form onSubmit={submit}>
                    <label className="nc-add-calendar-dialog__field">
                        <span>Calendar type</span>
                        <select
                            value={kind}
                            onChange={(event) => {
                                setKind(event.target.value as CalendarKind);
                                setError(null);
                            }}
                            disabled={submitting}
                        >
                            {TYPE_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </label>

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
                                        ? "Optional custom calendar name"
                                        : "Calendar name"
                                }
                                autoComplete="off"
                                disabled={submitting}
                            />
                        </label>
                    ) : null}

                    {kind === "ical" && (
                        <label className="nc-add-calendar-dialog__field">
                            <span>Calendar URL</span>
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
                                <span>Preset</span>
                                <select
                                    value={autoPreset}
                                    onChange={(event) => {
                                        setAutoPreset(event.target.value as AutoPreset);
                                        setError(null);
                                    }}
                                >
                                    <option value="FR">France</option>
                                    <option value="custom">Import rules JSON</option>
                                </select>
                            </label>
                            {autoPreset === "custom" && (
                                <label className="nc-add-calendar-dialog__field">
                                    <span>Calendar JSON</span>
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
                            <span>Color</span>
                            <input
                                type="color"
                                value={color}
                                onChange={(event) => setColor(event.target.value)}
                            />
                            <code>{color}</code>
                        </label>
                    )}

                    <div className="nc-add-calendar-dialog__type">
                        <TypeIcon size={16} />
                        <div>
                            <strong>{selectedType.label}</strong>
                            <span>{selectedType.description}</span>
                        </div>
                    </div>

                    {error && (
                        <p className="nc-add-calendar-dialog__error" role="alert">
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
                            {submitting ? "Adding…" : "Add calendar"}
                        </button>
                    </footer>
                </form>
            </section>
        </div>
    );

    return createPortal(content, document.body);
}
