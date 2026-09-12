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
    editable: boolean;
    /** Les liens déjà là, pour ne pas en écrire deux fois le même. */
    items: readonly DescriptionLinkItem[];
    /** Écrit le lien dans la description, là où le curseur était. */
    onInsert?: (markdown: string) => void;
}

function markdownTarget(markdown: string): string | null {
    return /\]\((.*)\)\s*$/.exec(markdown.trim())?.[1]?.trim() || null;
}

function escapeMarkdownLabel(value: string): string {
    return value.replace(/\\/g, "\\\\").replace(/\]/g, "\\]");
}

export function DescriptionAddLinkDialog({
    hostRef,
    editable,
    items,
    onInsert,
}: DescriptionAddLinkDialogProps) {
    const [open, setOpen] = React.useState(false);
    const [label, setLabel] = React.useState("");
    const [target, setTarget] = React.useState("");
    const [error, setError] = React.useState<string | null>(null);
    const labelRef = React.useRef<HTMLInputElement>(null);

    const close = React.useCallback(() => {
        setOpen(false);
        setError(null);
    }, []);

    React.useEffect(() => {
        const host = hostRef.current;
        if (!host) return;
        const show = () => {
            if (!editable || !onInsert) return;
            setLabel("");
            setTarget("");
            setError(null);
            setOpen(true);
        };
        host.addEventListener(OPEN_DESCRIPTION_LINK_DIALOG_EVENT, show);
        return () =>
            host.removeEventListener(OPEN_DESCRIPTION_LINK_DIALOG_EVENT, show);
    }, [editable, hostRef, onInsert]);

    React.useEffect(() => {
        if (!open) return;
        const timer = window.setTimeout(() => labelRef.current?.focus(), 0);
        return () => window.clearTimeout(timer);
    }, [open]);

    /* Un appui hors de la fenêtre la referme, comme la croix. */
    React.useEffect(() => {
        if (!open) return;
        const press = (event: PointerEvent) => {
            const node = event.target;
            if (
                node instanceof Element &&
                node.closest(".nc-description-add-link-dialog")
            ) {
                return;
            }
            close();
        };
        document.addEventListener("pointerdown", press);
        return () => document.removeEventListener("pointerdown", press);
    }, [open, close]);

    const confirm = () => {
        if (!onInsert) return;
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
        onInsert(`[${escapeMarkdownLabel(visibleLabel)}](${destination})`);
        setOpen(false);
        setLabel("");
        setTarget("");
        setError(null);
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
                    confirm();
                }
            }}
        >
            <div className="nc-description-link-dialog-head">
                <strong>{t("Add Link")}</strong>
                <button
                    type="button"
                    className="nc-description-link-dialog-close"
                    aria-label={t("Close")}
                    data-nc-tooltip={t("Close")}
                    onClick={close}
                >
                    <XIcon />
                </button>
            </div>
            <input
                ref={labelRef}
                value={label}
                aria-label={t("Link text")}
                placeholder={t("Link text")}
                onChange={(event) => setLabel(event.target.value)}
            />
            <input
                value={target}
                aria-label={t("Link")}
                placeholder={t("Link")}
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
                    disabled={!target.trim()}
                    onClick={confirm}
                >
                    {t("Confirm")}
                </button>
            </div>
        </div>,
        document.body
    );
}
