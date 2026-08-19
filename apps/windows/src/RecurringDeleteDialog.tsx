import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { t } from "../../../src/ui/i18n";

export interface RecurringDeleteDialogProps {
    open: boolean;
    /** Words the choices as a task or as an event, as the series is one. */
    isTask: boolean;
    onClose: () => void;
    onDeleteOccurrence: () => void | Promise<void>;
    onDeleteFollowing: () => void | Promise<void>;
}

/**
 * What to delete when one date of a series is deleted. A series lives in a
 * single note, so the two answers are not the same operation at all: one takes
 * a date out of the series, the other cuts the series short — hence a choice
 * rather than a confirmation.
 */
export default function RecurringDeleteDialog({
    open,
    isTask,
    onClose,
    onDeleteOccurrence,
    onDeleteFollowing,
}: RecurringDeleteDialogProps) {
    useEffect(() => {
        if (!open) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [onClose, open]);

    if (!open) return null;

    const content = (
        <div
            className="nc-confirm-backdrop"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <section
                className="nc-confirm-dialog nc-recurring-delete"
                role="dialog"
                aria-modal="true"
                aria-labelledby="nc-recurring-delete-title"
            >
                <header>
                    <h2 id="nc-recurring-delete-title">
                        {isTask
                            ? t("Delete the recurring task")
                            : t("Delete the recurring event")}
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={t("Close")}
                    >
                        <X size={17} />
                    </button>
                </header>

                <div className="nc-recurring-delete__choices">
                    <button
                        type="button"
                        className="nc-recurring-delete__choice"
                        onClick={() => void onDeleteOccurrence()}
                    >
                        {isTask
                            ? t("Delete this task only")
                            : t("Delete this event only")}
                    </button>
                    <button
                        type="button"
                        className="nc-recurring-delete__choice"
                        onClick={() => void onDeleteFollowing()}
                    >
                        {isTask
                            ? t("Delete this task and all following")
                            : t("Delete this event and all following")}
                    </button>
                </div>

                <footer>
                    <button
                        type="button"
                        className="nc-confirm-dialog__cancel"
                        onClick={onClose}
                    >
                        {t("Cancel")}
                    </button>
                </footer>
            </section>
        </div>
    );

    if (typeof document === "undefined") return content;
    return createPortal(content, document.body);
}
