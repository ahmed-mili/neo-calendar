import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, X } from "lucide-react";
import { t } from "../../../src/ui/i18n";

export interface ConfirmDialogProps {
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    danger?: boolean;
    onClose: () => void;
    onConfirm: () => Promise<void> | void;
}

export default function ConfirmDialog({
    open,
    title,
    message,
    confirmLabel = t("Confirm"),
    danger = false,
    onClose,
    onConfirm,
}: ConfirmDialogProps) {
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setSubmitting(false);
        setError(null);
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [onClose, open]);

    if (!open) return null;

    const confirm = async () => {
        setSubmitting(true);
        setError(null);
        try {
            await onConfirm();
            onClose();
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
            setSubmitting(false);
        }
    };

    return createPortal(
        <div
            className="nc-confirm-backdrop"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget && !submitting)
                    onClose();
            }}
        >
            <section
                className="nc-confirm-dialog"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="nc-confirm-title"
                aria-describedby="nc-confirm-message"
            >
                <header>
                    <span className="nc-confirm-dialog__icon">
                        <AlertTriangle size={18} />
                    </span>
                    <h2 id="nc-confirm-title">{title}</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                        aria-label={t("Close")}
                    >
                        <X size={17} />
                    </button>
                </header>
                <p id="nc-confirm-message">{message}</p>
                {error && <p className="nc-confirm-dialog__error">{error}</p>}
                <footer>
                    <button
                        type="button"
                        className="nc-confirm-dialog__cancel"
                        onClick={onClose}
                        disabled={submitting}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        className={danger ? "nc-confirm-dialog__danger" : ""}
                        onClick={() => void confirm()}
                        disabled={submitting}
                    >
                        {submitting ? "Working…" : confirmLabel}
                    </button>
                </footer>
            </section>
        </div>,
        document.body
    );
}
