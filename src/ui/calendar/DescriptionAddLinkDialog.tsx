import * as React from "react";
import * as ReactDOM from "react-dom";
import { XIcon } from "./EventPanelIcons";
import { labelFor, sameTarget, urlMarkdown } from "./linkInput";
import { OPEN_DESCRIPTION_LINK_DIALOG_EVENT } from "./descriptionLinkShortcut";
import { t } from "../i18n";

interface DescriptionLinkItem {
    target: string;
}

interface DescriptionAddLinkDialogProps {
    hostRef: React.RefObject<HTMLDivElement>;
    eventId: string | null;
    editable: boolean;
    items: readonly DescriptionLinkItem[];
    onAddLink?: (eventId: string, markdown: string) => Promise<void>;
}

function markdownTarget(markdown: string): string | null {
    return /\]\((.*)\)\s*$/.exec(markdown.trim())?.[1]?.trim() || null;
}

function escapeMarkdownLabel(value: string): string {
    return value.replace(/\\/g, "\\\\").replace(/\]/g, "\\]");
}

export function DescriptionAddLinkDialog({
    hostRef,
    eventId,
    editable,
    items,
    onAddLink,
}: DescriptionAddLinkDialogProps) {
    const [open, setOpen] = React.useState(false);
    const [label, setLabel] = React.useState("");
    const [target, setTarget] = React.useState("");
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const labelRef = React.useRef<HTMLInputElement>(null);

    const close = React.useCallback(() => {
        if (saving) return;
        setOpen(false);
        setError(null);
    }, [saving]);

    React.useEffect(() => {
        const host = hostRef.current;
        if (!host) return;
        const show = () => {
            if (!editable || !eventId || !onAddLink || saving) return;
            setLabel("");
            setTarget("");
            setError(null);
            setOpen(true);
        };
        host.addEventListener(OPEN_DESCRIPTION_LINK_DIALOG_EVENT, show);
        return () =>
            host.removeEventListener(OPEN_DESCRIPTION_LINK_DIALOG_EVENT, show);
    }, [editable, eventId, hostRef, onAddLink, saving]);

    React.useEffect(() => {
        if (!open) return;
        const timer = window.setTimeout(() => labelRef.current?.focus(), 0);
        return () => window.clearTimeout(timer);
    }, [open]);

    const confirm = async () => {
        if (!eventId || !onAddLink || saving) return;
        const normalized = urlMarkdown(target);
        const destination = normalized ? markdownTarget(normalized) : null;
        if (!destination) {
            setError(t("That does not look like a link"));
            return;
        }
        if (items.some((item) => sameTarget(item.target, destination))) {
            setError(t("This link is already here"));
            return;
        }

        const visibleLabel = label.trim() || labelFor(destination);
        const markdown = `[${escapeMarkdownLabel(visibleLabel)}](${destination})`;
        setSaving(true);
        setError(null);
        try {
            await onAddLink(eventId, markdown);
            setOpen(false);
            setLabel("");
            setTarget("");
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            setSaving(false);
        }
    };

    if (!open) return null;

    return ReactDOM.createPortal(
        <div
            className="nc-description-link-dialog nc-description-add-link-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={t("Add Link")}
            data-nc-popup-portal="true"
            style={{
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
            }}
            onKeyDown={(event) => {
                if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    close();
                } else if (event.key === "Enter") {
                    event.preventDefault();
                    event.stopPropagation();
                    void confirm();
                }
            }}
        >
            <div className="nc-description-link-dialog-head">
                <strong>{t("Add Link")}</strong>
                <button
                    type="button"
                    className="nc-description-link-dialog-close"
                    aria-label={t("Close")}
                    title={t("Close")}
                    disabled={saving}
                    onClick={close}
                >
                    <XIcon size={15} />
                </button>
            </div>
            <input
                ref={labelRef}
                value={label}
                aria-label={t("Link text")}
                placeholder={t("Link text")}
                disabled={saving}
                onChange={(event) => setLabel(event.target.value)}
            />
            <input
                value={target}
                aria-label={t("Link")}
                placeholder={t("Link")}
                disabled={saving}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                onChange={(event) => setTarget(event.target.value)}
            />
            {error && (
                <div className="nc-description-link-dialog-error" role="alert">
                    {error}
                </div>
            )}
            <div
                className="nc-description-link-dialog-actions"
                style={{ justifyContent: "flex-end" }}
            >
                <button
                    type="button"
                    className="nc-description-link-confirm"
                    disabled={saving || !target.trim()}
                    onClick={() => void confirm()}
                >
                    {t("Confirm")}
                </button>
            </div>
        </div>,
        document.body
    );
}
